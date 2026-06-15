import { CloudProviderConfig } from "../core/types";
import { inferMimeType, parseBodyAsUnknown } from "./response-utils";
import {
  isDeapiClientEndpoint,
  normalizeDeapiBooleanFormValue
} from "./cloud-stt-deapi";

export function normalizeCloudLanguageForProvider(language: string): string {
  const normalized = (language || "").trim().toLowerCase();
  if (!normalized || normalized === "auto") {
    return "";
  }

  if (normalized.includes("+en")) {
    return "";
  }

  return normalized;
}

export function templateValue(template: string, values: Record<string, string>): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => {
    const hit = values[key];
    return hit ?? "";
  });
}

export function addQueryParams(
  target: URL,
  params: Record<string, string>,
  values: Record<string, string>
): void {
  for (const [key, raw] of Object.entries(params)) {
    const resolved = templateValue(raw, values).trim();
    if (!resolved) {
      continue;
    }

    target.searchParams.set(key, resolved);
  }
}

export function buildAuthHeaders(
  config: CloudProviderConfig,
  variables: Record<string, string>
): Headers {
  const headers = new Headers();
  const authHeader = config.authHeader.trim();
  if (authHeader) {
    const authValueTemplate = config.authValueTemplate.trim() || "{{key}}";
    const authValue = templateValue(authValueTemplate, variables).trim();
    if (authValue) {
      headers.set(authHeader, authValue);
    }
  }

  return headers;
}

function buildRequestBody(
  config: CloudProviderConfig,
  url: URL,
  requestAudioBytes: Buffer,
  requestFileName: string,
  variables: Record<string, string>
): { body: BodyInit; headers: Headers; mimeType: string } {
  const requestHeaders = new Headers();
  const mimeType = inferMimeType(requestFileName);

  if (config.bodyFormat === "formdata") {
    const form = new FormData();
    const audioField = config.audioFieldName.trim() || "file";
    const audioBlobPart = new Uint8Array(requestAudioBytes);
    form.append(audioField, new Blob([audioBlobPart], { type: mimeType }), requestFileName);

    if (config.model.trim()) {
      form.append("model", config.model.trim());
    }

    const normalizedLanguage = normalizeCloudLanguageForProvider(config.language);
    if (normalizedLanguage && !isDeapiClientEndpoint(url)) {
      form.append("language", normalizedLanguage);
    }

    for (const [key, raw] of Object.entries(config.extraFormFields)) {
      const fieldName = key.trim();
      if (!fieldName) {
        continue;
      }

      const value = templateValue(raw, variables).trim();
      if (!value) {
        continue;
      }

      const normalizedFormValue = normalizeDeapiBooleanFormValue(fieldName, value, url);
      form.append(fieldName, normalizedFormValue);
    }

    return { body: form, headers: requestHeaders, mimeType };
  }

  requestHeaders.set("Content-Type", mimeType);
  return {
    body: new Blob([new Uint8Array(requestAudioBytes)]),
    headers: requestHeaders,
    mimeType
  };
}

export async function sendCloudTranscribeRequest(params: {
  audioBytes: Buffer;
  config: CloudProviderConfig;
  fileName: string;
  headers: Headers;
  preset: string;
  timeoutMs: number;
  url: URL;
  variables: Record<string, string>;
}): Promise<{ response: Response; payload: unknown; mimeType: string }> {
  const { audioBytes, config, fileName, headers, preset, timeoutMs, url, variables } = params;
  const built = buildRequestBody(config, url, audioBytes, fileName, variables);
  const requestHeaders = new Headers(headers);
  built.headers.forEach((value, key) => {
    requestHeaders.set(key, value);
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: requestHeaders,
      body: built.body,
      signal: controller.signal,
      redirect: "error"
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Cloud STT (${preset}) timeout po ${timeoutMs}ms.`);
    }

    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Cloud STT (${preset}) request failed: ${reason}`);
  } finally {
    clearTimeout(timeout);
  }

  const payload = await parseBodyAsUnknown(response);
  return { response, payload, mimeType: built.mimeType };
}
