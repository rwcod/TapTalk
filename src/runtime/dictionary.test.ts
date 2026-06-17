import test from "node:test";
import assert from "node:assert/strict";
import { buildInitialPrompt, parseDictionary } from "./dictionary";

test("parseDictionary: terms, replacements, comments, blanks", () => {
  const dict = parseDictionary(
    [
      "# comment",
      "",
      "Supabase",
      "clod => Claude",
      "type script => TypeScript",
      "  # indented comment",
      "SKD"
    ].join("\n")
  );
  // replacement RHS also become recognition terms, deduped
  assert.deepEqual(dict.terms, ["Supabase", "Claude", "TypeScript", "SKD"]);
  assert.equal(dict.replacements.length, 2);
  assert.equal("clod".replace(dict.replacements[0].pattern, dict.replacements[0].value), "Claude");
});

test("parseDictionary: replacement is whole-word and case-insensitive", () => {
  const dict = parseDictionary("clod => Claude");
  assert.equal("I love clod and CLOD".replace(dict.replacements[0].pattern, dict.replacements[0].value), "I love Claude and Claude");
  assert.equal("unclodding".replace(dict.replacements[0].pattern, dict.replacements[0].value), "unclodding");
});

test("buildInitialPrompt: joins and caps length", () => {
  assert.equal(buildInitialPrompt([]), "");
  assert.equal(buildInitialPrompt(["a", "b"]), "a, b");
  const long = Array.from({ length: 500 }, (_, i) => `term${i}`);
  assert.ok(buildInitialPrompt(long).length <= 600);
});
