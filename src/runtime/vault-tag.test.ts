import test from "node:test";
import assert from "node:assert/strict";
import { applyTags, buildTagMessages, isUntagged, parseTags, TAG_VOCABULARY } from "./vault-tag";

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
