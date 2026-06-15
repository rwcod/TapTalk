import assert from "node:assert/strict";
import test from "node:test";
import { matchRuleCommand, RuleBasedCommandProvider } from "./rule-based-provider";
import { EditTransformFailedError } from "./types";

test("matchRuleCommand recognizes the four built-in commands", () => {
  assert.equal(matchRuleCommand("make this uppercase")?.id, "uppercase");
  assert.equal(matchRuleCommand("lowercase please")?.id, "lowercase");
  assert.equal(matchRuleCommand("trim whitespace")?.id, "trim");
  assert.equal(matchRuleCommand("remove line breaks")?.id, "remove-line-breaks");
});

test("matchRuleCommand returns null for non-rule commands", () => {
  assert.equal(matchRuleCommand("make this professional"), null);
  assert.equal(matchRuleCommand("make it shorter"), null);
  assert.equal(matchRuleCommand(""), null);
});

test("RuleBasedCommandProvider applies uppercase", async () => {
  const provider = new RuleBasedCommandProvider();
  const result = await provider.transform({
    selectedText: "hello world",
    commandText: "uppercase"
  });
  assert.equal(result.replacementText, "HELLO WORLD");
  assert.equal(result.provider, "rule-based");
});

test("RuleBasedCommandProvider collapses line breaks", async () => {
  const provider = new RuleBasedCommandProvider();
  const result = await provider.transform({
    selectedText: "line one\nline two\n\nline three",
    commandText: "remove line breaks"
  });
  assert.equal(result.replacementText, "line one line two line three");
});

test("RuleBasedCommandProvider is always configured and local", async () => {
  const provider = new RuleBasedCommandProvider();
  assert.equal(provider.isLocal, true);
  assert.equal(await provider.isConfigured(), true);
});

test("RuleBasedCommandProvider throws on an unsupported command", async () => {
  const provider = new RuleBasedCommandProvider();
  await assert.rejects(
    () => provider.transform({ selectedText: "x", commandText: "translate to french" }),
    EditTransformFailedError
  );
});
