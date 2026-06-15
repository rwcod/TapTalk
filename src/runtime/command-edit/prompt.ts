import { CommandTransformInput } from "./types";

export const EDIT_SYSTEM_PROMPT = `You are TapTalk selected-text editing mode.
Transform the selected text according to the user's spoken command.

Rules:
- Return only the transformed text.
- Do not explain.
- Do not wrap the answer in quotes.
- Preserve the original language unless the command asks for translation.
- Preserve meaning unless the command asks to change it.
- Preserve formatting when useful.
- For code, preserve correctness, indentation, and syntax.
- If the command is ambiguous, make the smallest useful edit.
- If the command cannot be applied, return the original selected text unchanged.`;

export function buildEditUserPrompt(input: CommandTransformInput): string {
  return `Selected text:
"""
${input.selectedText}
"""

Spoken command:
"""
${input.commandText}
"""

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
