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
const previousOpenAiModel = process.env.OPENAI_MODEL;
const previousOpenAiFastModel = process.env.OPENAI_FAST_MODEL;
const previousOpenAiBalancedModel = process.env.OPENAI_BALANCED_MODEL;

const restoreEnv = (key: string, value: string | undefined) => {
  if (typeof value === 'undefined') {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
};

beforeAll(async () => {
  process.env.OPENAI_MODEL = 'test-openai-primary';
  process.env.OPENAI_FAST_MODEL = 'test-openai-fast';
  process.env.OPENAI_BALANCED_MODEL = 'test-openai-balanced';
  process.env.TEXT_LLM_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-password';

  vi.resetModules();
  const serverModule = await import('../server/index.js');
  handleAiGenerate = serverModule.handleAiGenerate;
});

afterAll(() => {
  process.env.TEXT_LLM_PROVIDER = previousProvider;
  process.env.OPENAI_API_KEY = previousOpenAiKey;
  restoreEnv('OPENAI_MODEL', previousOpenAiModel);
  restoreEnv('OPENAI_FAST_MODEL', previousOpenAiFastModel);
  restoreEnv('OPENAI_BALANCED_MODEL', previousOpenAiBalancedModel);
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
      .mockResolvedValueOnce(asResponse('Shadow Ledger'))
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
            scenes: [],
            targetLength: 'Long'
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

    const titleReq = {
      body: {
        kind: 'generateScriptElement',
        context: {
          type: 'action',
          purpose: 'titleSuggestion',
          instruction: 'Create a concise, evocative screenplay title (2-6 words).',
          styleContext: 'Genre: Noir. Premise: A vanished witness sends clues from impossible places.',
          character: null
        }
      }
    } as any;
    const titleRes = createMockRes();
    await handleAiGenerate(titleReq, titleRes as any);
    expect(titleRes.statusCode).toBe(200);
    expect(String((titleRes.body?.data as Record<string, unknown>)?.text || '').trim().length).toBeGreaterThan(0);

    const elementReq = {
      body: {
        kind: 'generateScriptElement',
        context: {
          type: 'action',
          purpose: 'insertBlock',
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

    expect(mockResponsesCreate).toHaveBeenCalledTimes(6);
    const expectedModels = [
      'test-openai-primary',
      'test-openai-balanced',
      'test-openai-fast',
      'test-openai-balanced',
      'test-openai-balanced',
      'test-openai-balanced'
    ];
    for (const [index, call] of mockResponsesCreate.mock.calls.entries()) {
      const request = call[0] as { model?: string; instructions?: unknown; input?: unknown };
      expect(request.model).toBe(expectedModels[index]);
      expect(typeof request.instructions).toBe('string');
      expect(String(request.instructions || '').trim().length).toBeGreaterThan(0);
      expect(typeof request.input).toBe('string');
      expect(String(request.input || '').trim().length).toBeGreaterThan(0);
      expect(Array.isArray(request.input)).toBe(false);
      const options = call[1] as { signal?: AbortSignal } | undefined;
      expect(options?.signal).toBeInstanceOf(AbortSignal);
    }

    const sceneRequest = mockResponsesCreate.mock.calls[0]?.[0] as {
      instructions?: string;
      text?: {
        format?: {
          schema?: {
            properties?: {
              blocks?: {
                items?: {
                  anyOf?: Array<{
                    properties?: {
                      type?: { enum?: string[] };
                      character?: { type?: string | string[]; minLength?: number };
                      parenthetical?: { type?: string | string[] };
                    };
                    required?: string[];
                  }>;
                };
              };
            };
          };
        };
      };
    };
    const sceneBlockVariants = sceneRequest.text?.format?.schema?.properties?.blocks?.items?.anyOf || [];
    const dialogueBlockSchema = sceneBlockVariants.find((variant) => (
      variant.properties?.type?.enum?.includes('dialogue')
    ));
    expect(dialogueBlockSchema?.properties?.character).toMatchObject({
      type: 'string',
      minLength: 1
    });
    expect(dialogueBlockSchema?.properties?.parenthetical).toMatchObject({
      type: ['string', 'null']
    });
    expect(dialogueBlockSchema?.required).toEqual(['type', 'character', 'text']);
    expect(sceneRequest.instructions || '').not.toContain('The JSON schema is:');
    expect(sceneRequest.instructions || '').not.toContain('Do NOT emit a heading block inside "blocks".');

    expect((mockResponsesCreate.mock.calls[2]?.[0] as { model?: unknown })?.model).toBe('test-openai-fast');
    expect((mockResponsesCreate.mock.calls[3]?.[0] as { model?: unknown })?.model).toBe('test-openai-balanced');
    expect(String((mockResponsesCreate.mock.calls[2]?.[0] as { instructions?: unknown })?.instructions || '')).toContain(
      'Output ONLY the raw script text requested.'
    );
    expect(String((mockResponsesCreate.mock.calls[3]?.[0] as { instructions?: unknown })?.instructions || '')).toContain(
      'Output ONLY the raw script text requested.'
    );
  });
});
