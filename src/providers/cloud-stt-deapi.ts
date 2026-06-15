import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ensureSafeCloudHttpProtocol, isLoopbackOrPrivateHost } from "../core/url-security";
import {
  extractTranscript,
  parseBodyAsUnknown,
  summarizePayload
} from "./response-utils";

const DEAPI_AUDIOFILE_HOST = "api.deapi.ai";
const DEAPI_AUDIOFILE_PATH_SUFFIX = "/audiofile2txt";
const DEAPI_CLIENT_PATH_PREFIX = "/api/v1/client/";
const DEAPI_REQUEST_STATUS_PATH = "/api/v1/client/request-status/";
const DEAPI_POLL_INTERVAL_MS = 1200;
const DEAPI_POLL_TIMEOUT_MS = 120000;
const DEAPI_POLL_FETCH_TIMEOUT_MS = 15000;

const execFileAsync = promisify(execFile);

export const DEAPI_MIME_FALLBACK_EXTENSIONS = new Set([".wav", ".webm"]);

export type DeapiCompatTranscoder = (
  audioPath: string,
  sourceFileName: string
) => Promise<{ audioBytes: Buffer; fileName: string }>;

export function isDeapiAudiofileEndpoint(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  const pathname = url.pathname.toLowerCase();
  return host === DEAPI_AUDIOFILE_HOST && pathname.endsWith(DEAPI_AUDIOFILE_PATH_SUFFIX);
}

export function isDeapiClientEndpoint(url: URL): boolean {
  return (
    url.hostname.toLowerCase() === DEAPI_AUDIOFILE_HOST &&
    url.pathname.toLowerCase().startsWith(DEAPI_CLIENT_PATH_PREFIX)
  );
}

function payloadContainsAudioTypeValidation(payload: unknown): boolean {
  const text =
    typeof payload === "string"
      ? payload
      : (() => {
          try {
            return JSON.stringify(payload);
          } catch {
            return String(payload);
          }
        })();

  return /audio field must be a file of type/i.test(text);
}

export function shouldRetryDeapiAudioTypeValidation(
  response: Response,
  payload: unknown,
  url: URL,
  bodyFormat: "formdata" | "binary"
): boolean {
  return (
    bodyFormat === "formdata" &&
    response.status === 422 &&
    isDeapiAudiofileEndpoint(url) &&
    payloadContainsAudioTypeValidation(payload)
  );
}

export function normalizeDeapiBooleanFormValue(
  fieldName: string,
  value: string,
  url: URL
): string {
  if (!isDeapiClientEndpoint(url)) {
    return value;
  }

  const normalizedField = fieldName.trim().toLowerCase();
  if (normalizedField !== "include_ts" && normalizedField !== "return_result_in_response") {
    return value;
  }

  const normalizedValue = value.trim().toLowerCase();
  if (
    normalizedValue === "true" ||
    normalizedValue === "1" ||
    normalizedValue === "yes" ||
    normalizedValue === "on"
  ) {
    return "1";
  }

  if (
    normalizedValue === "false" ||
    normalizedValue === "0" ||
    normalizedValue === "no" ||
    normalizedValue === "off"
  ) {
    return "0";
  }

  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function extractDeapiRequestId(payload: unknown): string {
  const root = asRecord(payload);
  if (!root) {
    return "";
  }
  const data = asRecord(root.data);
  if (!data) {
    return "";
  }
  return typeof data.request_id === "string" ? data.request_id : "";
}

function extractDeapiStatus(payload: unknown): string {
  const root = asRecord(payload);
  if (!root) {
    return "";
  }
  const data = asRecord(root.data);
  if (!data) {
    return "";
  }
  return typeof data.status === "string" ? data.status.toLowerCase() : "";
}

function extractDeapiResultUrl(payload: unknown): string {
  const root = asRecord(payload);
  if (!root) {
    return "";
  }
  const data = asRecord(root.data);
  if (!data) {
    return "";
  }
  return typeof data.result_url === "string" ? data.result_url : "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveSafeDeapiResultUrl(raw: string, apiUrl: URL): URL {
  const parsed = new URL(raw, apiUrl.origin);
  ensureSafeCloudHttpProtocol(parsed, "deAPI result_url");
  if (isLoopbackOrPrivateHost(parsed.hostname)) {
    throw new Error("Cloud STT (deapi) blocked unsafe result_url host.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("deAPI result_url must use https.");
  }
  return parsed;
}

async function fetchWithTimeout(
  input: URL | string,
  init: RequestInit,
  timeoutMs: number,
  label: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
      redirect: "error"
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${label} timeout after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function pollDeapiTranscript(
  apiUrl: URL,
  headers: Headers,
  requestId: string,
  hints: string[],
  preset: string
): Promise<string> {
  const statusUrl = new URL(
    `${DEAPI_REQUEST_STATUS_PATH}${encodeURIComponent(requestId)}`,
    apiUrl.origin
  );
  const deadline = Date.now() + DEAPI_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const response = await fetchWithTimeout(
      statusUrl,
      {
        method: "GET",
        headers
      },
      DEAPI_POLL_FETCH_TIMEOUT_MS,
      `Cloud STT (${preset}) request-status`
    );
    const payload = await parseBodyAsUnknown(response);

    if (!response.ok) {
      throw new Error(
        `Cloud STT (${preset}) request-status ${response.status}: ${summarizePayload(payload)}`
      );
    }

    const transcript = extractTranscript(payload, hints);
    if (transcript) {
      return transcript;
    }

    const status = extractDeapiStatus(payload);
    if (
      status === "failed" ||
      status === "error" ||
      status === "cancelled" ||
      status === "canceled"
    ) {
      throw new Error(
        `Cloud STT (${preset}) request ${requestId} failed: ${summarizePayload(payload)}`
      );
    }

    if (status === "done") {
      const resultUrl = extractDeapiResultUrl(payload);
      if (!resultUrl) {
        throw new Error(
          `Cloud STT (${preset}) request ${requestId} done without transcript/result_url. payload=${summarizePayload(payload)}`
        );
      }

      const parsedResultUrl = resolveSafeDeapiResultUrl(resultUrl, apiUrl);
      const resultResponse = await fetchWithTimeout(
        parsedResultUrl,
        { method: "GET" },
        DEAPI_POLL_FETCH_TIMEOUT_MS,
        `Cloud STT (${preset}) result_url`
      );
      const resultText = (await resultResponse.text()).trim();
      if (!resultResponse.ok || !resultText) {
        throw new Error(
          `Cloud STT (${preset}) request ${requestId} result_url failed (${resultResponse.status}).`
        );
      }
      return resultText;
    }

    await sleep(DEAPI_POLL_INTERVAL_MS);
  }

  throw new Error(
    `Cloud STT (${preset}) request ${requestId} timeout while waiting for request-status.`
  );
}

export async function transcodeToMp3ForDeapi(
  audioPath: string,
  sourceFileName: string
): Promise<{ audioBytes: Buffer; fileName: string }> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "taptalk-deapi-"));
  const outName = `${path.parse(sourceFileName).name}.mp3`;
  const outPath = path.join(tempDir, outName);

  try {
    try {
      await execFileAsync("ffmpeg", [
        "-y",
        "-loglevel",
        "error",
        "-i",
        audioPath,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "96k",
        outPath
      ]);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`deAPI compatibility transcode failed: ${reason}`);
    }

    const audioBytes = Buffer.from(await readFile(outPath));
    return { audioBytes, fileName: outName };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
