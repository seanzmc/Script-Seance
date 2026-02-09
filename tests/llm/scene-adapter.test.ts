import { describe, expect, it } from 'vitest';
import { buildContinueGenerationInput, extractSceneHeading, parseGeneratedSceneText } from '../../services/llmSceneAdapter';
import { BlockType } from '../../types';

describe('llmSceneAdapter', () => {
  it('builds continue input from story context', () => {
    const input = buildContinueGenerationInput(
      {
        title: 'Test',
        genre: 'Noir',
        premise: 'A detective chases a ghost signal.',
        characters: ['ALEX', 'JENKINS'],
        scenes: [
          {
            id: 's1',
            heading: 'INT. CONTROL ROOM - NIGHT',
            summary: 'Alex finds a corrupted signal.',
            blocks: [
              {
                id: 'b1',
                type: BlockType.ACTION,
                text: 'ALEX watches the monitor.'
              },
              {
                id: 'b2',
                type: BlockType.DIALOGUE,
                character: 'ALEX',
                text: 'We are running out of time.'
              }
            ]
          }
        ]
      },
      'Continue the scene.',
      'tense'
    );

    expect(input.action.type).toBe('continue');
    expect(input.scriptState.style.tone).toBe('tense');
    expect(input.blocks.length).toBeGreaterThan(0);
    expect(input.blocks.some((block) => block.type === 'scene-heading')).toBe(true);
  });

  it('extracts scene heading from screenplay text', () => {
    const heading = extractSceneHeading('\nINT. LAB - NIGHT\nALEX enters.');
    expect(heading).toBe('INT. LAB - NIGHT');
  });

  it('parses screenplay into scene blocks', () => {
    const parsed = parseGeneratedSceneText(
      [
        'INT. LAB - NIGHT',
        '',
        'ALEX',
        '(whispering)',
        'Do you hear that?',
        '',
        'The lights flicker overhead.',
        '',
        'CUT TO:'
      ].join('\n'),
      { fallbackHeading: 'INT. FALLBACK - DAY', summaryHint: 'Fallback summary' }
    );

    expect(parsed.heading).toBe('INT. LAB - NIGHT');
    expect(parsed.blocks.some((block) => block.type === BlockType.DIALOGUE)).toBe(true);
    expect(parsed.blocks.some((block) => block.type === BlockType.ACTION)).toBe(true);
    expect(parsed.blocks.some((block) => block.type === BlockType.TRANSITION)).toBe(true);
    expect(parsed.summary.length).toBeGreaterThan(0);
  });

  it('falls back to action block when parser cannot segment', () => {
    const parsed = parseGeneratedSceneText('just raw text no screenplay markers', {
      fallbackHeading: 'INT. UNKNOWN - DAY',
      summaryHint: 'fallback'
    });

    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0].type).toBe(BlockType.ACTION);
  });
});
