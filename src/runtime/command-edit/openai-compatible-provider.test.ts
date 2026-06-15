import assert from "node:assert/strict";
import test from "node:test";
import { OpenAiCompatibleCommandProvider } from "./openai-compatible-provider";
import { EditTransformFailedError } from "./types";

function jsonResponse(content: string): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })) as unknown as typeof fetch;
}

test("isLocal is true for loopback endpoints, false for cloud", () => {
  const local = new OpenAiCompatibleCommandProvider({
    endpoint: "http://localhost:11434/v1/chat/completions",
    model: "llama3.1",
    apiKey: ""
  });
  const cloud = new OpenAiCompatibleCommandProvider({
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    apiKey: "sk-test"
  });
  assert.equal(local.isLocal, true);
  assert.equal(cloud.isLocal, false);
});

test("isConfigured requires an API key for cloud but not for local", async () => {
  const localNoKey = new OpenAiCompatibleCommandProvider({
    endpoint: "http://localhost:11434/v1/chat/completions",
    model: "llama3.1",
    apiKey: ""
  });
  const cloudNoKey = new OpenAiCompatibleCommandProvider({
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    apiKey: ""
  });
  assert.equal(await localNoKey.isConfigured(), true);
  assert.equal(await cloudNoKey.isConfigured(), false);
});

test("isConfigured is false without an endpoint or model", async () => {
  const noEndpoint = new OpenAiCompatibleCommandProvider({
    endpoint: "",
    model: "llama3.1",
    apiKey: ""
  });
  const noModel = new OpenAiCompatibleCommandProvider({
    endpoint: "http://localhost:11434/v1/chat/completions",
    model: "",
    apiKey: ""
  });
  assert.equal(await noEndpoint.isConfigured(), false);
  assert.equal(await noModel.isConfigured(), false);
});

test("transform parses choices[0].message.content", async () => {
  const provider = new OpenAiCompatibleCommandProvider(
    {
      endpoint: "http://localhost:11434/v1/chat/completions",
      model: "llama3.1",
      apiKey: ""
    },
    { fetchImpl: jsonResponse("We need to resolve this before the production deployment.") }
  );

  const result = await provider.transform({
    selectedText: "we need fix this shit before prod",
    commandText: "make this professional"
  });

  assert.equal(
    result.replacementText,
    "We need to resolve this before the production deployment."
  );
  assert.equal(result.provider, "openai-compatible");
  assert.equal(result.model, "llama3.1");
});

test("transform throws when the model returns an empty replacement", async () => {
  const provider = new OpenAiCompatibleCommandProvider(
    {
      endpoint: "http://localhost:11434/v1/chat/completions",
      model: "llama3.1",
      apiKey: ""
    },
    { fetchImpl: jsonResponse("   ") }
  );

  await assert.rejects(
    () => provider.transform({ selectedText: "abc", commandText: "do something" }),
    EditTransformFailedError
  );
});

test("transform throws on a non-OK HTTP status", async () => {
  const provider = new OpenAiCompatibleCommandProvider(
    {
      endpoint: "http://localhost:11434/v1/chat/completions",
      model: "llama3.1",
      apiKey: ""
    },
    {
      fetchImpl: (async () =>
        new Response("nope", { status: 500 })) as unknown as typeof fetch
    }
  );

  await assert.rejects(
    () => provider.transform({ selectedText: "abc", commandText: "do something" }),
    EditTransformFailedError
  );
});
