import { describe, expect, it } from 'vitest';
import {
  buildGenerateScenePrompt,
  buildPlotTwistPrompt,
  buildScriptElementPrompt,
  buildRegenerateBlockPrompt,
  buildSurpriseSetupPrompt,
  formatStyleBlock
} from '../server/llm/promptBuilders.js';

describe('promptBuilders style injection', () => {
  it('formats style by trimming, collapsing whitespace, capping at 500 chars, and preserving case', () => {
    const formatted = formatStyleBlock('  Mixed   CASE   Style   Cue  ');
    expect(formatted).toBe('Style Theme: Mixed CASE Style Cue');
    expect(formatted).toContain('Mixed CASE');

    const longStyle = `AB${' x'.repeat(600)}`;
    const capped = formatStyleBlock(longStyle);
    expect(capped.startsWith('Style Theme: ')).toBe(true);
    const payload = capped.replace(/^Style Theme:\s*/, '');
    expect(payload.length).toBeLessThanOrEqual(500);
  });

  it('injects style into generateScene prompt', () => {
    const { instructions, input, previewText } = buildGenerateScenePrompt({
      genre: 'Noir',
      premise: 'A detective unravels a conspiracy.',
      characters: ['Alex'],
      scenes: [],
      userInstruction: 'Open with a tense beat.',
      isFirstScene: true,
      styleContext: 'Style: 1940s Noir Detective (noir-1940s-detective). Style guidance: Everyone speaks in brooding metaphors.',
      targetLength: 'Medium'
    });
    expect(input).toContain('Style Theme: Style: 1940s Noir Detective (noir-1940s-detective). Style guidance: Everyone speaks in brooding metaphors.');
    expect(instructions).toContain('Completion criteria:');
    expect(instructions).toContain('Advance the story with a concrete turn, reveal, or complication.');
    expect(instructions).not.toContain('The JSON schema is:');
    expect(instructions).not.toContain('Do NOT emit a heading block inside "blocks".');
    expect(instructions).toContain('Return ONLY a JSON object representing the scene.');
    expect(previewText).toContain('Instructions:');
    expect(previewText).toContain('Input:');
  });

  it('uses older scene summaries plus detailed recent-scene context for generateScene', () => {
    const { input } = buildGenerateScenePrompt({
      genre: 'Noir',
      premise: 'A detective unravels a conspiracy.',
      characters: ['Alex', 'Mara'],
      scenes: [
        {
          heading: 'INT. BAR - NIGHT',
          summary: 'Alex corners a reluctant informant.'
        },
        {
          heading: 'EXT. DOCKS - LATER',
          summary: 'Mara spots the handoff before it goes wrong.',
          blocks: [
            { type: 'action', text: 'Rain pelts the dock as Mara watches a shadow slip between crates.' },
            { type: 'dialogue', character: 'Mara', text: 'He is early.', parenthetical: '(into earpiece)' },
            { type: 'action', text: 'A gun clatters across the planks when the courier stumbles.' },
            { type: 'transition', text: 'CUT TO:' }
          ]
        }
      ],
      userInstruction: 'Continue the fallout.',
      isFirstScene: false,
      targetLength: 'Medium'
    });

    expect(input).toContain('Earlier scene summaries:\nScene 1: Alex corners a reluctant informant.');
    expect(input).toContain('Most recent prior scene:\nHeading: EXT. DOCKS - LATER');
    expect(input).toContain('Recent blocks:\n1. DIALOGUE - Mara (into earpiece): He is early.');
    expect(input).toContain('2. ACTION: A gun clatters across the planks when the courier stumbles.');
    expect(input).toContain('3. TRANSITION: CUT TO:');
    expect(input).not.toContain('Rain pelts the dock as Mara watches a shadow slip between crates.');
  });

  it('injects style into suggestPlotTwist prompt', () => {
    const prompt = buildPlotTwistPrompt({
      genre: 'Noir',
      premise: 'A detective unravels a conspiracy.',
      characters: ['Alex', 'Mara'],
      recentSceneHeading: 'EXT. DOCKS - LATER',
      recentSceneSummary: 'Mara spots the handoff before it goes wrong.',
      userInstruction: 'Make the next beat feel dangerous.',
      style: 'Style: 1940s Noir Detective (noir-1940s-detective). Style guidance: Everyone speaks in brooding metaphors.'
    });
    expect(prompt.input).toContain('Premise: A detective unravels a conspiracy.');
    expect(prompt.input).toContain('Named characters: Alex, Mara.');
    expect(prompt.input).toContain('Recent story context:\nHeading: EXT. DOCKS - LATER\nSummary: Mara spots the handoff before it goes wrong.');
    expect(prompt.input).toContain('Current user instruction: Make the next beat feel dangerous.');
    expect(prompt.input).toContain('Style Theme: Style: 1940s Noir Detective (noir-1940s-detective). Style guidance: Everyone speaks in brooding metaphors.');
    expect(prompt.instructions).toContain('It must stay compatible with the premise, named characters, and recent story facts.');
    expect(prompt.instructions).toContain('Avoid generic filler phrasing or vague "everything changes" language.');
    expect(prompt.instructions).toContain('Output only one sentence.');
  });

  it('injects style into generateScriptElement prompt', () => {
    const prompt = buildScriptElementPrompt({
      type: 'action',
      character: undefined,
      instruction: 'Set mood quickly.',
      styleContext: 'Genre: Noir. Style: Cinematic.'
    });
    expect(prompt.input).toContain('Style Theme: Genre: Noir. Style: Cinematic.');
    expect(prompt.instructions).toContain('Write a concise screenplay action line.');
  });

  it('injects style into regenerateScriptBlock prompt for dialogue and non-dialogue', () => {
    const dialoguePrompt = buildRegenerateBlockPrompt({
      type: 'dialogue',
      character: 'Alex',
      genre: 'Noir',
      premise: 'A detective unravels a conspiracy.',
      text: 'I know.',
      style: 'Style: 1940s Noir Detective (noir-1940s-detective). Style guidance: Everyone speaks in brooding metaphors.',
      rewriteGuidance: 'Sharpen it.'
    });
    expect(dialoguePrompt.input).toContain('Style Theme: Style: 1940s Noir Detective (noir-1940s-detective). Style guidance: Everyone speaks in brooding metaphors.');
    expect(dialoguePrompt.instructions).toContain("preserving the line's core intent");
    expect(dialoguePrompt.instructions).toContain('Keep the same speaker identity and stay consistent with the surrounding story continuity.');
    expect(dialoguePrompt.instructions).toContain('Output ONLY the new dialogue text.');

    const actionPrompt = buildRegenerateBlockPrompt({
      type: 'action',
      character: undefined,
      genre: 'Noir',
      premise: 'A detective unravels a conspiracy.',
      text: 'He stares at the board.',
      style: 'Style: 1940s Noir Detective (noir-1940s-detective). Style guidance: Everyone speaks in brooding metaphors.',
      rewriteGuidance: 'Make it vivid.'
    });
    expect(actionPrompt.input).toContain('Style Theme: Style: 1940s Noir Detective (noir-1940s-detective). Style guidance: Everyone speaks in brooding metaphors.');
    expect(actionPrompt.instructions).toContain('preserving its core intent.');
    expect(actionPrompt.instructions).toContain('Keep continuity with the surrounding story context and preserve the same block type.');
    expect(actionPrompt.instructions).toContain('Output ONLY the new text.');
  });

  it('injects style into generateSurpriseSetup prompt', () => {
    const prompt = buildSurpriseSetupPrompt({
      targetGenre: 'Noir',
      genres: ['Noir', 'Comedy'],
      style: {
        styleId: 'all-dialogue-rhymes',
        styleName: 'All dialogue rhymes',
        styleGuidance: 'Every spoken line should rhyme while remaining natural enough for performance.',
        legacyStyle: ''
      }
    });
    expect(prompt.input).toContain('Style: All dialogue rhymes (all-dialogue-rhymes)');
    expect(prompt.input).toContain('Style guidance: Every spoken line should rhyme while remaining natural enough for performance.');
    expect(prompt.instructions).toContain('Make the premise concrete rather than generic or cliche.');
    expect(prompt.instructions).toContain('Make the three characters clearly distinct from one another in role and energy.');
    expect(prompt.instructions).toContain('array of exactly 3 plain strings');
    expect(prompt.instructions).toContain("Do not use objects, nested fields, numbering, or extra wrapper keys inside 'characters'.");
  });

  it('omits surprise setup style block when no style is provided', () => {
    const prompt = buildSurpriseSetupPrompt({
      targetGenre: 'Noir',
      genres: ['Noir', 'Comedy'],
      style: {
        styleId: '',
        styleName: '',
        styleGuidance: '',
        legacyStyle: ''
      }
    });
    expect(prompt.input).not.toContain('Style:');
    expect(prompt.input).not.toContain('Style guidance:');
  });

  it('forces Thriller when targetGenre is Thriller', () => {
    const prompt = buildSurpriseSetupPrompt({
      targetGenre: 'Thriller',
      genres: ['Noir', 'Comedy', 'Thriller'],
      style: {
        styleId: '',
        styleName: '',
        styleGuidance: '',
        legacyStyle: ''
      }
    });
    expect(prompt.instructions).toContain('The genre MUST be "Thriller".');
  });
});
