import assert from "node:assert/strict";
import test from "node:test";
import { EditingConfig } from "../../core/types";
import {
  createConfiguredCommandProvider,
  decideRoute,
  transformSelectedText
} from "./router";
import { EditProviderNotConfiguredError, EditTransformFailedError } from "./types";

function makeEditing(overrides: Partial<EditingConfig> = {}): EditingConfig {
  return {
    enabled: true,
    provider: "rule-based",
    endpoint: "",
    model: "",
    apiKey: "",
    ...overrides
  };
}

test("decideRoute: empty selection routes to normal dictation", () => {
  assert.equal(decideRoute("", true), "dictation");
  assert.equal(decideRoute("   \n ", true), "dictation");
  assert.equal(decideRoute(null, true), "dictation");
  assert.equal(decideRoute(undefined, true), "dictation");
});

test("decideRoute: non-empty selection routes to edit path", () => {
  assert.equal(decideRoute("we need fix this shit before prod", true), "edit");
});

test("decideRoute: disabled editing always routes to dictation", () => {
  assert.equal(decideRoute("selected text", false), "dictation");
});

test("transformSelectedText: injects retrieved context into the request body", async () => {
  let sentBody = "";
  const config = makeEditing({
    provider: "openai-compatible",
    endpoint: "http://localhost:11434/v1/chat/completions",
    model: "llama3.1"
  });

  await transformSelectedText(
    { selectedText: "graphs are neat", commandText: "expand using my notes on RAG" },
    config,
    {
      fetchImpl: (async (_url: unknown, init: { body: string }) => {
        sentBody = init.body;
        return new Response(JSON.stringify({ choices: [{ message: { content: "expanded" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }) as unknown as typeof fetch,
      retrieveContext: async () => "RAG = retrieval augmented generation"
    }
  );

  assert.match(sentBody, /Background notes you may draw on/);
  assert.match(sentBody, /retrieval augmented generation/);
});

test("transformSelectedText: no context block when retriever returns null", async () => {
  let sentBody = "";
  const config = makeEditing({
    provider: "openai-compatible",
    endpoint: "http://localhost:11434/v1/chat/completions",
    model: "llama3.1"
  });

  await transformSelectedText(
    { selectedText: "x", commandText: "make this professional" },
    config,
    {
      fetchImpl: (async (_url: unknown, init: { body: string }) => {
        sentBody = init.body;
        return new Response(JSON.stringify({ choices: [{ message: { content: "y" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }) as unknown as typeof fetch,
      retrieveContext: async () => null
    }
  );

  assert.doesNotMatch(sentBody, /Background notes you may draw on/);
});

test("transformSelectedText: rule command stays local even with cloud selected", async () => {
  let fetchCalled = false;
  const config = makeEditing({
    provider: "openai-compatible",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    apiKey: "sk-test"
  });

  const result = await transformSelectedText(
    { selectedText: "hello world", commandText: "make this uppercase" },
    config,
    {
      fetchImpl: (async () => {
        fetchCalled = true;
        throw new Error("network should not be used for a rule command");
      }) as unknown as typeof fetch
    }
  );

  assert.equal(result.replacementText, "HELLO WORLD");
  assert.equal(result.provider, "rule-based");
  assert.equal(fetchCalled, false);
});

test("transformSelectedText: no provider configured throws and does not replace", async () => {
  const config = makeEditing({ provider: "rule-based" });
  await assert.rejects(
    () =>
      transformSelectedText(
        { selectedText: "we need fix this", commandText: "make this professional" },
        config
      ),
    EditProviderNotConfiguredError
  );
});

test("transformSelectedText: no automatic local -> cloud fallback", () => {
  // With provider "rule-based" selected, a non-rule command must NOT fall
  // through to any cloud provider.
  const provider = createConfiguredCommandProvider(makeEditing({ provider: "rule-based" }));
  assert.equal(provider, null);
});

test("transformSelectedText: unconfigured cloud provider throws not-configured", async () => {
  const config = makeEditing({
    provider: "openai-compatible",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    apiKey: "" // no key for a cloud endpoint
  });

  await assert.rejects(
    () =>
      transformSelectedText(
        { selectedText: "we need fix this", commandText: "make this professional" },
        config
      ),
    EditProviderNotConfiguredError
  );
});

test("transformSelectedText: provider failure surfaces and preserves original", async () => {
  const config = makeEditing({
    provider: "openai-compatible",
    endpoint: "http://localhost:11434/v1/chat/completions",
    model: "llama3.1"
  });

  await assert.rejects(
    () =>
      transformSelectedText(
        { selectedText: "original text", commandText: "make this professional" },
        config,
        {
          fetchImpl: (async () =>
            new Response("boom", { status: 500 })) as unknown as typeof fetch
        }
      ),
    EditTransformFailedError
  );
});
