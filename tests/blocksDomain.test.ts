import { describe, expect, it } from 'vitest';
import { createBlock, normalizeSceneBlocks, sanitizeGeneratedText, updateBlock } from '../domain/blocks';
import { BlockType, ScriptBlock } from '../types';

describe('domain/blocks', () => {
  it('createBlock requires character for dialogue', () => {
    expect(() => createBlock({
      type: BlockType.DIALOGUE,
      text: 'Keep your voice down.'
    })).toThrow('Dialogue blocks require a character.');
  });

  it('updateBlock bumps blockRevision when semantic fields change', () => {
    const block = createBlock({
      type: BlockType.DIALOGUE,
      text: 'Where are we?',
      character: 'Alex'
    });

    const updated = updateBlock(block, { text: 'Where are we now?' });

    expect(updated.blockRevision).toBe(block.blockRevision + 1);
    expect(updated.text).toBe('Where are we now?');
  });

  it('sanitizeGeneratedText strips an Action: prefix', () => {
    const sanitized = sanitizeGeneratedText(
      BlockType.ACTION,
      ' Action: A glass tumbles off the table.'
    );

    expect(sanitized).toBe('A glass tumbles off the table.');
    expect(sanitized.startsWith('Action:')).toBe(false);
  });

  it('createBlock accepts sanitized metadata payloads', () => {
    const block = createBlock({
      type: BlockType.ACTION,
      text: 'Action: The lamp sputters.',
      meta: {
        origin: 'user',
        createdAt: ' 2026-03-04T15:12:00.000Z ',
        opId: ' insert-1 '
      }
    });

    expect(block.meta).toEqual({
      origin: 'user',
      createdAt: '2026-03-04T15:12:00.000Z',
      opId: 'insert-1'
    });
  });

  it('normalizeSceneBlocks drops heading blocks and enforces type field rules', () => {
    const legacyBlocks = [
      {
        id: 'legacy-heading',
        type: BlockType.HEADING,
        text: 'INT. LAB - DAY',
        blockRevision: 1
      },
      {
        id: 'legacy-action',
        type: BlockType.ACTION,
        text: ' Action: A warning light flashes. ',
        blockRevision: 0,
        character: 'Alex',
        parenthetical: '(whispering)',
        meta: {
          origin: 'invalid-origin',
          createdAt: ' 2026-03-04T10:00:00.000Z ',
          opId: ' '
        }
      },
      {
        id: 'legacy-dialogue',
        type: BlockType.DIALOGUE,
        text: ' Dialogue: Move now. ',
        blockRevision: -3,
        character: '   ',
        parenthetical: ' (urgent) '
      }
    ] as unknown as ScriptBlock[];

    const normalized = normalizeSceneBlocks(legacyBlocks, {
      fallbackDialogueCharacter: 'Sam'
    });

    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toEqual({
      id: 'legacy-action',
      type: BlockType.ACTION,
      text: 'A warning light flashes.',
      blockRevision: 1,
      meta: {
        createdAt: '2026-03-04T10:00:00.000Z'
      }
    });
    expect(normalized[1]).toEqual({
      id: 'legacy-dialogue',
      type: BlockType.DIALOGUE,
      text: 'Move now.',
      blockRevision: 1,
      character: 'Sam',
      parenthetical: '(urgent)'
    });
  });
});
