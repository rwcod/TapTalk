import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EditingConfig } from "../core/types";
import {
  ChatMessage,
  ChatRequestDeps,
  parseChatEndpoint,
  requestChatCompletion
} from "./command-edit/chat-completion";
import { getInboxDir, getNotesDir, migrateLegacyVaultToNotes } from "./vault";

// Closed vocabulary — the LLM may only pick from this. Free tagging produces a
// messy synonym soup ("auth"/"login"/"oauth") that hurts the grep retrieval
// these tags exist for. None of these is a substring of another, so a simple
// includes() match is safe.
export const TAG_VOCABULARY = [
  "todo",
  "idea",
  "quote",
  "reference",
  "code",
  "contact",
  "note"
] as const;

const EMPTY_TAGS_LINE = /\ntags: \[\]/;
const MAX_TAGS = 3;
const MAX_CLIP_CHARS = 4000;

export function buildTagMessages(text: string): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "You label short captured notes. Choose 1 to 3 tags that best fit, ONLY " +
        `from this exact list: ${TAG_VOCABULARY.join(", ")}. ` +
        "Output only the chosen tags, comma-separated, lowercase, nothing else. " +
        "If unsure, output: note."
    },
    { role: "user", content: text.slice(0, MAX_CLIP_CHARS) }
  ];
}

/** Keep only known tags from raw model output, deduped, capped, in vocab order. */
export function parseTags(raw: string): string[] {
  const lower = raw.toLowerCase();
  return TAG_VOCABULARY.filter((tag) => lower.includes(tag)).slice(0, MAX_TAGS);
}

/** A note still has `tags: []` in its frontmatter. */
export function isUntagged(content: string): boolean {
  return EMPTY_TAGS_LINE.test(content);
}

export function applyTags(content: string, tags: string[]): string {
  if (tags.length === 0) {
    return content;
  }
  return content.replace(EMPTY_TAGS_LINE, `\ntags: [${tags.join(", ")}]`);
}

export interface TagInboxResult {
  scanned: number;
  tagged: number;
  skipped: number;
}

export async function organizeInbox(): Promise<number> {
  return migrateLegacyVaultToNotes();
}

export type TagNoteResult = "ignored" | "tagged" | "skipped";

export async function tagNoteFile(
  filePath: string,
  config: EditingConfig,
  deps: ChatRequestDeps = {}
): Promise<TagNoteResult> {
  if (config.provider !== "openai-compatible") {
    return "ignored";
  }
  const url = parseChatEndpoint(config.endpoint, "editing.endpoint");
  if (!url || !config.model.trim()) {
    return "ignored";
  }

  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return "ignored";
  }
  if (!isUntagged(content)) {
    return "ignored";
  }

  const body = content.split(/\n---\n/).slice(1).join("\n---\n").trim() || content;
  try {
    const raw = await requestChatCompletion(url, config, buildTagMessages(body), deps);
    const tags = parseTags(raw);
    if (tags.length === 0) {
      return "skipped";
    }
    await writeFile(filePath, applyTags(content, tags), { mode: 0o600 });
    return "tagged";
  } catch {
    return "skipped";
  }
}

/**
 * Background pass: tag every untagged TapTalk note via the configured edit LLM.
 * Best-effort — a note that fails (provider down, empty result) keeps its empty
 * tags and is retried on the next run. Only runs when an OpenAI-compatible edit
 * provider is configured; rule-based editing has no LLM to classify with.
 *
 * Note: sends clip text to the edit endpoint, which may be cloud — same
 * trust boundary as edit mode. Add a local-only gate if that becomes a concern.
 */
export async function tagInbox(
  config: EditingConfig,
  deps: ChatRequestDeps = {}
): Promise<TagInboxResult> {
  const result: TagInboxResult = { scanned: 0, tagged: 0, skipped: 0 };
  const roots = [getNotesDir(), getInboxDir()];
  const entries: string[] = [];
  for (const root of roots) {
    try {
      entries.push(...(await readdir(root)).filter((name) => name.endsWith(".md")).map((name) => path.join(root, name)));
    } catch {
      // root may not exist yet
    }
  }

  for (const filePath of entries) {
    const tagged = await tagNoteFile(filePath, config, deps);
    if (tagged === "ignored") {
      continue;
    }
    result.scanned += 1;
    if (tagged === "tagged") {
      result.tagged += 1;
    } else {
      result.skipped += 1;
    }
  }

  return result;
}
