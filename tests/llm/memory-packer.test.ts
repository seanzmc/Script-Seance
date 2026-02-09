import { describe, expect, it } from 'vitest';
import { packContext } from '../../server/llm/memory/packer.js';

const cfg = (overrides: Record<string, number> = {}) => ({
  provider: 'local',
  local: {
    baseUrl: '',
    model: '',
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 1024,
    contextWindow: 6144
  },
  gemini: {
    apiKey: '',
    model: '',
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 1024
  },
  generation: {
    maxInputTokens: 5120,
    maxOutputTokens: 1024,
    scriptStateBudget: 800,
    recentBlocksBudget: 3000,
    systemPromptBudget: 500,
    instructionBudget: 300,
    ...overrides
  },
  safety: {
    maxPromptChars: 25000,
    dedupeWindowMs: 5000,
    tokenSpikeThreshold: 1.5
  }
});

const manyBlocks = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    type: 'dialogue',
    content: `CHARACTER_${i}\nThis is dialogue number ${i} with enough words to consume a fair number of tokens.`
  }));

const baseInput = {
  scriptState: {
    title: 'T',
    characters: [],
    style: { genre: 'drama', tone: 'serious' },
    plotThreads: [],
    canonFacts: [],
    totalScenes: 1
  },
  instruction: 'Continue.',
  systemPrompt: 'You are a writer.'
};

describe('packContext', () => {
  it('drops blocks when budget is tight', () => {
    const result = packContext(
      { ...baseInput, allBlocks: manyBlocks(100) },
      cfg({ maxInputTokens: 500, recentBlocksBudget: 200 })
    );

    expect(result.metadata.blocksDropped).toBeGreaterThan(0);
    expect(result.metadata.blocksIncluded).toBeLessThan(100);
  });

  it('keeps recent blocks when trimming', () => {
    const blocks = [
      { id: 'old', type: 'dialogue', content: 'OLD\nOld line.' },
      { id: 'new', type: 'dialogue', content: 'NEW\nNew line.' }
    ];

    const result = packContext(
      { ...baseInput, allBlocks: blocks },
      cfg({ maxInputTokens: 800, recentBlocksBudget: 300 })
    );

    const userMessage = result.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('NEW');
  });

  it('includes callback notes when budget allows', () => {
    const result = packContext(
      {
        ...baseInput,
        allBlocks: [],
        callbackNotes: ['The door was locked']
      },
      cfg({ maxInputTokens: 5000 })
    );

    const userMessage = result.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('CALLBACK NOTES');
    expect(userMessage?.content).toContain('door was locked');
  });

  it('returns zero blocks for empty input', () => {
    const result = packContext(
      { ...baseInput, allBlocks: [] },
      cfg()
    );

    expect(result.metadata.blocksIncluded).toBe(0);
    expect(result.metadata.blocksDropped).toBe(0);
  });
});
