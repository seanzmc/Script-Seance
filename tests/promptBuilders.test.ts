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
    const { prompt } = buildGenerateScenePrompt({
      genre: 'Noir',
      premise: 'A detective unravels a conspiracy.',
      characters: ['Alex'],
      scenes: [],
      userInstruction: 'Open with a tense beat.',
      isFirstScene: true,
      style: 'Dead serious documentary tone',
      targetLength: 'Medium'
    });
    expect(prompt).toContain('Style Theme: Dead serious documentary tone');
  });

  it('injects style into suggestPlotTwist prompt', () => {
    const prompt = buildPlotTwistPrompt('Noir', 'Unhinged');
    expect(prompt).toContain('Style Theme: Unhinged');
  });

  it('injects style into generateScriptElement prompt', () => {
    const prompt = buildScriptElementPrompt({
      type: 'action',
      character: undefined,
      instruction: 'Set mood quickly.',
      styleContext: 'Genre: Noir. Style: Cinematic.'
    });
    expect(prompt).toContain('Style Theme: Genre: Noir. Style: Cinematic.');
  });

  it('injects style into regenerateScriptBlock prompt for dialogue and non-dialogue', () => {
    const dialoguePrompt = buildRegenerateBlockPrompt({
      type: 'dialogue',
      character: 'Alex',
      genre: 'Noir',
      premise: 'A detective unravels a conspiracy.',
      text: 'I know.',
      style: 'Transatlantic dialogue',
      rewriteGuidance: 'Sharpen it.'
    });
    expect(dialoguePrompt).toContain('Style Theme: Transatlantic dialogue');

    const actionPrompt = buildRegenerateBlockPrompt({
      type: 'action',
      character: undefined,
      genre: 'Noir',
      premise: 'A detective unravels a conspiracy.',
      text: 'He stares at the board.',
      style: 'Dead serious documentary tone',
      rewriteGuidance: 'Make it vivid.'
    });
    expect(actionPrompt).toContain('Style Theme: Dead serious documentary tone');
  });

  it('injects style into generateSurpriseSetup prompt', () => {
    const prompt = buildSurpriseSetupPrompt({
      targetGenre: 'Noir',
      genres: ['Noir', 'Comedy'],
      style: 'All dialogue rhymes'
    });
    expect(prompt).toContain('Style Theme: All dialogue rhymes');
  });
});
