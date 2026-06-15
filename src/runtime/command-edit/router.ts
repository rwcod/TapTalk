import { EditingConfig, Settings } from "../../core/types";
import {
  OpenAiCompatibleCommandProvider,
  OpenAiCompatibleConfig,
  FetchLike
} from "./openai-compatible-provider";
import { matchRuleCommand, RuleBasedCommandProvider } from "./rule-based-provider";
import {
  CommandTransformInput,
  CommandTransformProvider,
  CommandTransformResult,
  EditProviderNotConfiguredError
} from "./types";

export type DictationRoute = "dictation" | "edit";

/**
 * Decide whether a shortcut activation should run normal dictation or the
 * selected-text edit path. Empty / whitespace-only selection => dictation.
 */
export function decideRoute(
  selectedText: string | null | undefined,
  editingEnabled: boolean
): DictationRoute {
  if (!editingEnabled) {
    return "dictation";
  }
  if (typeof selectedText !== "string" || selectedText.trim().length === 0) {
    return "dictation";
  }
  return "edit";
}

export interface CommandProviderDeps {
  fetchImpl?: FetchLike;
}

/**
 * Build the configured (non rule-based) provider for the given settings, or
 * null when the user has not opted into a richer provider. There is no
 * automatic fall-through here: a cloud/LLM provider is only ever returned when
 * it has been explicitly selected in settings.
 */
export function createConfiguredCommandProvider(
  config: EditingConfig,
  deps: CommandProviderDeps = {}
): CommandTransformProvider | null {
  if (config.provider === "openai-compatible") {
    const providerConfig: OpenAiCompatibleConfig = {
      endpoint: config.endpoint,
      model: config.model,
      apiKey: config.apiKey
    };
    return new OpenAiCompatibleCommandProvider(providerConfig, { fetchImpl: deps.fetchImpl });
  }

  return null;
}

/**
 * Resolve and run the edit. Order:
 *   1. If the spoken command clearly matches a local rule, use the rule-based
 *      provider (works even when a cloud provider is selected — keeps trivial
 *      edits fully local).
 *   2. Otherwise use the explicitly configured provider.
 *   3. If no configured provider exists, throw EditProviderNotConfiguredError
 *      and leave the selected text untouched.
 *
 * No automatic local -> cloud fallback ever happens.
 */
export async function transformSelectedText(
  input: CommandTransformInput,
  config: EditingConfig,
  deps: CommandProviderDeps = {}
): Promise<CommandTransformResult> {
  if (matchRuleCommand(input.commandText)) {
    return new RuleBasedCommandProvider().transform(input);
  }

  const provider = createConfiguredCommandProvider(config, deps);
  if (!provider) {
    throw new EditProviderNotConfiguredError();
  }

  if (!(await provider.isConfigured())) {
    throw new EditProviderNotConfiguredError();
  }

  return provider.transform(input);
}

export function isSelectedTextEditingEnabled(settings: Settings): boolean {
  return settings.editing.enabled === true;
}
