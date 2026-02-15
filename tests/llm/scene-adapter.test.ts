import { describe, expect, it } from 'vitest';
import {
  buildContinueGenerationInput,
  buildInsertInput,
  buildNewScriptInput,
  buildRegenerateInput,
  buildSurpriseInput,
  buildSurpriseSetupInput,
  extractSceneHeading,
  parseGeneratedSceneText
} from '../../services/llmSceneAdapter';
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

  it('builds start and surprise actions', () => {
    const context = {
      title: 'Test',
      genre: 'Noir',
      premise: 'A detective chases a ghost signal.',
      characters: ['ALEX', 'JENKINS'],
      scenes: []
    };

    const start = buildNewScriptInput(context, 'Write an opening');
    const surprise = buildSurpriseInput(context, 'tense');

    expect(start.action.type).toBe('start');
    expect(surprise.action.type).toBe('surprise');
  });

  it('builds regenerate input with target block content', () => {
    const context = {
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
            }
          ]
        }
      ]
    };

    const input = buildRegenerateInput(
      context,
      's1',
      'b1',
      { id: 'b1', type: BlockType.ACTION, text: 'ALEX watches the monitor.' },
      'Make it more urgent'
    );

    expect(input.action.type).toBe('regenerate');
    if (input.action.type === 'regenerate') {
      expect(input.action.blockToReplace).toContain('ALEX watches');
      expect(input.action.blockId).toBe('b1');
    }
  });

  it('builds insert and surprise-setup input payloads', () => {
    const context = {
      title: 'Test',
      genre: 'Noir',
      premise: 'A detective chases a ghost signal.',
      characters: ['ALEX', 'JENKINS'],
      scenes: []
    };

    const insert = buildInsertInput(context, 's1', 'after-1', BlockType.ACTION, 'Add a beat', 'cinematic');
    const setup = buildSurpriseSetupInput('Horror');

    expect(insert.action.type).toBe('insert');
    if (insert.action.type === 'insert') {
      expect(insert.action.insertAfterBlockId).toBe('after-1');
      expect(insert.action.blockType).toBe('action');
    }

    expect(setup.action.type).toBe('surprise-setup');
    if (setup.action.type === 'surprise-setup') {
      expect(setup.action.genreHint).toBe('Horror');
    }
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

  it('splits action from dialogue when model omits blank line', () => {
    const parsed = parseGeneratedSceneText(
      [
        'INT. CONTROL ROOM - NIGHT',
        'ALEX',
        'We are losing containment.',
        'The console erupts with sparks.'
      ].join('\n'),
      {
        fallbackHeading: 'INT. FALLBACK - DAY',
        characters: ['ALEX', 'JENKINS']
      }
    );

    expect(parsed.blocks.length).toBeGreaterThanOrEqual(2);
    expect(parsed.blocks[0].type).toBe(BlockType.DIALOGUE);
    expect(parsed.blocks.some((block) => block.type === BlockType.ACTION)).toBe(true);
  });

  it('treats known character-name narrative lines as action after dialogue', () => {
    const parsed = parseGeneratedSceneText(
      [
        'INT. CONTROL ROOM - NIGHT',
        'ALEX',
        'I cannot hold it any longer.',
        'JENKINS slams the emergency breaker.'
      ].join('\n'),
      {
        fallbackHeading: 'INT. FALLBACK - DAY',
        characters: ['ALEX', 'JENKINS']
      }
    );

    expect(parsed.blocks.length).toBeGreaterThanOrEqual(2);
    expect(parsed.blocks[0].type).toBe(BlockType.DIALOGUE);
    expect(parsed.blocks[1].type).toBe(BlockType.ACTION);
  });
});
