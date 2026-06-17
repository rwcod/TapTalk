import { access, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const VAULT_DIR_MODE = 0o700;
const VAULT_FILE_MODE = 0o600;
const MAX_TITLE_LENGTH = 80;

export function getVaultDir(): string {
  return path.join(homedir(), ".taptalk", "vault");
}

export function getInboxDir(): string {
  return path.join(getVaultDir(), "inbox");
}

function firstLineTitle(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return line.length > MAX_TITLE_LENGTH ? `${line.slice(0, MAX_TITLE_LENGTH - 1)}…` : line;
}

// JSON.stringify produces a double-quoted, escaped scalar that is also valid
// YAML — lazy way to keep titles/app names with quotes or colons safe.
function yamlString(value: string): string {
  return JSON.stringify(value);
}

export interface CaptureInput {
  text: string;
  source: string | null;
  created?: Date;
}

// Frontmatter follows the Open Knowledge Format (OKF) schema: type, title,
// timestamp, source, tags — so the vault is a portable OKF bundle (readable on
// GitHub / in Obsidian / by any OKF-aware agent).
export function buildCaptureMarkdown(input: CaptureInput): string {
  const timestamp = (input.created ?? new Date()).toISOString();
  const frontmatter = [
    "---",
    "type: note",
    `title: ${yamlString(firstLineTitle(input.text))}`,
    `timestamp: ${timestamp}`,
    `source: ${yamlString(input.source ?? "unknown")}`,
    "tags: []",
    "---"
  ].join("\n");
  return `${frontmatter}\n\n${input.text.trim()}\n`;
}

function captureFileName(created: Date): string {
  const stamp = created.toISOString().replace(/[:T]/g, "-").replace(/\..+$/, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${stamp}-${suffix}.md`;
}

/**
 * Save a selected-text clip to the vault inbox. Instant, offline, no LLM —
 * frontmatter holds only what is known for free. Tagging happens later.
 * Returns the written file path.
 */
export async function captureToVault(input: CaptureInput): Promise<string> {
  const created = input.created ?? new Date();
  const inbox = getInboxDir();
  await mkdir(inbox, { recursive: true, mode: VAULT_DIR_MODE });
  const filePath = path.join(inbox, captureFileName(created));
  await writeFile(filePath, buildCaptureMarkdown({ ...input, created }), {
    mode: VAULT_FILE_MODE
  });
  return filePath;
}

export interface VaultEntry {
  file: string;
  title: string;
  source: string;
  created: string;
  tags: string[];
  /** Short plain-text preview of the body, for the list + search. */
  excerpt: string;
}

/** Body text with the YAML frontmatter block stripped. */
export function noteBody(content: string): string {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") {
    return content.trim();
  }
  let i = 1;
  while (i < lines.length && lines[i].trim() !== "---") {
    i += 1;
  }
  return lines.slice(i + 1).join("\n").trim();
}

function unquote(value: string | undefined): string {
  if (!value) {
    return "";
  }
  if (value.startsWith("\"")) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value;
    }
  }
  return value;
}

/** Parse a capture file's frontmatter into a list entry. Pure — testable. */
export function parseVaultEntry(file: string, content: string): VaultEntry {
  const fm: Record<string, string> = {};
  const lines = content.split("\n");
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length && lines[i].trim() !== "---"; i += 1) {
      const idx = lines[i].indexOf(":");
      if (idx !== -1) {
        fm[lines[i].slice(0, idx).trim()] = lines[i].slice(idx + 1).trim();
      }
    }
  }
  const tags = (fm.tags ?? "[]")
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return {
    file,
    title: unquote(fm.title) || file,
    source: unquote(fm.source) || "unknown",
    created: fm.timestamp ?? fm.created ?? "",
    tags,
    excerpt: noteBody(content).replace(/\s+/g, " ").slice(0, 180)
  };
}

/** All note markdown files under the vault (excludes generated index.md). */
export async function listVaultMarkdownFiles(): Promise<string[]> {
  try {
    const entries = await readdir(getVaultDir(), { recursive: true });
    return entries
      .map((name) => name.toString())
      .filter((name) => name.endsWith(".md") && path.basename(name) !== "index.md");
  } catch {
    return [];
  }
}

/**
 * Regenerate each folder's OKF index.md: a heading + a markdown link list of its
 * notes. Pure-output artifact (the app ignores index.md when listing notes);
 * makes the vault navigable on GitHub / in Obsidian.
 */
export async function writeFolderIndexes(): Promise<void> {
  const vault = getVaultDir();
  const byDir = new Map<string, VaultEntry[]>();
  for (const rel of await listVaultMarkdownFiles()) {
    const dir = path.dirname(rel);
    try {
      const entry = parseVaultEntry(rel, await readFile(path.join(vault, rel), "utf8"));
      const list = byDir.get(dir) ?? [];
      list.push(entry);
      byDir.set(dir, list);
    } catch {
      // skip unreadable
    }
  }
  for (const [dir, entries] of byDir) {
    if (dir === "." || dir === "inbox" || !dir) {
      continue; // only tag-folder indexes (inbox is transient staging)
    }
    entries.sort((a, b) => (a.created < b.created ? 1 : -1));
    const lines = [
      "---",
      "type: index",
      `title: ${yamlString(dir)}`,
      `timestamp: ${new Date().toISOString()}`,
      "---",
      `# ${dir}`,
      ""
    ];
    for (const e of entries) {
      const link = `[${e.title}](${path.basename(e.file)})`;
      lines.push(e.excerpt ? `- ${link} — ${e.excerpt}` : `- ${link}`);
    }
    await writeFile(path.join(vault, dir, "index.md"), lines.join("\n") + "\n", {
      mode: VAULT_FILE_MODE
    });
  }
}

/** List vault notes (recursive, all tag folders + inbox), newest first. */
export async function listVault(): Promise<VaultEntry[]> {
  const vault = getVaultDir();
  const entries: VaultEntry[] = [];
  for (const rel of await listVaultMarkdownFiles()) {
    try {
      entries.push(parseVaultEntry(rel, await readFile(path.join(vault, rel), "utf8")));
    } catch {
      // skip unreadable
    }
  }
  return entries.sort((a, b) => (a.created < b.created ? 1 : -1));
}

/** Read a single note's body (frontmatter stripped), or null if unreadable. */
export async function readVaultNoteBody(file: string): Promise<string | null> {
  const resolved = resolveVaultFile(file);
  if (!resolved) {
    return null;
  }
  try {
    return noteBody(await readFile(resolved, "utf8"));
  } catch {
    return null;
  }
}

/** Resolve a vault-relative file path to an absolute path, rejecting traversal. */
export function resolveVaultFile(file: string): string | null {
  const vault = getVaultDir();
  const resolved = path.resolve(vault, file);
  return resolved === vault || resolved.startsWith(vault + path.sep) ? resolved : null;
}

/** A path that does not yet exist — appends -1, -2… so a move never clobbers. */
async function uniquePath(target: string): Promise<string> {
  const ext = path.extname(target);
  const base = target.slice(0, target.length - ext.length);
  let candidate = target;
  for (let n = 1; ; n += 1) {
    try {
      await access(candidate);
    } catch {
      return candidate; // does not exist → free
    }
    candidate = `${base}-${n}${ext}`;
  }
}

/** Move a tagged inbox note into vault/<tag>/, returning its new absolute path. */
export async function fileNoteUnderTag(inboxFilePath: string, tag: string): Promise<string> {
  const safeTag = tag.replace(/[^\p{L}\p{N}_-]/gu, "").trim() || "note";
  const destDir = path.join(getVaultDir(), safeTag);
  if (path.resolve(inboxFilePath) === path.resolve(destDir, path.basename(inboxFilePath))) {
    return inboxFilePath; // already in place
  }
  await mkdir(destDir, { recursive: true, mode: VAULT_DIR_MODE });
  // Never overwrite an existing note — pick a free name instead.
  const destPath = await uniquePath(path.join(destDir, path.basename(inboxFilePath)));
  await rename(inboxFilePath, destPath);
  return destPath;
}
