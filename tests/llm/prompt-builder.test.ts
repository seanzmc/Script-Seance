import { describe, expect, it } from 'vitest';
import { buildPrompt } from '../../server/llm/prompts/builder.js';

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

const state = () => ({
  title: 'Test Script',
  characters: [
    { name: 'ALICE', goals: 'Find the truth', traits: ['brave'] },
    { name: 'BOB', goals: 'Protect a secret' }
  ],
  style: { genre: 'thriller', tone: 'tense' },
  plotThreads: [{ id: '1', description: 'Alice investigates', status: 'active' }],
  canonFacts: [{ fact: 'Set in 1990s Chicago' }],
  totalScenes: 3
});

const blocks = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `b-${i}`,
    type: 'dialogue',
    content: `ALICE\nDialogue line ${i}.`
  }));

describe('buildPrompt', () => {
  it('is deterministic for identical inputs', () => {
    const config = cfg();
    const scriptState = state();
    const scriptBlocks = blocks(5);

    const first = buildPrompt(
      {
        action: { type: 'continue' },
        scriptState,
        blocks: scriptBlocks
      },
      config
    );

    const second = buildPrompt(
      {
        action: { type: 'continue' },
        scriptState,
        blocks: scriptBlocks
      },
      config
    );

    expect(first.messages).toEqual(second.messages);
    expect(first.metadata).toEqual(second.metadata);
  });

  it('puts system prompt first', () => {
    const result = buildPrompt(
      {
        action: { type: 'continue' },
        scriptState: state(),
        blocks: []
      },
      cfg()
    );

    expect(result.messages[0].role).toBe('system');
    expect(result.messages[0].content).toContain('screenplay');
  });

  it('includes character names in user content', () => {
    const result = buildPrompt(
      {
        action: { type: 'continue' },
        scriptState: state(),
        blocks: []
      },
      cfg()
    );

    const userMessage = result.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('ALICE');
    expect(userMessage?.content).toContain('BOB');
  });

  it('uses new-script template', () => {
    const result = buildPrompt(
      {
        action: { type: 'new-script', instruction: 'A noir detective story' },
        scriptState: state(),
        blocks: []
      },
      cfg()
    );

    const userMessage = result.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('opening');
    expect(userMessage?.content).toContain('noir detective');
  });

  it('uses surprise-me template', () => {
    const result = buildPrompt(
      {
        action: { type: 'surprise-me', styleHint: 'dark twist' },
        scriptState: state(),
        blocks: []
      },
      cfg()
    );

    const userMessage = result.messages.find((message) => message.role === 'user');
    expect(userMessage?.content).toContain('unexpected');
    expect(userMessage?.content).toContain('dark twist');
  });
});
