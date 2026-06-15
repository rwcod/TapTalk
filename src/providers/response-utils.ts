import path from "node:path";

export function tryGetString(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const picked = record[key];
  return typeof picked === "string" ? picked : null;
}

export function extractTranscript(payload: unknown, hints: string[]): string | null {
  for (const key of hints) {
    const hit = tryGetString(payload, key);
    if (hit && hit.trim().length > 0) {
      return hit.trim();
    }
  }

  if (Array.isArray(payload)) {
    const parts = payload
      .map((item) => extractTranscript(item, hints))
      .filter((item): item is string => typeof item === "string" && item.length > 0);

    if (parts.length > 0) {
      return parts.join(" ");
    }
  }

  if (typeof payload === "object" && payload !== null) {
    const record = payload as Record<string, unknown>;
    for (const value of Object.values(record)) {
      const nested = extractTranscript(value, hints);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

export async function parseBodyAsUnknown(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as unknown;
  }

  const raw = await response.text();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export function summarizePayload(payload: unknown): string {
  if (typeof payload === "string") {
    return payload.slice(0, 600);
  }

  try {
    return JSON.stringify(payload).slice(0, 600);
  } catch {
    return String(payload).slice(0, 600);
  }
}

const AUDIO_MIME_TYPES: Record<string, string> = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".webm": "audio/webm",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".m4a": "audio/aac"
};

export function inferMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return AUDIO_MIME_TYPES[ext] ?? "application/octet-stream";
}
