export const CONTINUITY_GUARD = `CONTINUITY RULES (never violate):
- Never rename established characters or change their established traits without explicit instruction.
- Maintain all established facts and canon throughout.
- Preserve the established tone and genre.
- Use standard screenplay formatting: scene headings in CAPS, character names CAPS before dialogue, action in present tense.
- Do not introduce major new characters unless the instruction requests it.
- Maintain consistent time-of-day and location logic.`;

export const SCREENPLAY_FORMAT_RULES = `SCREENPLAY FORMAT:
- Scene headings: INT./EXT. LOCATION - TIME OF DAY
- Action lines: Present tense, concise, vivid.
- Character names: ALL CAPS centered above their dialogue.
- Dialogue: Directly below character name.
- Parentheticals: (in parentheses) between character name and dialogue when needed.
- Transitions: CAPS, right-aligned (CUT TO:, FADE OUT., etc.).`;

export const SYSTEM_PROMPT_BASE = `You are an expert screenplay writer and collaborative writing assistant. You produce vivid, well-structured screenplay content that maintains narrative consistency and follows standard formatting conventions.

${SCREENPLAY_FORMAT_RULES}

${CONTINUITY_GUARD}

Always respond ONLY with screenplay content unless explicitly asked for meta-commentary. Never add explanations, notes, or commentary outside the screenplay text itself.`;

export function newScriptStartTemplate(instruction) {
  return `Write the opening of a new screenplay based on the following setup.
Establish the world, introduce key characters through action and dialogue, and create an engaging opening that hooks the reader.

SETUP:
${instruction}

Begin with a scene heading (INT. or EXT.) and write 1-2 opening scenes.`;
}

export function continueSceneTemplate(instruction) {
  return `Continue the screenplay from where it left off. The recent script context is provided above.

${instruction ? `DIRECTION: ${instruction}` : 'Continue the current scene naturally, advancing the plot and developing character dynamics.'}

Write the next portion of the script, maintaining momentum and consistency with everything established so far.`;
}

export function insertBlockTemplate(instruction, insertAfterContext) {
  return `Insert new screenplay content at the specified point in the script.

INSERT AFTER:
${insertAfterContext}

INSTRUCTION: ${instruction}

Write content that fits seamlessly between the surrounding context. Match the tone, pacing, and formatting.`;
}

export function regenerateBlockTemplate(instruction, blockToReplace) {
  return `Rewrite the following block of the screenplay. Do NOT change any content before or after this block-only rewrite what is between the markers.

BLOCK TO REWRITE:
---
${blockToReplace}
---

${instruction ? `DIRECTION: ${instruction}` : 'Improve this block while keeping it consistent with the surrounding script.'}

Write ONLY the replacement for this block. Preserve all character names, locations, and established facts exactly.`;
}

export function surpriseMeTemplate(styleHint) {
  return `Generate an unexpected but dramatically justified plot development for this screenplay. Consider the established characters, active plot threads, and overall tone.

STYLE GUIDANCE: ${styleHint || 'Match the established genre and tone.'}

Write the next beat of the story with an engaging twist or development that:
- Feels earned by what came before
- Opens new dramatic possibilities
- Stays true to established characters
- Maintains the genre and tone

Write 1-2 scenes of screenplay content.`;
}

export function surpriseSetupTemplate(genreHint) {
  return `Create a fresh screenplay setup and respond as JSON only.

${genreHint ? `TARGET GENRE: ${genreHint}` : 'Choose a random genre that supports strong dramatic conflict.'}

Return exactly one JSON object with this schema:
{
  "genre": "string",
  "premise": "1-2 sentence premise",
  "characters": ["Character Name", "Character Name"]
}

Constraints:
- "characters" must contain 2 to 4 names.
- Keep names concise and human-readable.
- Premise should be cinematic and specific.
- Output valid JSON only.
- Do not use markdown code fences.
- Do not include any extra text before or after the JSON.`;
}
