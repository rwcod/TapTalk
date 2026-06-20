import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildCaptureMarkdown,
  captureToVault,
  migrateLegacyVaultToNotes,
  parseVaultEntry
} from "./vault";

const CREATED = new Date("2026-06-16T14:30:22.000Z");

test("buildCaptureMarkdown: OKF frontmatter (type/title/created/source/tags)", () => {
  const md = buildCaptureMarkdown({
    text: "Fix the auth bug\nmore detail here",
    source: "Safari",
    created: CREATED
  });
  assert.match(md, /^---\ntype: note\n/);
  assert.match(md, /created: 2026-06-16T14:30:22\.000Z\n/);
  assert.doesNotMatch(md, /timestamp:/);
  assert.match(md, /source: "Safari"\n/);
  assert.match(md, /title: "Fix the auth bug"\n/);
  assert.match(md, /tags: \[\]\n/);
  assert.match(md, /---\n\nFix the auth bug\nmore detail here\n$/);
});

test("parseVaultEntry: round-trips a built capture, parses tags list", () => {
  const md = buildCaptureMarkdown({ text: "Call Marek", source: "Notes", created: CREATED })
    .replace("tags: []", "tags: [todo, kontakt]");
  const entry = parseVaultEntry("2026-06-16-x.md", md);
  assert.equal(entry.file, "2026-06-16-x.md");
  assert.equal(entry.title, "Call Marek");
  assert.equal(entry.source, "Notes");
  assert.equal(entry.created, "2026-06-16T14:30:22.000Z");
  assert.deepEqual(entry.tags, ["todo", "kontakt"]);
});

test("parseVaultEntry: empty tags and missing title fall back to file name", () => {
  const entry = parseVaultEntry("note.md", "---\ncreated: 2026-01-01T00:00:00.000Z\ntags: []\n---\n\nbody");
  assert.deepEqual(entry.tags, []);
  assert.equal(entry.title, "note");
  assert.equal(entry.source, "unknown");
});

test("parseVaultEntry: still reads legacy timestamp", () => {
  const entry = parseVaultEntry("note.md", "---\ntimestamp: 2026-01-01T00:00:00.000Z\ntags: []\n---\n\nbody");
  assert.equal(entry.created, "2026-01-01T00:00:00.000Z");
});

test("parseVaultEntry: handles Obsidian headings and tags", () => {
  const entry = parseVaultEntry(
    "strategy/pricing.md",
    "---\ntags:\n  - strategy\n  - pricing\n---\n\n# Pricing Notes\n\nUse #reference sparingly."
  );
  assert.equal(entry.title, "Pricing Notes");
  assert.deepEqual(entry.tags, ["strategy", "pricing", "reference"]);
});

test("buildCaptureMarkdown: title skips blank leading lines and stays valid yaml", () => {
  const md = buildCaptureMarkdown({
    text: '\n\n  weird: "title" with colon  \nbody',
    source: null,
    created: CREATED
  });
  // JSON.stringify escapes the inner quotes -> valid double-quoted YAML scalar.
  assert.match(md, /title: "weird: \\"title\\" with colon"\n/);
  assert.match(md, /source: "unknown"\n/);
});

test("captureToVault: writes a readable Obsidian-friendly filename", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "taptalk-vault-"));
  try {
    const file = await captureToVault(
      { text: "Fix auth: bug? * now\nbody", source: "Safari", created: CREATED },
      { destinationDir: dir }
    );
    assert.equal(path.basename(file), "2026-06-16 - Fix auth bug now.md");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("migrateLegacyVaultToNotes: flattens tag folders and removes generated indexes", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "taptalk-vault-"));
  try {
    await mkdir(path.join(dir, "idea"), { recursive: true });
    await writeFile(
      path.join(dir, "idea", "2026-06-16-15-32-48-gei6.md"),
      buildCaptureMarkdown({ text: "Graph Cleanup\nbody", source: "Safari", created: CREATED }).replace("tags: []", "tags: [idea]")
    );
    await writeFile(path.join(dir, "idea", "index.md"), "# idea\n");

    const moved = await migrateLegacyVaultToNotes(dir);
    const names = await readdir(path.join(dir, "notes"));

    assert.equal(moved, 1);
    assert.deepEqual(names, ["2026-06-16 - Graph Cleanup.md"]);
    await assert.rejects(access(path.join(dir, "idea")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
