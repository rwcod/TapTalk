import test from "node:test";
import assert from "node:assert/strict";
import { ChatCompletionError, parseChatEndpoint, requestChatCompletion } from "./chat-completion";

const URL_OK = parseChatEndpoint("http://localhost:11434/v1/chat/completions", "x")!;
const CONFIG = { endpoint: "", model: "m", apiKey: "" };

function fetchSequence(statuses: number[]): { impl: typeof fetch; calls: () => number } {
  let i = 0;
  const impl = (async () => {
    const status = statuses[Math.min(i, statuses.length - 1)];
    i += 1;
    if (status === 200) {
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    }
    return new Response("err", { status });
  }) as unknown as typeof fetch;
  return { impl, calls: () => i };
}

test("requestChatCompletion: retries transient 503 then succeeds", async () => {
  const seq = fetchSequence([503, 503, 200]);
  const out = await requestChatCompletion(URL_OK, CONFIG, [], { fetchImpl: seq.impl, retryDelayMs: 0 });
  assert.equal(out, "ok");
  assert.equal(seq.calls(), 3);
});

test("requestChatCompletion: gives up after MAX_ATTEMPTS on persistent 503", async () => {
  const seq = fetchSequence([503]);
  await assert.rejects(
    () => requestChatCompletion(URL_OK, CONFIG, [], { fetchImpl: seq.impl, retryDelayMs: 0 }),
    ChatCompletionError
  );
  assert.equal(seq.calls(), 3);
});

test("requestChatCompletion: does not retry a non-transient 400", async () => {
  const seq = fetchSequence([400]);
  await assert.rejects(
    () => requestChatCompletion(URL_OK, CONFIG, [], { fetchImpl: seq.impl, retryDelayMs: 0 }),
    ChatCompletionError
  );
  assert.equal(seq.calls(), 1);
});
