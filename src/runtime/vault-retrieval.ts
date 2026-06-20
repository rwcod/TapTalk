import type { EditingConfig, VaultConfig } from "../core/types";
import {
  ChatMessage,
  ChatRequestDeps,
  parseChatEndpoint,
  requestChatCompletion
} from "./command-edit/chat-completion";
import { listKnowledgeVault, readVaultEntryBody, VaultEntry } from "./vault";

const MAX_NOTES = 3;
const MAX_CHARS = 3000;

/**
 * Ask the LLM which notes are relevant — semantic, multilingual, no hand-rolled
 * stemming/stopwords. The catalog (title + tags + excerpt) is tiny, so this is a
 * cheap extra call.
 */
export function buildSelectionMessages(
  command: string,
  selectedText: string,
  entries: VaultEntry[]
): ChatMessage[] {
  const catalog = entries
    .map((e, i) => {
      const origin = e.rootLabel ? ` (${e.rootLabel})` : "";
      return `${i + 1}. ${e.title}${origin} [${e.tags.join(", ")}] — ${e.excerpt}`;
    })
    .join("\n");
  return [
    {
      role: "system",
      content:
        "You decide which of the user's saved notes are relevant to carrying out an edit command. " +
        'Reply with ONLY the numbers of clearly relevant notes, comma-separated (e.g. "1, 3"), or "none". ' +
        "Be strict: pick a note only if it materially helps fulfil the command. If nothing fits, reply none."
    },
    {
      role: "user",
      content: `Command:\n${command}\n\nSelected text:\n${selectedText}\n\nNotes:\n${catalog}`
    }
  ];
}

/** Extract chosen 1-based indices from the model's reply. Pure — testable. */
export function parseSelection(raw: string, count: number): number[] {
  const nums = (raw.match(/\d+/g) ?? [])
    .map(Number)
    .filter((n) => n >= 1 && n <= count);
  return [...new Set(nums)].slice(0, MAX_NOTES);
}

/**
 * Retrieve note bodies relevant to an edit command via LLM selection, or null
 * when nothing applies. Only runs with an OpenAI-compatible edit provider (a
 * rule-based provider has no LLM and no semantic edit anyway).
 *
 * Note: catalog + bodies go to the edit endpoint, which may be cloud — same
 * trust boundary as edit mode. Add a local-only gate if that matters.
 */
export async function retrieveVaultContext(
  command: string,
  selectedText: string,
  config: EditingConfig,
  vaultConfig?: VaultConfig,
  deps: ChatRequestDeps = {}
): Promise<string | null> {
  if (config.provider !== "openai-compatible") {
    return null;
  }
  const url = parseChatEndpoint(config.endpoint, "editing.endpoint");
  if (!url || !config.model.trim()) {
    return null;
  }

  const entries = await listKnowledgeVault(vaultConfig);
  if (entries.length === 0) {
    return null;
  }

  let raw: string;
  try {
    raw = await requestChatCompletion(url, config, buildSelectionMessages(command, selectedText, entries), deps);
  } catch {
    return null; // selection failed — edit still runs without notes
  }

  const picks = parseSelection(raw, entries.length);
  if (picks.length === 0) {
    return null;
  }

  const bodies: string[] = [];
  for (const index of picks) {
    const body = await readVaultEntryBody(entries[index - 1]);
    if (body) {
      bodies.push(body.trim());
    }
  }
  if (bodies.length === 0) {
    return null;
  }
  return bodies.join("\n\n---\n\n").slice(0, MAX_CHARS);
}
