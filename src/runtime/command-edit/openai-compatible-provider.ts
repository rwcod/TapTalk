import { buildEditMessages } from "./prompt";
import {
  ChatCompletionError,
  ChatRequestDeps,
  FetchLike,
  isLocalChatEndpoint,
  parseChatEndpoint,
  requestChatCompletion
} from "./chat-completion";
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

export type { FetchLike };

type OpenAiCompatibleDeps = ChatRequestDeps;

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
  private readonly deps: OpenAiCompatibleDeps;

  constructor(private readonly config: OpenAiCompatibleConfig, deps: OpenAiCompatibleDeps = {}) {
    this.url = parseChatEndpoint(config.endpoint, "editing.endpoint");
    this.deps = deps;
  }

  get isLocal(): boolean {
    return this.url ? isLocalChatEndpoint(this.url) : false;
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
    let content: string;
    try {
      content = await requestChatCompletion(this.url, this.config, buildEditMessages(input), this.deps);
    } catch (error) {
      const reason = error instanceof ChatCompletionError ? error.message : String(error);
      throw new EditTransformFailedError(reason);
    }

    if (!content.trim()) {
      throw new EditTransformFailedError("Edit provider returned an empty replacement.");
    }

    return {
      replacementText: content,
      provider: this.id,
      model: this.config.model.trim(),
      latencyMs: Date.now() - start
    };
  }
}
