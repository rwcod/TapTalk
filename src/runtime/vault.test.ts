import test from "node:test";
import assert from "node:assert/strict";
import { buildCaptureMarkdown, parseVaultEntry } from "./vault";

const CREATED = new Date("2026-06-16T14:30:22.000Z");

test("buildCaptureMarkdown: OKF frontmatter (type/title/timestamp/source/tags)", () => {
  const md = buildCaptureMarkdown({
    text: "Fix the auth bug\nmore detail here",
    source: "Safari",
    created: CREATED
  });
  assert.match(md, /^---\ntype: note\n/);
  assert.match(md, /timestamp: 2026-06-16T14:30:22\.000Z\n/);
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
  assert.equal(entry.title, "note.md");
  assert.equal(entry.source, "unknown");
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
