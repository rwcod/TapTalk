import { ensureSafeCloudHttpProtocol, isLoopbackOrPrivateHost } from "../../core/url-security";

export type FetchLike = typeof fetch;

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface ChatEndpointConfig {
  endpoint: string;
  model: string;
  apiKey: string;
}

export interface ChatRequestDeps {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  /** Base linear backoff between retries (ms). Tests set 0. */
  retryDelayMs?: number;
}

export class ChatCompletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatCompletionError";
  }
}

export function parseChatEndpoint(endpoint: string, field: string): URL | null {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    ensureSafeCloudHttpProtocol(url, field);
    return url;
  } catch {
    return null;
  }
}

export function isLocalChatEndpoint(url: URL): boolean {
  return isLoopbackOrPrivateHost(url.hostname);
}

function extractContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }
  const first = choices[0] as { message?: { content?: unknown } };
  const content = first?.message?.content;
  return typeof content === "string" ? content : "";
}

/**
 * One OpenAI Chat Completions request. Returns the assistant message content
 * (possibly empty — the caller decides whether empty is an error). Throws
 * ChatCompletionError on transport/HTTP/parse failures. Shared by the edit
 * provider and the vault tagger so the HTTP contract lives in one place.
 */
// Transient: worth retrying. 429 = rate limit, 5xx = provider hiccup (Gemini
// returns 503 under load). 4xx (bad key/request) is not retried — it won't fix.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function requestChatCompletion(
  url: URL,
  config: ChatEndpointConfig,
  messages: ChatMessage[],
  deps: ChatRequestDeps = {}
): Promise<string> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 120000;
  const retryDelayMs = deps.retryDelayMs ?? 600;

  const headers = new Headers({ "Content-Type": "application/json" });
  const apiKey = config.apiKey.trim();
  if (apiKey) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }
  const body = JSON.stringify({ model: config.model.trim(), messages, temperature: 0, stream: false });

  let lastError = new ChatCompletionError("Chat provider request failed.");
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
        redirect: "error"
      });

      if (response.ok) {
        try {
          return extractContent(await response.json());
        } catch {
          throw new ChatCompletionError("Chat provider returned an unreadable response.");
        }
      }

      lastError = new ChatCompletionError(`Chat provider returned HTTP ${response.status}.`);
      if (!RETRYABLE_STATUS.has(response.status)) {
        throw lastError;
      }
    } catch (error) {
      if (error instanceof ChatCompletionError && !/HTTP (429|5\d\d)/.test(error.message)) {
        throw error; // unreadable body or non-retryable status — do not retry
      }
      lastError = controller.signal.aborted
        ? new ChatCompletionError(`Chat provider timed out after ${timeoutMs}ms.`)
        : error instanceof ChatCompletionError
          ? error
          : new ChatCompletionError(
              `Chat provider request failed: ${error instanceof Error ? error.message : String(error)}`
            );
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(retryDelayMs * attempt); // linear backoff
    }
  }
  throw lastError;
}
