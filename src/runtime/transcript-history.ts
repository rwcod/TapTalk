import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAppDataDirPath } from "../settings";

const TRANSCRIPT_HISTORY_PATH = path.join(getAppDataDirPath(), "transcripts.json");
const APP_DATA_DIR_MODE = 0o700;
const TRANSCRIPT_HISTORY_FILE_MODE = 0o600;
export const MAX_RECENT_TRANSCRIPTS = 10;

export interface TranscriptEntry {
  text: string;
  ts: number;
}

interface TranscriptHistoryPayload {
  recent: TranscriptEntry[];
}

function toCleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Normalize legacy string items to TranscriptEntry objects (backward compat). */
function normalizeItem(item: unknown): TranscriptEntry | null {
  if (typeof item === "string") {
    const cleaned = item.trim();
    return cleaned ? { text: cleaned, ts: 0 } : null;
  }
  if (typeof item === "object" && item !== null) {
    const obj = item as Record<string, unknown>;
    const text = toCleanString(obj.text);
    if (!text) return null;
    const ts = typeof obj.ts === "number" ? obj.ts : 0;
    return { text, ts };
  }
  return null;
}

function sanitizeRecentTranscripts(value: unknown): TranscriptEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const out: TranscriptEntry[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const entry = normalizeItem(raw);
    if (!entry || seen.has(entry.text)) {
      continue;
    }

    seen.add(entry.text);
    out.push(entry);
    if (out.length >= MAX_RECENT_TRANSCRIPTS) {
      break;
    }
  }

  return out;
}

/** Extract plain text array for callers that don't need timestamps. */
export function transcriptTexts(entries: TranscriptEntry[]): string[] {
  return entries.map((e) => e.text);
}

export function appendRecentTranscript(text: string, current: TranscriptEntry[]): TranscriptEntry[] {
  const cleaned = toCleanString(text);
  const base = sanitizeRecentTranscripts(current);

  if (!cleaned) {
    return base;
  }

  const entry: TranscriptEntry = { text: cleaned, ts: Date.now() };
  return [entry, ...base.filter((item) => item.text !== cleaned)].slice(0, MAX_RECENT_TRANSCRIPTS);
}

function parsePayload(raw: string): TranscriptHistoryPayload {
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== "object" || parsed === null) {
    return { recent: [] };
  }

  const maybeRecent = (parsed as { recent?: unknown }).recent;
  return {
    recent: sanitizeRecentTranscripts(maybeRecent)
  };
}

export async function readTranscriptHistory(): Promise<TranscriptEntry[]> {
  try {
    const raw = await readFile(TRANSCRIPT_HISTORY_PATH, "utf8");
    return parsePayload(raw).recent;
  } catch (error) {
    const maybe = error as NodeJS.ErrnoException;
    if (maybe.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeTranscriptHistory(recent: TranscriptEntry[]): Promise<void> {
  const appDataDir = getAppDataDirPath();
  await mkdir(appDataDir, { recursive: true, mode: APP_DATA_DIR_MODE });
  await chmod(appDataDir, APP_DATA_DIR_MODE).catch(() => undefined);
  const payload: TranscriptHistoryPayload = {
    recent: sanitizeRecentTranscripts(recent)
  };
  await writeFile(TRANSCRIPT_HISTORY_PATH, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: "utf8",
    mode: TRANSCRIPT_HISTORY_FILE_MODE
  });
  await chmod(TRANSCRIPT_HISTORY_PATH, TRANSCRIPT_HISTORY_FILE_MODE).catch(() => undefined);
}

export async function appendAndSaveTranscript(
  text: string,
  current: TranscriptEntry[]
): Promise<TranscriptEntry[]> {
  const next = appendRecentTranscript(text, current);
  await writeTranscriptHistory(next);
  return next;
}

export async function clearTranscriptHistory(): Promise<void> {
  await writeTranscriptHistory([]);
}
