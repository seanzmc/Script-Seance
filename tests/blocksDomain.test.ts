import { describe, expect, it } from 'vitest';
import { createBlock, sanitizeGeneratedText, updateBlock } from '../domain/blocks';
import { BlockType } from '../types';

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
});
