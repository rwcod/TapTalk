import { CommandTransformInput } from "./types";

export const EDIT_SYSTEM_PROMPT = `You are TapTalk's selected-text editing mode. The user selected some text and spoke a command. Produce the text that should replace the selection.

Rules:
- The spoken command is the primary instruction. Obey it fully — including rewriting the selection completely, expanding it, or producing substantially more text than was selected when the command asks for that.
- The selection is the starting point and the place the result goes. It may be short or trivial (a single word or a placeholder) — that is fine, still follow the command.
- Return only the replacement text. No explanations, no quotes, no preamble.
- Preserve the original language unless the command asks otherwise.
- For code, preserve correctness, indentation, and syntax.
- When background notes are provided, draw on them to fulfil the command (e.g. to supply requested information). If the command does not call for that information, ignore the notes.
- Only when the command is genuinely unclear, make the smallest sensible edit instead of inventing content.`;

export function buildEditUserPrompt(input: CommandTransformInput): string {
  const contextBlock = input.context
    ? `

Background notes you may draw on to fulfil the command (ignore if the command does not call for them):
"""
${input.context}
"""`
    : "";
  return `Selected text:
"""
${input.selectedText}
"""

Spoken command:
"""
${input.commandText}
"""${contextBlock}

Return only the replacement text.`;
}

export interface EditChatMessage {
  role: "system" | "user";
  content: string;
}

export function buildEditMessages(input: CommandTransformInput): EditChatMessage[] {
  return [
    { role: "system", content: EDIT_SYSTEM_PROMPT },
    { role: "user", content: buildEditUserPrompt(input) }
  ];
}
