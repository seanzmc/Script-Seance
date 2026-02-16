import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';

const mockResponsesCreate = vi.fn();

vi.mock('openai', () => ({
  default: class {
    responses = {
      create: (...args: unknown[]) => mockResponsesCreate(...args)
    };
  }
}));

let handleAiGenerate: typeof import('../server/index.js').handleAiGenerate;
const previousProvider = process.env.TEXT_LLM_PROVIDER;
const previousOpenAiKey = process.env.OPENAI_API_KEY;

beforeAll(async () => {
  process.env.TEXT_LLM_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-password';

  const serverModule = await import('../server/index.js');
  handleAiGenerate = serverModule.handleAiGenerate;
});

afterAll(() => {
  process.env.TEXT_LLM_PROVIDER = previousProvider;
  process.env.OPENAI_API_KEY = previousOpenAiKey;
});

beforeEach(() => {
  mockResponsesCreate.mockReset();
});

type MockRes = {
  statusCode: number;
  body: Record<string, unknown> | null;
  headers: Record<string, string>;
  status: (code: number) => MockRes;
  json: (payload: Record<string, unknown>) => MockRes;
  set: (name: string, value: string) => MockRes;
};

const createMockRes = (): MockRes => ({
  statusCode: 200,
  body: null,
  headers: {},
  status(code: number) {
    this.statusCode = code;
    return this;
  },
  json(payload: Record<string, unknown>) {
    this.body = payload;
    return this;
  },
  set(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
    return this;
  }
});

const asResponse = (outputText: string) => ({ output_text: outputText });

describe('OpenAI text generation smoke', () => {
  it('returns non-empty output for all text-generation modes', async () => {
    mockResponsesCreate
      .mockResolvedValueOnce(asResponse(JSON.stringify({
        heading: 'INT. ABANDONED THEATER - NIGHT',
        summary: 'A stage illusion reveals a dangerous truth.',
        blocks: [
          { type: 'action', text: 'Dust rolls off velvet curtains as the trapdoor creaks open.' },
          { type: 'dialogue', character: 'Mara', text: 'We are not alone down here.' }
        ]
      })))
      .mockResolvedValueOnce(asResponse('The hero realizes the villain is their future self.'))
      .mockResolvedValueOnce(asResponse('A flickering neon sign hums over the rain-soaked alley.'))
      .mockResolvedValueOnce(asResponse('I have buried this secret long enough.'))
      .mockResolvedValueOnce(asResponse(JSON.stringify({
        genre: 'Noir',
        premise: 'A retired illusionist is blackmailed into one final con against a mayoral candidate.',
        characters: ['Mara (The Illusionist)', 'Denton (The Fixer)', 'Lena (The Investigative Reporter)']
      })));

    const sceneReq = {
      body: {
        kind: 'generateScene',
        context: {
          storyContext: {
            title: 'Untitled',
            genre: 'Noir',
            premise: 'A vanished witness sends clues from impossible places.',
            characters: ['Mara', 'Denton'],
            scenes: []
          },
          userInstruction: 'Open on a tense reveal.',
          isFirstScene: true
        }
      }
    } as any;

    const sceneRes = createMockRes();
    await handleAiGenerate(sceneReq, sceneRes as any);
    expect(sceneRes.statusCode).toBe(200);
    expect((sceneRes.body?.data as Record<string, unknown>)?.heading).toBeTruthy();

    const twistReq = {
      body: {
        kind: 'suggestPlotTwist',
        context: { genre: 'Noir' }
      }
    } as any;
    const twistRes = createMockRes();
    await handleAiGenerate(twistReq, twistRes as any);
    expect(twistRes.statusCode).toBe(200);
    expect(String((twistRes.body?.data as Record<string, unknown>)?.text || '').trim().length).toBeGreaterThan(0);

    const elementReq = {
      body: {
        kind: 'generateScriptElement',
        context: {
          type: 'action',
          instruction: 'Set mood quickly.',
          styleContext: 'Genre: Noir. Style: Cinematic.',
          character: null
        }
      }
    } as any;
    const elementRes = createMockRes();
    await handleAiGenerate(elementReq, elementRes as any);
    expect(elementRes.statusCode).toBe(200);
    expect(String((elementRes.body?.data as Record<string, unknown>)?.text || '').trim().length).toBeGreaterThan(0);

    const rewriteReq = {
      body: {
        kind: 'regenerateScriptBlock',
        context: {
          block: { type: 'dialogue', text: 'I know.', character: 'Mara' },
          genre: 'Noir',
          premise: 'A vanished witness sends clues from impossible places.',
          rewriteGuidance: 'Make it sharper and more ominous.'
        }
      }
    } as any;
    const rewriteRes = createMockRes();
    await handleAiGenerate(rewriteReq, rewriteRes as any);
    expect(rewriteRes.statusCode).toBe(200);
    expect(String((rewriteRes.body?.data as Record<string, unknown>)?.text || '').trim().length).toBeGreaterThan(0);

    const surpriseReq = {
      body: {
        kind: 'generateSurpriseSetup',
        context: {
          targetGenre: 'Noir'
        }
      }
    } as any;
    const surpriseRes = createMockRes();
    await handleAiGenerate(surpriseReq, surpriseRes as any);
    expect(surpriseRes.statusCode).toBe(200);
    const surpriseData = surpriseRes.body?.data as Record<string, unknown>;
    expect(String(surpriseData?.genre || '').trim().length).toBeGreaterThan(0);
    expect(String(surpriseData?.premise || '').trim().length).toBeGreaterThan(0);
    expect(Array.isArray(surpriseData?.characters)).toBe(true);
  });
});
