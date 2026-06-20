import { access, mkdir, readdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { VaultConfig } from "../core/types";

const VAULT_DIR_MODE = 0o700;
const VAULT_FILE_MODE = 0o600;
const MAX_TITLE_LENGTH = 80;

export function getVaultDir(): string {
  return path.join(homedir(), ".taptalk", "vault");
}

export function getInboxDir(rootDir = getVaultDir()): string {
  return path.join(rootDir, "inbox");
}

export function getNotesDir(rootDir = getVaultDir()): string {
  return path.join(rootDir, "notes");
}

export function expandHomePath(value: string): string {
  if (value === "~") {
    return homedir();
  }
  if (value.startsWith(`~${path.sep}`) || value.startsWith("~/")) {
    return path.join(homedir(), value.slice(2));
  }
  return value;
}

export function usesTapTalkCaptureDestination(config?: VaultConfig): boolean {
  return config?.captureDestination !== "folder" || !config.captureFolder.trim();
}

export function getCaptureDir(config?: VaultConfig): string {
  if (!config || config.captureDestination !== "folder" || !config.captureFolder.trim()) {
    return getNotesDir();
  }
  return expandHomePath(config.captureFolder.trim());
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

export interface CaptureOptions {
  destinationDir?: string;
}

// Frontmatter follows the Open Knowledge Format (OKF) schema: type, title,
// created, source, tags — so the vault is a portable OKF bundle (readable on
// GitHub / in Obsidian / by any OKF-aware agent).
export function buildCaptureMarkdown(input: CaptureInput): string {
  const created = (input.created ?? new Date()).toISOString();
  const frontmatter = [
    "---",
    "type: note",
    `title: ${yamlString(firstLineTitle(input.text))}`,
    `created: ${created}`,
    `source: ${yamlString(input.source ?? "unknown")}`,
    "tags: []",
    "---"
  ].join("\n");
  return `${frontmatter}\n\n${input.text.trim()}\n`;
}

function safeFileTitle(title: string): string {
  return (
    title
      .normalize("NFKC")
      .replace(/[\\/:*?"<>|#^\[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_TITLE_LENGTH) || "Note"
  );
}

function noteFileName(created: Date, title: string): string {
  return `${created.toISOString().slice(0, 10)} - ${safeFileTitle(title)}.md`;
}

function captureFileName(input: CaptureInput, created: Date): string {
  return noteFileName(created, firstLineTitle(input.text));
}

/**
 * Save a selected-text clip. Instant, offline, no LLM — frontmatter holds only
 * what is known for free. Tagging happens later.
 * Returns the written file path.
 */
export async function captureToVault(
  input: CaptureInput,
  options: CaptureOptions = {}
): Promise<string> {
  const created = input.created ?? new Date();
  const destination = options.destinationDir ?? getNotesDir();
  await mkdir(destination, { recursive: true, mode: VAULT_DIR_MODE });
  const filePath = await uniquePath(path.join(destination, captureFileName(input, created)));
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
  rootLabel?: string;
  rootPath?: string;
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

function firstMarkdownHeading(body: string): string {
  const heading = body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^#{1,6}\s+/.test(line));
  return heading ? heading.replace(/^#{1,6}\s+/, "").trim() : "";
}

function cleanTag(value: string): string {
  return value.trim().replace(/^#/, "").replace(/^["']|["']$/g, "");
}

function parseInlineTags(body: string): string[] {
  return Array.from(body.matchAll(/(^|\s)#([\p{L}\p{N}_/-]+)/gu), (match) => match[2]);
}

function parseTagList(frontmatterTags: string | undefined, blockTags: string[]): string[] {
  const raw: string[] = [...blockTags];
  if (frontmatterTags) {
    const trimmed = frontmatterTags.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      raw.push(...trimmed.replace(/^\[|\]$/g, "").split(","));
    } else {
      raw.push(...trimmed.split(","));
    }
  }
  return [...new Set(raw.map(cleanTag).filter(Boolean))];
}

/** Parse a capture/Obsidian file's frontmatter into a list entry. Pure — testable. */
export function parseVaultEntry(
  file: string,
  content: string,
  root?: { label?: string; path?: string }
): VaultEntry {
  const fm: Record<string, string> = {};
  const blockTags: string[] = [];
  const lines = content.split("\n");
  if (lines[0]?.trim() === "---") {
    let currentKey = "";
    for (let i = 1; i < lines.length && lines[i].trim() !== "---"; i += 1) {
      const line = lines[i];
      const idx = line.indexOf(":");
      if (idx !== -1) {
        currentKey = line.slice(0, idx).trim();
        fm[currentKey] = line.slice(idx + 1).trim();
      } else if (currentKey === "tags") {
        const item = line.trim().replace(/^-\s*/, "");
        if (item && item !== line.trim()) {
          blockTags.push(item);
        }
      }
    }
  }
  const body = noteBody(content);
  const tags = [...new Set([...parseTagList(fm.tags, blockTags), ...parseInlineTags(body).map(cleanTag)])];
  return {
    file,
    title: unquote(fm.title) || firstMarkdownHeading(body) || path.basename(file, ".md"),
    source: unquote(fm.source) || "unknown",
    created: fm.created ?? fm.timestamp ?? "",
    tags,
    rootLabel: root?.label,
    rootPath: root?.path,
    excerpt: body.replace(/\s+/g, " ").slice(0, 180)
  };
}

/** All note markdown files under the vault (excludes generated index.md). */
export async function listVaultMarkdownFiles(
  rootDir = getVaultDir(),
  options: { includeIndexes?: boolean } = {}
): Promise<string[]> {
  try {
    const entries = await readdir(rootDir, { recursive: true });
    return entries
      .map((name) => name.toString())
      .filter((name) => {
        const parts = name.split(path.sep);
        if (parts.some((part) => part === ".obsidian" || part === ".trash" || part === ".git")) {
          return false;
        }
        return (
          name.endsWith(".md") &&
          (options.includeIndexes === true || path.basename(name) !== "index.md")
        );
      });
  } catch {
    return [];
  }
}

export async function writeFolderIndexes(): Promise<void> {
  // Kept for older call sites. Per-folder index.md files make Obsidian graph noisy.
}

/** List TapTalk vault notes (recursive for legacy notes), newest first. */
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

export function configuredKnowledgeRoots(config?: VaultConfig): Array<{ label: string; path: string; includeIndexes?: boolean }> {
  const roots: Array<{ label: string; path: string; includeIndexes?: boolean }> = [];
  const seen = new Set<string>();
  const add = (label: string, rootPath: string, includeIndexes = true) => {
    const expanded = path.resolve(expandHomePath(rootPath));
    if (!expanded || seen.has(expanded)) {
      return;
    }
    seen.add(expanded);
    roots.push({ label, path: expanded, includeIndexes });
  };

  if (config?.includeTapTalkVault !== false) {
    add("TapTalk", getVaultDir(), false);
  }
  for (const source of config?.knowledgeSources ?? []) {
    if (source.enabled !== false && source.path.trim()) {
      add(source.label || path.basename(source.path), source.path);
    }
  }
  return roots;
}

export async function listKnowledgeVault(config?: VaultConfig): Promise<VaultEntry[]> {
  const entries: VaultEntry[] = [];
  for (const root of configuredKnowledgeRoots(config)) {
    for (const rel of await listVaultMarkdownFiles(root.path, { includeIndexes: root.includeIndexes })) {
      try {
        entries.push(parseVaultEntry(rel, await readFile(path.join(root.path, rel), "utf8"), root));
      } catch {
        // skip unreadable
      }
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

export async function readVaultEntryBody(entry: Pick<VaultEntry, "file" | "rootPath">): Promise<string | null> {
  const root = entry.rootPath ?? getVaultDir();
  const resolved = resolveVaultFileInRoot(root, entry.file);
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
  return resolveVaultFileInRoot(getVaultDir(), file);
}

export function resolveVaultFileInRoot(rootDir: string, file: string): string | null {
  const vault = path.resolve(expandHomePath(rootDir));
  const resolved = path.resolve(vault, file);
  return resolved === vault || resolved.startsWith(vault + path.sep) ? resolved : null;
}

async function removeGeneratedIndexes(rootDir: string): Promise<void> {
  for (const rel of await listVaultMarkdownFiles(rootDir, { includeIndexes: true })) {
    if (path.basename(rel) === "index.md") {
      await rm(path.join(rootDir, rel), { force: true }).catch(() => undefined);
    }
  }
}

async function pruneEmptyLegacyDirs(dir: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "notes" || entry.name.startsWith(".")) {
      continue;
    }
    const child = path.join(dir, entry.name);
    await pruneEmptyLegacyDirs(child);
    await rmdir(child).catch(() => undefined);
  }
}

export async function fileNoteInNotes(filePath: string, rootDir = getVaultDir()): Promise<string> {
  const notes = getNotesDir(rootDir);
  await mkdir(notes, { recursive: true, mode: VAULT_DIR_MODE });
  if (path.dirname(path.resolve(filePath)) === path.resolve(notes)) {
    return filePath;
  }
  const content = await readFile(filePath, "utf8");
  const entry = parseVaultEntry(path.basename(filePath), content);
  const created = entry.created ? new Date(entry.created) : new Date();
  const validCreated = Number.isNaN(created.getTime()) ? new Date() : created;
  const destPath = await uniquePath(path.join(notes, noteFileName(validCreated, entry.title)));
  await rename(filePath, destPath);
  return destPath;
}

export async function migrateLegacyVaultToNotes(rootDir = getVaultDir()): Promise<number> {
  const vault = rootDir;
  const notes = getNotesDir(vault);
  await mkdir(notes, { recursive: true, mode: VAULT_DIR_MODE });
  let moved = 0;
  for (const rel of await listVaultMarkdownFiles(vault)) {
    if (rel.split(path.sep)[0] === "notes") {
      continue;
    }
    try {
      await fileNoteInNotes(path.join(vault, rel), vault);
      moved += 1;
    } catch {
      // skip unreadable or externally locked files
    }
  }
  await removeGeneratedIndexes(vault);
  await pruneEmptyLegacyDirs(vault);
  return moved;
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

/** @deprecated Use fileNoteInNotes. Kept so older imports do not recreate tag folders. */
export async function fileNoteUnderTag(inboxFilePath: string, tag: string): Promise<string> {
  void tag;
  return fileNoteInNotes(inboxFilePath);
}
