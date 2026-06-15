import {
  CommandTransformInput,
  CommandTransformProvider,
  CommandTransformResult,
  EditTransformFailedError
} from "./types";

type RuleFn = (text: string) => string;

interface RuleDefinition {
  id: string;
  apply: RuleFn;
  /** Lowercased keyword phrases that clearly select this rule. */
  keywords: string[];
}

const RULES: RuleDefinition[] = [
  {
    id: "uppercase",
    apply: (text) => text.toUpperCase(),
    keywords: ["uppercase", "upper case", "all caps", "capitalize all", "wielkie litery", "kapitaliki"]
  },
  {
    id: "lowercase",
    apply: (text) => text.toLowerCase(),
    keywords: ["lowercase", "lower case", "small letters", "małe litery"]
  },
  {
    id: "trim",
    apply: (text) => text.trim(),
    keywords: ["trim", "trim whitespace", "remove spaces", "strip whitespace", "usuń spacje"]
  },
  {
    id: "remove-line-breaks",
    apply: (text) => text.replace(/\r?\n+/g, " ").replace(/[ \t]{2,}/g, " ").trim(),
    keywords: [
      "remove line breaks",
      "remove linebreaks",
      "remove newlines",
      "single line",
      "one line",
      "join lines",
      "usuń nowe linie",
      "jedna linia"
    ]
  }
];

/**
 * Returns the rule that the spoken command clearly matches, or null when the
 * command needs a richer (LLM) provider. Matching is intentionally strict so
 * that ambiguous commands fall through to the configured provider instead of
 * being silently mishandled by a local rule.
 */
export function matchRuleCommand(commandText: string): RuleDefinition | null {
  const normalized = commandText.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  for (const rule of RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule;
    }
  }

  return null;
}

export class RuleBasedCommandProvider implements CommandTransformProvider {
  readonly id = "rule-based";
  readonly label = "Basic Local Commands";
  readonly isLocal = true;

  async isConfigured(): Promise<boolean> {
    return true;
  }

  async transform(input: CommandTransformInput): Promise<CommandTransformResult> {
    const start = Date.now();
    const rule = matchRuleCommand(input.commandText);
    if (!rule) {
      throw new EditTransformFailedError(
        "Basic Local Commands could not understand that edit command."
      );
    }

    const replacementText = rule.apply(input.selectedText);
    return {
      replacementText,
      provider: this.id,
      model: rule.id,
      latencyMs: Date.now() - start
    };
  }
}
