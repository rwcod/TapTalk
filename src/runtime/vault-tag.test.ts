import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyTags, buildTagMessages, isUntagged, parseTags, tagNoteFile, TAG_VOCABULARY } from "./vault-tag";

test("parseTags: keeps only vocab terms, deduped, capped at 3, vocab order", () => {
  assert.deepEqual(parseTags("code, todo"), ["todo", "code"]);
  assert.deepEqual(parseTags("Tags: TODO, CODE."), ["todo", "code"]);
  assert.deepEqual(parseTags("banana, foo"), []);
  assert.deepEqual(parseTags("todo todo todo"), ["todo"]);
  assert.equal(parseTags("todo, idea, quote, reference, code").length, 3);
});

test("buildTagMessages: system message lists the full closed vocabulary", () => {
  const [system] = buildTagMessages("some note");
  for (const tag of TAG_VOCABULARY) {
    assert.match(system.content, new RegExp(tag));
  }
});

test("isUntagged / applyTags: rewrites empty tags line, leaves tagged notes alone", () => {
  const note = "---\ncreated: x\ntags: []\n---\n\nbody";
  assert.equal(isUntagged(note), true);
  const tagged = applyTags(note, ["todo", "code"]);
  assert.match(tagged, /\ntags: \[todo, code\]\n/);
  assert.equal(isUntagged(tagged), false);
  assert.equal(applyTags(note, []), note);
});

test("tagNoteFile: tags one markdown file", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "taptalk-tag-"));
  try {
    const file = path.join(dir, "note.md");
    await writeFile(file, "---\ncreated: x\ntags: []\n---\n\nFix the auth bug");
    const result = await tagNoteFile(
      file,
      {
        enabled: true,
        provider: "openai-compatible",
        endpoint: "http://127.0.0.1/v1/chat/completions",
        model: "test",
        apiKey: ""
      },
      {
        retryDelayMs: 0,
        fetchImpl: async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: "todo, code" } }] }), {
            status: 200,
            headers: { "content-type": "application/json" }
          })
      }
    );

    assert.equal(result, "tagged");
    assert.match(await readFile(file, "utf8"), /\ntags: \[todo, code\]\n/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
