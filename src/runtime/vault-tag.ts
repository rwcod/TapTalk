import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EditingConfig } from "../core/types";
import {
  ChatMessage,
  ChatRequestDeps,
  parseChatEndpoint,
  requestChatCompletion
} from "./command-edit/chat-completion";
import { fileNoteUnderTag, getInboxDir, writeFolderIndexes } from "./vault";

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

/**
 * Move any already-tagged note still sitting in the inbox into vault/<tag>/.
 * No LLM — reconciles notes tagged before folder-filing existed, and runs on
 * startup so the inbox only ever holds untagged staging. Returns count moved.
 */
export async function organizeInbox(): Promise<number> {
  const inbox = getInboxDir();
  let names: string[];
  try {
    names = (await readdir(inbox)).filter((name) => name.endsWith(".md"));
  } catch {
    return 0;
  }
  let moved = 0;
  for (const name of names) {
    const filePath = path.join(inbox, name);
    try {
      const content = await readFile(filePath, "utf8");
      const match = content.match(/\ntags: \[([^\]]*)\]/);
      const tags = match ? match[1].split(",").map((t) => t.trim()).filter(Boolean) : [];
      if (tags.length > 0) {
        await fileNoteUnderTag(filePath, tags[0]);
        moved += 1;
      }
    } catch {
      // skip unreadable
    }
  }
  await writeFolderIndexes().catch(() => undefined);
  return moved;
}

/**
 * Background pass: tag every untagged inbox note via the configured edit LLM.
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

  if (config.provider !== "openai-compatible") {
    return result;
  }
  const url = parseChatEndpoint(config.endpoint, "editing.endpoint");
  if (!url || !config.model.trim()) {
    return result;
  }

  const inbox = getInboxDir();
  let entries: string[];
  try {
    entries = (await readdir(inbox)).filter((name) => name.endsWith(".md"));
  } catch {
    return result; // no inbox yet
  }

  for (const name of entries) {
    const filePath = path.join(inbox, name);
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      continue;
    }
    if (!isUntagged(content)) {
      continue;
    }

    result.scanned += 1;
    const body = content.split(/\n---\n/).slice(1).join("\n---\n").trim() || content;
    try {
      const raw = await requestChatCompletion(url, config, buildTagMessages(body), deps);
      const tags = parseTags(raw);
      if (tags.length === 0) {
        result.skipped += 1;
        continue;
      }
      await writeFile(filePath, applyTags(content, tags), { mode: 0o600 });
      // Organize: move the now-tagged note out of the inbox into vault/<tag>/.
      await fileNoteUnderTag(filePath, tags[0]).catch(() => undefined);
      result.tagged += 1;
    } catch {
      result.skipped += 1; // provider failure — retried next run
    }
  }

  return result;
}
