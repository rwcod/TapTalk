import assert from "node:assert/strict";
import test from "node:test";
import { buildEditMessages, buildEditUserPrompt, EDIT_SYSTEM_PROMPT } from "./prompt";

test("buildEditUserPrompt embeds selected text and command in fenced blocks", () => {
  const prompt = buildEditUserPrompt({
    selectedText: "we need fix this shit before prod",
    commandText: "make this professional"
  });

  assert.match(prompt, /Selected text:/);
  assert.match(prompt, /we need fix this shit before prod/);
  assert.match(prompt, /Spoken command:/);
  assert.match(prompt, /make this professional/);
  assert.match(prompt, /Return only the replacement text\./);
});

test("buildEditMessages returns a system + user pair", () => {
  const messages = buildEditMessages({
    selectedText: "abc",
    commandText: "uppercase"
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.equal(messages[0].content, EDIT_SYSTEM_PROMPT);
  assert.equal(messages[1].role, "user");
  assert.match(messages[1].content, /abc/);
});

test("system prompt makes the command primary and allows full rewrites", () => {
  assert.match(EDIT_SYSTEM_PROMPT, /Return only the replacement text\./);
  assert.match(EDIT_SYSTEM_PROMPT, /command is the primary instruction/i);
  assert.match(EDIT_SYSTEM_PROMPT, /rewriting the selection completely/i);
});
