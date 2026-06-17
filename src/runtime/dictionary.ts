import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const DICT_PATH = path.join(homedir(), ".taptalk", "dictionary.txt");
// whisper's initial_prompt is capped (~224 tokens). Keep the term list well
// under that so it biases recognition without crowding out the audio.
const MAX_PROMPT_CHARS = 600;

const SEED = `# TapTalk dictionary — your own words.
# One entry per line:
#   a plain word or phrase   -> whisper is biased to recognise it when you speak
#   heard => Correct         -> replaced in the transcript after recognition
# Lines starting with # are ignored. Examples (uncomment / edit):
# Claude
# Supabase
# clod => Claude
# type script => TypeScript
`;

export interface Replacement {
  pattern: RegExp;
  value: string;
}

export interface Dictionary {
  /** Vocabulary fed to whisper's initial_prompt to bias recognition. */
  terms: string[];
  /** Post-transcription find/replace rules. */
  replacements: Replacement[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parse dictionary file contents. Pure — testable. */
export function parseDictionary(raw: string): Dictionary {
  const terms: string[] = [];
  const replacements: Replacement[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const arrow = trimmed.indexOf("=>");
    if (arrow !== -1) {
      const heard = trimmed.slice(0, arrow).trim();
      const correct = trimmed.slice(arrow + 2).trim();
      if (heard && correct) {
        replacements.push({ pattern: new RegExp(`\\b${escapeRegExp(heard)}\\b`, "gi"), value: correct });
        terms.push(correct);
      }
    } else {
      terms.push(trimmed);
    }
  }
  return { terms: [...new Set(terms)], replacements };
}

/** Join terms into an initial_prompt string, capped to stay within budget. */
export function buildInitialPrompt(terms: string[]): string {
  let out = "";
  for (const term of terms) {
    const next = out ? `${out}, ${term}` : term;
    if (next.length > MAX_PROMPT_CHARS) {
      break;
    }
    out = next;
  }
  return out;
}

/**
 * Load the user dictionary. Creates a seeded, fully-commented file on first run
 * so it is discoverable and editable; until the user adds entries it is empty
 * (no recognition bias, built-in replacements still apply).
 */
export async function loadDictionary(): Promise<Dictionary> {
  try {
    return parseDictionary(await readFile(DICT_PATH, "utf8"));
  } catch {
    await writeFile(DICT_PATH, SEED, { mode: 0o600 }).catch(() => undefined);
    return { terms: [], replacements: [] };
  }
}
