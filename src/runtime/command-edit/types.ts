export type EditContentType = "text" | "code" | "unknown";

export interface CommandTransformInput {
  selectedText: string;
  commandText: string;
  language?: string;
  appName?: string;
  contentType?: EditContentType;
  /** Optional retrieved notes injected into the prompt (vault retrieval). */
  context?: string;
}

export interface CommandTransformResult {
  replacementText: string;
  provider: string;
  model?: string;
  latencyMs?: number;
}

export interface CommandTransformProvider {
  id: string;
  label: string;
  isLocal: boolean;
  isConfigured(): Promise<boolean>;
  transform(input: CommandTransformInput): Promise<CommandTransformResult>;
}

/**
 * Raised when the edit path is triggered but no usable provider is configured.
 * The UI surfaces this as "Configure an edit provider to transform selected text."
 */
export class EditProviderNotConfiguredError extends Error {
  constructor(message = "Configure an edit provider to transform selected text.") {
    super(message);
    this.name = "EditProviderNotConfiguredError";
  }
}

/**
 * Raised when a configured provider runs but cannot produce a usable replacement.
 * The original selected text must be left untouched when this is thrown.
 */
export class EditTransformFailedError extends Error {
  constructor(message = "Could not transform selected text.") {
    super(message);
    this.name = "EditTransformFailedError";
  }
}
