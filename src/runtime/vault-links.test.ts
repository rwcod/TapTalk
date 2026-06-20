import test from "node:test";
import assert from "node:assert/strict";
import { appendWikilink, suggestVaultLinks, wikilinkForEntry } from "./vault-links";
import type { VaultEntry } from "./vault";

function entry(file: string, title: string, tags: string[], excerpt: string): VaultEntry {
  return { file, title, source: "x", created: "", tags, excerpt };
}

test("wikilinkForEntry: links by vault-relative path without extension", () => {
  assert.equal(
    wikilinkForEntry(entry("notes/2026-06-19 - OKF.md", "OKF", [], "")),
    "[[notes/2026-06-19 - OKF]]"
  );
});

test("appendWikilink: appends once under Links", () => {
  const linked = appendWikilink("Body", "[[notes/A]]");
  assert.equal(linked, "Body\n\n## Links\n\n- [[notes/A]]\n");
  assert.equal(appendWikilink(linked, "[[notes/A]]"), linked);
});

test("suggestVaultLinks: ranks notes by shared tags and words", () => {
  const current = entry("notes/current.md", "TapTalk Obsidian capture", ["obsidian"], "");
  const suggestions = suggestVaultLinks(current, "OKF markdown capture format", [
    current,
    entry("notes/okf.md", "OKF markdown format", ["reference"], "capture frontmatter"),
    entry("notes/obsidian.md", "Obsidian vault", ["obsidian"], "graph links"),
    entry("notes/unrelated.md", "Invoice", ["finance"], "payment terms")
  ]);

  assert.deepEqual(suggestions.map((item) => item.file), [
    "notes/obsidian.md",
    "notes/okf.md"
  ]);
});
