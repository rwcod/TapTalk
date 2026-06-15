import { ensureSafeCloudHttpProtocol, isLoopbackOrPrivateHost } from "../../core/url-security";
import { buildEditMessages } from "./prompt";
import {
  CommandTransformInput,
  CommandTransformProvider,
  CommandTransformResult,
  EditTransformFailedError
} from "./types";

export interface OpenAiCompatibleConfig {
  endpoint: string;
  model: string;
  apiKey: string;
}

export type FetchLike = typeof fetch;

interface OpenAiCompatibleDeps {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

function parseEndpoint(endpoint: string): URL | null {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    ensureSafeCloudHttpProtocol(url, "editing.endpoint");
    return url;
  } catch {
    return null;
  }
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
 * Minimal OpenAI Chat Completions compatible provider. Works against any
 * endpoint that speaks the `/v1/chat/completions` contract, including a local
 * Ollama server (http://localhost:11434/v1/chat/completions) or OpenAI itself.
 * An endpoint on a loopback/private host is treated as local; everything else
 * is a cloud provider and requires an API key.
 */
export class OpenAiCompatibleCommandProvider implements CommandTransformProvider {
  readonly id = "openai-compatible";
  readonly label = "Local LLM / OpenAI-compatible";

  private readonly url: URL | null;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(private readonly config: OpenAiCompatibleConfig, deps: OpenAiCompatibleDeps = {}) {
    this.url = parseEndpoint(config.endpoint);
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.timeoutMs = deps.timeoutMs ?? 120000;
  }

  get isLocal(): boolean {
    return this.url ? isLoopbackOrPrivateHost(this.url.hostname) : false;
  }

  async isConfigured(): Promise<boolean> {
    if (!this.url || !this.config.model.trim()) {
      return false;
    }

    // Cloud endpoints must have an explicit API key; local endpoints may not.
    if (!this.isLocal && !this.config.apiKey.trim()) {
      return false;
    }

    return true;
  }

  async transform(input: CommandTransformInput): Promise<CommandTransformResult> {
    if (!this.url) {
      throw new EditTransformFailedError("Edit endpoint is not a valid URL.");
    }

    const start = Date.now();
    const headers = new Headers({ "Content-Type": "application/json" });
    const apiKey = this.config.apiKey.trim();
    if (apiKey) {
      headers.set("Authorization", `Bearer ${apiKey}`);
    }

    const body = JSON.stringify({
      model: this.config.model.trim(),
      messages: buildEditMessages(input),
      temperature: 0,
      stream: false
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
        redirect: "error"
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new EditTransformFailedError(`Edit provider timed out after ${this.timeoutMs}ms.`);
      }
      const reason = error instanceof Error ? error.message : String(error);
      throw new EditTransformFailedError(`Edit provider request failed: ${reason}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new EditTransformFailedError(`Edit provider returned HTTP ${response.status}.`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new EditTransformFailedError("Edit provider returned an unreadable response.");
    }

    const replacementText = extractContent(payload);
    if (!replacementText.trim()) {
      throw new EditTransformFailedError("Edit provider returned an empty replacement.");
    }

    return {
      replacementText,
      provider: this.id,
      model: this.config.model.trim(),
      latencyMs: Date.now() - start
    };
  }
}
