import test from "node:test";
import assert from "node:assert/strict";
import { buildSelectionMessages, parseSelection } from "./vault-retrieval";

const entry = (title: string, tags: string[], excerpt: string) => ({
  file: title,
  title,
  source: "x",
  created: "",
  tags,
  excerpt
});

test("parseSelection: extracts in-range indices, deduped, capped", () => {
  assert.deepEqual(parseSelection("1, 3", 5), [1, 3]);
  assert.deepEqual(parseSelection("none", 5), []);
  assert.deepEqual(parseSelection("note 2 and 2", 5), [2]);
  assert.deepEqual(parseSelection("7, 9", 5), []); // out of range
  assert.deepEqual(parseSelection("1 2 3 4 5", 9), [1, 2, 3]); // capped at MAX_NOTES
});

test("buildSelectionMessages: catalog is numbered with title, tags, excerpt", () => {
  const [system, user] = buildSelectionMessages("rewrite about pests", "siema", [
    entry("Pest control", ["idea"], "how to fight pests"),
    entry("SKD case", ["reference"], "loan sanction")
  ]);
  assert.match(system.content, /relevant/i);
  assert.match(user.content, /1\. Pest control \[idea\] — how to fight pests/);
  assert.match(user.content, /2\. SKD case \[reference\]/);
  assert.match(user.content, /rewrite about pests/);
});
