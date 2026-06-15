import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TranscriptionProvider } from "../providers";
import { CloudProviderConfig } from "../core/types";
import { ensureSafeCloudHttpProtocol } from "../core/url-security";
import {
  DEAPI_MIME_FALLBACK_EXTENSIONS,
  DeapiCompatTranscoder,
  extractDeapiRequestId,
  isDeapiAudiofileEndpoint,
  isDeapiClientEndpoint,
  pollDeapiTranscript,
  shouldRetryDeapiAudioTypeValidation,
  transcodeToMp3ForDeapi
} from "./cloud-stt-deapi";
import {
  addQueryParams,
  buildAuthHeaders,
  normalizeCloudLanguageForProvider,
  sendCloudTranscribeRequest
} from "./cloud-stt-request";
import { extractTranscript, summarizePayload } from "./response-utils";

const DEFAULT_CLOUD_TIMEOUT_MS = 45000;

export class CloudSttProvider implements TranscriptionProvider {
  name: string;

  constructor(
    private readonly config: CloudProviderConfig,
    private readonly timeoutMs = DEFAULT_CLOUD_TIMEOUT_MS,
    private readonly deapiCompatTranscoder: DeapiCompatTranscoder = transcodeToMp3ForDeapi
  ) {
    this.name = `cloud:${config.preset}`;
  }

  async transcribe(audioPath: string): Promise<string> {
    if (!audioPath || audioPath.trim().length === 0) {
      throw new Error("Cloud provider wymaga lokalnej ścieżki audio.");
    }

    const apiKey = this.config.apiKey.trim();
    if (!apiKey) {
      throw new Error("Brak API key w settings.cloud.apiKey.");
    }

    if (!this.config.url.trim()) {
      throw new Error("Brak settings.cloud.url.");
    }

    let audioBytes: Buffer = Buffer.from(await readFile(audioPath));
    let fileName = path.basename(audioPath);
    const normalizedLanguage = normalizeCloudLanguageForProvider(this.config.language);
    const variables: Record<string, string> = {
      key: apiKey,
      model: this.config.model,
      language: normalizedLanguage
    };

    const url = new URL(this.config.url);
    ensureSafeCloudHttpProtocol(url, "settings.cloud.url");
    addQueryParams(url, this.config.queryParams, variables);

    if (this.config.bodyFormat === "formdata" && isDeapiAudiofileEndpoint(url)) {
      const ext = path.extname(fileName).toLowerCase();
      if (DEAPI_MIME_FALLBACK_EXTENSIONS.has(ext)) {
        const converted = await this.deapiCompatTranscoder(audioPath, fileName);
        audioBytes = converted.audioBytes;
        fileName = converted.fileName;
      }
    }

    const headers = buildAuthHeaders(this.config, variables);

    if (this.config.bodyFormat !== "formdata") {
      if (this.config.model.trim() && !url.searchParams.has("model")) {
        url.searchParams.set("model", this.config.model.trim());
      }

      if (normalizedLanguage && !url.searchParams.has("language")) {
        url.searchParams.set("language", normalizedLanguage);
      }
    }

    const firstUploadFileName = fileName;
    const firstAttempt = await sendCloudTranscribeRequest({
      audioBytes,
      config: this.config,
      fileName,
      headers,
      preset: this.config.preset,
      timeoutMs: this.timeoutMs,
      url,
      variables
    });

    let attempt = firstAttempt;
    let retriedUploadFileName = "";
    let retriedUploadMimeType = "";

    if (
      shouldRetryDeapiAudioTypeValidation(attempt.response, attempt.payload, url, this.config.bodyFormat) &&
      path.extname(fileName).toLowerCase() !== ".mp3"
    ) {
      const converted = await this.deapiCompatTranscoder(audioPath, fileName);
      audioBytes = converted.audioBytes;
      fileName = converted.fileName;
      attempt = await sendCloudTranscribeRequest({
        audioBytes,
        config: this.config,
        fileName,
        headers,
        preset: this.config.preset,
        timeoutMs: this.timeoutMs,
        url,
        variables
      });
      retriedUploadFileName = fileName;
      retriedUploadMimeType = attempt.mimeType;
    }

    const response = attempt.response;
    const payload = attempt.payload;

    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      const limit = response.headers.get("x-ratelimit-limit");
      const remaining = response.headers.get("x-ratelimit-remaining");
      const rateMeta = [
        retryAfter ? `retry-after=${retryAfter}` : null,
        limit ? `limit=${limit}` : null,
        remaining ? `remaining=${remaining}` : null
      ]
        .filter((item): item is string => Boolean(item))
        .join(", ");
      const uploadMeta = [
        `upload=${firstUploadFileName}`,
        `upload_mime=${firstAttempt.mimeType}`,
        retriedUploadFileName ? `retry_upload=${retriedUploadFileName}` : null,
        retriedUploadMimeType ? `retry_upload_mime=${retriedUploadMimeType}` : null
      ]
        .filter((item): item is string => Boolean(item))
        .join(", ");

      throw new Error(
        `Cloud STT (${this.config.preset}) zwrócił ${response.status}: ${summarizePayload(payload)}${rateMeta ? ` [${rateMeta}]` : ""}${uploadMeta ? ` [${uploadMeta}]` : ""}`
      );
    }

    const hints = this.config.textFieldHints.length > 0
      ? this.config.textFieldHints
      : ["text", "transcript", "result", "content", "output"];

    if (typeof payload === "string") {
      const cleaned = payload.trim();
      if (cleaned.length > 0) {
        return cleaned;
      }
    }

    let transcript = extractTranscript(payload, hints);
    if (!transcript && isDeapiClientEndpoint(url)) {
      const requestId = extractDeapiRequestId(payload);
      if (requestId) {
        transcript = await pollDeapiTranscript(url, headers, requestId, hints, this.config.preset);
      }
    }

    if (!transcript) {
      throw new Error(
        `Cloud STT (${this.config.preset}) odpowiedział bez transkryptu. payload=${summarizePayload(payload)}`
      );
    }

    return transcript;
  }
}
