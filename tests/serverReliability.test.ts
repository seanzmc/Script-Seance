import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { CANONICAL_GENRES } from '../server/llm/genreCatalog.js';

let app: typeof import('../server/index.js').app;
let handleAiGenerate: typeof import('../server/index.js').handleAiGenerate;
let resetAuthRuntimeForTests: typeof import('../server/index.js').resetAuthRuntimeForTests;

const mockResponsesCreate = vi.fn();

vi.mock('openai', () => ({
  default: class {
    responses = {
      create: (...args: unknown[]) => mockResponsesCreate(...args)
    };
  }
}));

beforeAll(async () => {
  process.env.AUTH_MODE = 'dev_shared_password';
  process.env.ADMIN_PASSWORD = 'test-password';
  process.env.SCRIPT_SEANCE_OPENAI_API_KEY = 'test-openai-key';
  process.env.OPENAI_MODEL = 'gpt-5.4-test-primary';
  process.env.OPENAI_FAST_MODEL = 'gpt-5.4-nano-test-fast';
  process.env.OPENAI_BALANCED_MODEL = 'gpt-5.4-mini-test-balanced';
  process.env.INWORLD_API_KEY = '';
  process.env.INWORLD_API_SECRET = '';
  process.env.INWORLD_WORKSPACE_ID = '';

  const serverModule = await import('../server/index.js');
  app = serverModule.app;
  handleAiGenerate = serverModule.handleAiGenerate;
  resetAuthRuntimeForTests = serverModule.resetAuthRuntimeForTests;
});

beforeEach(() => {
  mockResponsesCreate.mockReset();
  resetAuthRuntimeForTests();
});

describe('server reliability', () => {
  it('sends prompt debug metadata only when both server and client debug flags are enabled', async () => {
    const previousDebugEnv = process.env.SS_DEBUG_PROMPTS;
    try {
      delete process.env.SS_DEBUG_PROMPTS;
      mockResponsesCreate.mockResolvedValueOnce({ output_text: 'A twist appears.' });

      const reqWithoutEnv = {
        body: {
          kind: 'suggestPlotTwist',
          context: { genre: 'Noir' },
          promptTrace: {
            enabled: true,
            promptContextRevision: 7,
            styleFingerprint: 'abc123ff'
          }
        }
      } as any;
      const resWithoutEnv = {
        statusCode: 200,
        body: null as any,
        headers: {} as Record<string, string>,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          this.body = payload;
          return this;
        },
        set(name: string, value: string) {
          this.headers[name.toLowerCase()] = value;
          return this;
        }
      } as any;

      await handleAiGenerate(reqWithoutEnv, resWithoutEnv);
      expect(resWithoutEnv.statusCode).toBe(200);
      expect(resWithoutEnv.body?.debug).toBeUndefined();

      process.env.SS_DEBUG_PROMPTS = '1';
      mockResponsesCreate.mockResolvedValueOnce({ output_text: 'Another twist appears.' });

      const reqWithoutClientFlag = {
        body: {
          kind: 'suggestPlotTwist',
          context: { genre: 'Noir' }
        }
      } as any;
      const resWithoutClientFlag = {
        statusCode: 200,
        body: null as any,
        headers: {} as Record<string, string>,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          this.body = payload;
          return this;
        },
        set(name: string, value: string) {
          this.headers[name.toLowerCase()] = value;
          return this;
        }
      } as any;

      await handleAiGenerate(reqWithoutClientFlag, resWithoutClientFlag);
      expect(resWithoutClientFlag.statusCode).toBe(200);
      expect(resWithoutClientFlag.body?.debug).toBeUndefined();

      mockResponsesCreate.mockResolvedValueOnce({ output_text: 'Final twist appears.' });

      const reqWithBothFlags = {
        body: {
          kind: 'suggestPlotTwist',
          context: { genre: 'Noir' },
          promptTrace: {
            enabled: true,
            promptContextRevision: 17,
            styleFingerprint: 'abc123ff'
          }
        }
      } as any;
      const resWithBothFlags = {
        statusCode: 200,
        body: null as any,
        headers: {} as Record<string, string>,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          this.body = payload;
          return this;
        },
        set(name: string, value: string) {
          this.headers[name.toLowerCase()] = value;
          return this;
        }
      } as any;

      await handleAiGenerate(reqWithBothFlags, resWithBothFlags);
      expect(resWithBothFlags.statusCode).toBe(200);
      expect(resWithBothFlags.body?.debug).toMatchObject({
        kind: 'suggestPlotTwist',
        provider: 'openai',
        promptContextRevision: 17,
        styleFingerprint: 'abc123ff'
      });
      expect(typeof resWithBothFlags.body?.debug?.model).toBe('string');
      expect(resWithBothFlags.body?.debug?.previews?.prompt).toEqual(expect.any(String));
    } finally {
      if (previousDebugEnv === undefined) {
        delete process.env.SS_DEBUG_PROMPTS;
      } else {
        process.env.SS_DEBUG_PROMPTS = previousDebugEnv;
      }
    }
  });

  it('maps upstream timeout errors to 504 UPSTREAM_TIMEOUT', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const timeoutError = new Error('Upstream request timed out.');
      (timeoutError as Error & { code?: string }).code = 'UPSTREAM_TIMEOUT';
      mockResponsesCreate.mockRejectedValue(timeoutError);

      const req = {
        body: {
          kind: 'suggestPlotTwist',
          context: { genre: 'Noir' }
        }
      } as any;
      const res = {
        statusCode: 200,
        body: null as any,
        headers: {} as Record<string, string>,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          this.body = payload;
          return this;
        },
        set(name: string, value: string) {
          this.headers[name.toLowerCase()] = value;
          return this;
        }
      } as any;

      await handleAiGenerate(req, res);
      expect(res.statusCode).toBe(504);
      expect(res.body?.error?.code).toBe('UPSTREAM_TIMEOUT');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('accepts generateSurpriseSetup styleId and exposes canonical style metadata in debug preview', async () => {
    const previousDebugEnv = process.env.SS_DEBUG_PROMPTS;
    try {
      process.env.SS_DEBUG_PROMPTS = '1';
      mockResponsesCreate.mockResolvedValueOnce({
        output_text: JSON.stringify({
          genre: 'Noir',
          premise: 'A detective takes one impossible final case.',
          characters: ['Mara (Detective)', 'Vale (Fixer)', 'Iris (Witness)']
        })
      });

      const req = {
        body: {
          kind: 'generateSurpriseSetup',
          context: {
            targetGenre: 'Noir',
            styleId: 'noir-1940s-detective',
            styleName: 'Client supplied label',
            style: 'Hardboiled with clipped dialogue'
          },
          promptTrace: {
            enabled: true,
            promptContextRevision: 23,
            styleFingerprint: 'abc123ff'
          }
        }
      } as any;
      const res = {
        statusCode: 200,
        body: null as any,
        headers: {} as Record<string, string>,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          this.body = payload;
          return this;
        },
        set(name: string, value: string) {
          this.headers[name.toLowerCase()] = value;
          return this;
        }
      } as any;

      await handleAiGenerate(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body?.debug?.previews?.context).toMatchObject({
        targetGenre: 'Noir',
        styleId: 'noir-1940s-detective',
        styleName: '1940s Noir Detective'
      });
      expect(res.body?.debug?.previews?.context).not.toHaveProperty('style');
      expect(Array.isArray(res.body?.debug?.previews?.context?.allowedGenres)).toBe(true);
      expect(res.body?.debug?.previews?.context?.allowedGenres).toEqual(CANONICAL_GENRES);
      expect(res.body?.debug?.previews?.context?.allowedGenres).toContain('Thriller');
      const prompt = String(mockResponsesCreate.mock.calls[0]?.[0]?.input || '');
      expect(prompt).toContain('Style: 1940s Noir Detective (noir-1940s-detective)');
      expect(prompt).toContain('Style guidance: Everyone speaks in brooding metaphors');
    } finally {
      if (previousDebugEnv === undefined) {
        delete process.env.SS_DEBUG_PROMPTS;
      } else {
        process.env.SS_DEBUG_PROMPTS = previousDebugEnv;
      }
    }
  });

  it('resolves canonical style guidance for twist, script element, and rewrite prompts', async () => {
    const previousDebugEnv = process.env.SS_DEBUG_PROMPTS;
    const createRes = () => ({
      statusCode: 200,
      body: null as any,
      headers: {} as Record<string, string>,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
      set(name: string, value: string) {
        this.headers[name.toLowerCase()] = value;
        return this;
      }
    });
    try {
      process.env.SS_DEBUG_PROMPTS = '1';
      mockResponsesCreate
        .mockResolvedValueOnce({ output_text: 'A witness is the detective.' })
        .mockResolvedValueOnce({ output_text: 'Rain needles the alley.' })
        .mockResolvedValueOnce({ output_text: 'The board stares back.' });

      const twistReq = {
        body: {
          kind: 'suggestPlotTwist',
          context: {
            genre: 'Noir',
            premise: 'A vanished witness sends clues from impossible places.',
            characters: ['Mara', 'Vale', 'Iris'],
            recentSceneHeading: 'INT. UNION STATION - NIGHT',
            recentSceneSummary: 'Mara realizes the courier is guiding her into a trap.',
            userInstruction: 'Push the next scene into a worse trap.',
            styleId: 'noir-1940s-detective',
            styleName: 'Client supplied label',
            style: 'Hardboiled fallback'
          },
          promptTrace: {
            enabled: true,
            promptContextRevision: 52,
            styleFingerprint: 'abc123ff'
          }
        }
      } as any;
      const twistRes = createRes() as any;
      await handleAiGenerate(twistReq, twistRes);

      expect(twistRes.statusCode).toBe(200);
      expect(twistRes.body?.debug?.previews?.context).toMatchObject({
        genre: 'Noir',
        premise: 'A vanished witness sends clues from impossible places.',
        characters: ['Mara', 'Vale', 'Iris'],
        recentSceneHeading: 'INT. UNION STATION - NIGHT',
        recentSceneSummary: 'Mara realizes the courier is guiding her into a trap.',
        userInstruction: 'Push the next scene into a worse trap.',
        styleId: 'noir-1940s-detective',
        styleName: '1940s Noir Detective'
      });
      expect(String(twistRes.body?.debug?.previews?.context?.styleContext || '')).toContain('Everyone speaks in brooding metaphors');
      expect(String(mockResponsesCreate.mock.calls[0]?.[0]?.input || '')).toContain('Premise: A vanished witness sends clues from impossible places.');
      expect(String(mockResponsesCreate.mock.calls[0]?.[0]?.input || '')).toContain('Named characters: Mara, Vale, Iris.');
      expect(String(mockResponsesCreate.mock.calls[0]?.[0]?.input || '')).toContain('Recent story context:\nHeading: INT. UNION STATION - NIGHT\nSummary: Mara realizes the courier is guiding her into a trap.');
      expect(String(mockResponsesCreate.mock.calls[0]?.[0]?.input || '')).toContain('Current user instruction: Push the next scene into a worse trap.');
      expect(String(mockResponsesCreate.mock.calls[0]?.[0]?.input || '')).toContain('Style guidance: Everyone speaks in brooding metaphors');
      expect(String(mockResponsesCreate.mock.calls[0]?.[0]?.instructions || '')).toContain('It must stay compatible with the premise, named characters, and recent story facts.');

      const elementReq = {
        body: {
          kind: 'generateScriptElement',
          context: {
            type: 'action',
            instruction: 'Set mood quickly.',
            styleContext: 'Genre: Noir.\nPremise: A detective unravels a conspiracy.',
            purpose: 'insertBlock',
            styleId: 'noir-1940s-detective',
            styleName: 'Client supplied label',
            style: 'Hardboiled fallback',
            character: null
          },
          promptTrace: {
            enabled: true,
            promptContextRevision: 53,
            styleFingerprint: 'abc123ff'
          }
        }
      } as any;
      const elementRes = createRes() as any;
      await handleAiGenerate(elementReq, elementRes);

      expect(elementRes.statusCode).toBe(200);
      expect(elementRes.body?.debug?.previews?.context).toMatchObject({
        purpose: 'insertBlock',
        type: 'action',
        styleId: 'noir-1940s-detective',
        styleName: '1940s Noir Detective'
      });
      expect(String(elementRes.body?.debug?.previews?.context?.styleContext || '')).toContain('Genre: Noir.');
      expect(String(elementRes.body?.debug?.previews?.context?.styleContext || '')).toContain('Everyone speaks in brooding metaphors');
      expect(String(mockResponsesCreate.mock.calls[1]?.[0]?.input || '')).toContain('Style guidance: Everyone speaks in brooding metaphors');

      const rewriteReq = {
        body: {
          kind: 'regenerateScriptBlock',
          context: {
            block: { type: 'dialogue', text: 'I know.', character: 'Mara' },
            genre: 'Noir',
            premise: 'A vanished witness sends clues from impossible places.',
            styleId: 'noir-1940s-detective',
            styleName: 'Client supplied label',
            style: 'Hardboiled fallback',
            rewriteGuidance: 'Make it sharper and more ominous.'
          },
          promptTrace: {
            enabled: true,
            promptContextRevision: 54,
            styleFingerprint: 'abc123ff'
          }
        }
      } as any;
      const rewriteRes = createRes() as any;
      await handleAiGenerate(rewriteReq, rewriteRes);

      expect(rewriteRes.statusCode).toBe(200);
      expect(rewriteRes.body?.debug?.previews?.context).toMatchObject({
        genre: 'Noir',
        styleId: 'noir-1940s-detective',
        styleName: '1940s Noir Detective'
      });
      expect(String(rewriteRes.body?.debug?.previews?.context?.styleContext || '')).toContain('Everyone speaks in brooding metaphors');
      expect(String(mockResponsesCreate.mock.calls[2]?.[0]?.input || '')).toContain('Style guidance: Everyone speaks in brooding metaphors');
    } finally {
      if (previousDebugEnv === undefined) {
        delete process.env.SS_DEBUG_PROMPTS;
      } else {
        process.env.SS_DEBUG_PROMPTS = previousDebugEnv;
      }
    }
  });

  it('rejects suggestPlotTwist when character context is invalid', async () => {
    const req = {
      body: {
        kind: 'suggestPlotTwist',
        context: {
          genre: 'Noir',
          characters: ['Mara', '']
        }
      }
    } as any;
    const res = {
      statusCode: 200,
      body: null as any,
      headers: {} as Record<string, string>,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
      set(name: string, value: string) {
        this.headers[name.toLowerCase()] = value;
        return this;
      }
    } as any;

    await handleAiGenerate(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_REQUEST');
    expect(String(res.body?.error?.message || '')).toContain('Invalid suggestPlotTwist characters.');
  });

  it('rejects generateScriptElement when purpose is unsupported', async () => {
    const req = {
      body: {
        kind: 'generateScriptElement',
        context: {
          type: 'action',
          instruction: 'Set mood quickly.',
          styleContext: 'Genre: Noir.',
          purpose: 'unknownPurpose',
          character: null
        }
      }
    } as any;
    const res = {
      statusCode: 200,
      body: null as any,
      headers: {} as Record<string, string>,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
      set(name: string, value: string) {
        this.headers[name.toLowerCase()] = value;
        return this;
      }
    } as any;

    await handleAiGenerate(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_REQUEST');
    expect(String(res.body?.error?.message || '')).toContain('Invalid script element purpose.');
  });

  it('keeps legacy style in surprise setup debug preview when styleId is absent', async () => {
    const previousDebugEnv = process.env.SS_DEBUG_PROMPTS;
    try {
      process.env.SS_DEBUG_PROMPTS = '1';
      mockResponsesCreate.mockResolvedValueOnce({
        output_text: JSON.stringify({
          genre: 'Noir',
          premise: 'A detective takes one impossible final case.',
          characters: ['Mara (Detective)', 'Vale (Fixer)', 'Iris (Witness)']
        })
      });

      const req = {
        body: {
          kind: 'generateSurpriseSetup',
          context: {
            targetGenre: 'Noir',
            style: 'Hardboiled with clipped dialogue'
          },
          promptTrace: {
            enabled: true,
            promptContextRevision: 23,
            styleFingerprint: 'abc123ff'
          }
        }
      } as any;
      const res = {
        statusCode: 200,
        body: null as any,
        headers: {} as Record<string, string>,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          this.body = payload;
          return this;
        },
        set(name: string, value: string) {
          this.headers[name.toLowerCase()] = value;
          return this;
        }
      } as any;

      await handleAiGenerate(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body?.debug?.previews?.context).toMatchObject({
        targetGenre: 'Noir',
        styleId: null,
        styleName: '',
        style: 'Hardboiled with clipped dialogue'
      });
    } finally {
      if (previousDebugEnv === undefined) {
        delete process.env.SS_DEBUG_PROMPTS;
      } else {
        process.env.SS_DEBUG_PROMPTS = previousDebugEnv;
      }
    }
  });

  it('resolves generateScene style context from the canonical style library entry', async () => {
    const previousDebugEnv = process.env.SS_DEBUG_PROMPTS;
    try {
      process.env.SS_DEBUG_PROMPTS = '1';
      mockResponsesCreate.mockResolvedValueOnce({
        output_text: JSON.stringify({
          heading: 'EXT. DOCKSIDE - NIGHT',
          summary: 'A detective arrives under hard rain.',
          blocks: [
            { type: 'action', text: 'Rain needles the dock while the detective scans the dark water.' }
          ]
        })
      });

      const req = {
        body: {
          kind: 'generateScene',
          context: {
            storyContext: {
              title: 'Test',
              genre: 'Noir',
              premise: 'A mystery unfolds.',
              characters: ['Alex'],
              scenes: [
                {
                  heading: 'INT. BAR - NIGHT',
                  summary: 'Alex corners a reluctant informant.'
                },
                {
                  heading: 'EXT. DOCKSIDE - NIGHT',
                  summary: 'The detective loses the courier in the rain.',
                  blocks: [
                    { type: 'action', text: 'Rain needles the dock while the detective scans the dark water.' },
                    { type: 'dialogue', character: 'Alex', text: 'He was here.', parenthetical: '(under breath)' },
                    { type: 'transition', text: 'CUT TO:' }
                  ]
                }
              ],
              style: 'Client supplied label',
              styleId: 'noir-1940s-detective'
            },
            userInstruction: 'Begin.',
            isFirstScene: true
          },
          promptTrace: {
            enabled: true,
            promptContextRevision: 41,
            styleFingerprint: 'abc123ff'
          }
        }
      } as any;

      const res = {
        statusCode: 200,
        body: null as any,
        headers: {} as Record<string, string>,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          this.body = payload;
          return this;
        },
        set(name: string, value: string) {
          this.headers[name.toLowerCase()] = value;
          return this;
        }
      } as any;

      await handleAiGenerate(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body?.debug?.previews?.context).toMatchObject({
        styleId: 'noir-1940s-detective'
      });
      expect(String(res.body?.debug?.previews?.context?.styleContext || '')).toContain('1940s Noir Detective');
      expect(String(res.body?.debug?.previews?.context?.styleContext || '')).toContain('Everyone speaks in brooding metaphors');
      expect(res.body?.debug?.previews?.context).toMatchObject({
        olderSceneSummaries: ['Scene 1: Alex corners a reluctant informant.'],
        recentSceneHeading: 'EXT. DOCKSIDE - NIGHT'
      });
      expect(Array.isArray(res.body?.debug?.previews?.context?.recentSceneBlocks)).toBe(true);

      const prompt = String(mockResponsesCreate.mock.calls[0]?.[0]?.input || '');
      const systemInstruction = String(mockResponsesCreate.mock.calls[0]?.[0]?.instructions || '');
      expect(prompt).toContain('Style Theme: Style: 1940s Noir Detective (noir-1940s-detective).');
      expect(prompt).toContain('Style guidance: Everyone speaks in brooding metaphors, rain is always falling, and there is a heavy reliance on cynical voiceovers.');
      expect(prompt).toContain('Earlier scene summaries:\nScene 1: Alex corners a reluctant informant.');
      expect(prompt).toContain('Most recent prior scene:\nHeading: EXT. DOCKSIDE - NIGHT');
      expect(prompt).toContain('1. ACTION: Rain needles the dock while the detective scans the dark water.');
      expect(prompt).toContain('2. DIALOGUE - Alex (under breath): He was here.');
      expect(prompt).toContain('3. TRANSITION: CUT TO:');
      expect(systemInstruction).toContain('Completion criteria:');
      expect(systemInstruction).toContain('Stay consistent with the provided recent-scene details.');
    } finally {
      if (previousDebugEnv === undefined) {
        delete process.env.SS_DEBUG_PROMPTS;
      } else {
        process.env.SS_DEBUG_PROMPTS = previousDebugEnv;
      }
    }
  });

  it('returns request-aborted mapping for canceled upstream execution', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const canceledError = new Error('Client canceled request.');
      const typedError = canceledError as Error & { code?: string; status?: number };
      typedError.code = 'REQUEST_ABORTED';
      typedError.status = 499;
      mockResponsesCreate.mockRejectedValue(typedError);

      const req = {
        body: {
          kind: 'suggestPlotTwist',
          context: { genre: 'Noir' }
        }
      } as any;
      const res = {
        statusCode: 200,
        body: null as any,
        headers: {} as Record<string, string>,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          this.body = payload;
          return this;
        },
        set(name: string, value: string) {
          this.headers[name.toLowerCase()] = value;
          return this;
        }
      } as any;

      await handleAiGenerate(req, res);
      expect(res.statusCode).toBe(499);
      expect(res.body?.error?.code).toBe('REQUEST_ABORTED');
    } finally {
      consoleInfo.mockRestore();
      consoleError.mockRestore();
    }
  });

  it('rejects generateSurpriseSetup when targetGenre is not canonical', async () => {
    const req = {
      body: {
        kind: 'generateSurpriseSetup',
        context: {
          targetGenre: 'Cyberpunk'
        }
      }
    } as any;
    const res = {
      statusCode: 200,
      body: null as any,
      headers: {} as Record<string, string>,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
      set(name: string, value: string) {
        this.headers[name.toLowerCase()] = value;
        return this;
      }
    } as any;

    await handleAiGenerate(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_REQUEST');
    expect(String(res.body?.error?.message || '')).toContain('Invalid surprise setup target genre.');
  });

  it('returns 429 when upstream error message indicates a rate limit in mixed case', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockResponsesCreate.mockRejectedValue(new Error('Rate limit exceeded. Please retry.'));

      const req = {
        body: {
          kind: 'suggestPlotTwist',
          context: {
            genre: 'Noir'
          }
        }
      } as any;

      const res = {
        statusCode: 200,
        body: null as any,
        headers: {} as Record<string, string>,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          this.body = payload;
          return this;
        },
        set(name: string, value: string) {
          this.headers[name.toLowerCase()] = value;
          return this;
        }
      } as any;

      await handleAiGenerate(req, res);

      expect(res.statusCode).toBe(429);
      expect(res.body?.error?.code).toBe('RATE_LIMITED');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('returns 502 when AI response fails schema validation', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockResponsesCreate.mockResolvedValue({
        output_text: JSON.stringify({ heading: 'INT. OFFICE - DAY', blocks: [] })
      });

      const req = {
        body: {
          kind: 'generateScene',
          context: {
            storyContext: {
              title: 'Test',
              genre: 'Noir',
              premise: 'A mystery unfolds.',
              characters: ['Alex'],
              scenes: []
            },
            userInstruction: 'Begin.',
            isFirstScene: true
          }
        }
      } as any;

      const res = {
        statusCode: 200,
        body: null as any,
        headers: {} as Record<string, string>,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          this.body = payload;
          return this;
        },
        set(name: string, value: string) {
          this.headers[name.toLowerCase()] = value;
          return this;
        }
      } as any;

      await handleAiGenerate(req, res);

      expect(res.statusCode).toBe(502);
      expect(res.body?.error?.code).toBe('INVALID_AI_RESPONSE');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('returns 502 when generateScene includes heading blocks in scene.blocks', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockResponsesCreate.mockResolvedValue({
        output_text: JSON.stringify({
          heading: 'INT. OFFICE - DAY',
          summary: 'An old recorder clicks on.',
          blocks: [
            { type: 'heading', text: 'INT. OFFICE - DAY' }
          ]
        })
      });

      const req = {
        body: {
          kind: 'generateScene',
          context: {
            storyContext: {
              title: 'Test',
              genre: 'Noir',
              premise: 'A mystery unfolds.',
              characters: ['Alex'],
              scenes: []
            },
            userInstruction: 'Begin.',
            isFirstScene: true
          }
        }
      } as any;

      const res = {
        statusCode: 200,
        body: null as any,
        headers: {} as Record<string, string>,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          this.body = payload;
          return this;
        },
        set(name: string, value: string) {
          this.headers[name.toLowerCase()] = value;
          return this;
        }
      } as any;

      await handleAiGenerate(req, res);

      expect(res.statusCode).toBe(502);
      expect(res.body?.error?.code).toBe('INVALID_AI_RESPONSE');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('returns 502 when generateScene dialogue blocks omit character', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockResponsesCreate.mockResolvedValue({
        output_text: JSON.stringify({
          heading: 'INT. OFFICE - DAY',
          summary: 'An old recorder clicks on.',
          blocks: [
            { type: 'dialogue', text: 'We are out of time.' }
          ]
        })
      });

      const req = {
        body: {
          kind: 'generateScene',
          context: {
            storyContext: {
              title: 'Test',
              genre: 'Noir',
              premise: 'A mystery unfolds.',
              characters: ['Alex'],
              scenes: []
            },
            userInstruction: 'Begin.',
            isFirstScene: true
          }
        }
      } as any;

      const res = {
        statusCode: 200,
        body: null as any,
        headers: {} as Record<string, string>,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          this.body = payload;
          return this;
        },
        set(name: string, value: string) {
          this.headers[name.toLowerCase()] = value;
          return this;
        }
      } as any;

      await handleAiGenerate(req, res);

      expect(res.statusCode).toBe(502);
      expect(res.body?.error?.code).toBe('INVALID_AI_RESPONSE');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('returns 502 when generateScene dialogue blocks use a null character', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockResponsesCreate.mockResolvedValue({
        output_text: JSON.stringify({
          heading: 'INT. OFFICE - DAY',
          summary: 'An old recorder clicks on.',
          blocks: [
            { type: 'dialogue', character: null, text: 'We are out of time.' }
          ]
        })
      });

      const req = {
        body: {
          kind: 'generateScene',
          context: {
            storyContext: {
              title: 'Test',
              genre: 'Noir',
              premise: 'A mystery unfolds.',
              characters: ['Alex'],
              scenes: []
            },
            userInstruction: 'Begin.',
            isFirstScene: true
          }
        }
      } as any;

      const res = {
        statusCode: 200,
        body: null as any,
        headers: {} as Record<string, string>,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          this.body = payload;
          return this;
        },
        set(name: string, value: string) {
          this.headers[name.toLowerCase()] = value;
          return this;
        }
      } as any;

      await handleAiGenerate(req, res);

      expect(res.statusCode).toBe(502);
      expect(res.body?.error?.code).toBe('INVALID_AI_RESPONSE');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('returns 502 when generateScene dialogue blocks omit parenthetical', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockResponsesCreate.mockResolvedValue({
        output_text: JSON.stringify({
          heading: 'INT. OFFICE - DAY',
          summary: 'An old recorder clicks on.',
          blocks: [
            { type: 'dialogue', character: 'Alex', text: 'We are out of time.' }
          ]
        })
      });

      const req = {
        body: {
          kind: 'generateScene',
          context: {
            storyContext: {
              title: 'Test',
              genre: 'Noir',
              premise: 'A mystery unfolds.',
              characters: ['Alex'],
              scenes: []
            },
            userInstruction: 'Begin.',
            isFirstScene: true
          }
        }
      } as any;

      const res = {
        statusCode: 200,
        body: null as any,
        headers: {} as Record<string, string>,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          this.body = payload;
          return this;
        },
        set(name: string, value: string) {
          this.headers[name.toLowerCase()] = value;
          return this;
        }
      } as any;

      await handleAiGenerate(req, res);

      expect(res.statusCode).toBe(502);
      expect(res.body?.error?.code).toBe('INVALID_AI_RESPONSE');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('accepts generateScene dialogue blocks when parenthetical is null', async () => {
    mockResponsesCreate.mockResolvedValue({
      output_text: JSON.stringify({
        heading: 'INT. OFFICE - DAY',
        summary: 'An old recorder clicks on.',
        blocks: [
          { type: 'dialogue', character: 'Alex', parenthetical: null, text: 'We are out of time.' }
        ]
      })
    });

    const req = {
      body: {
        kind: 'generateScene',
        context: {
          storyContext: {
            title: 'Test',
            genre: 'Noir',
            premise: 'A mystery unfolds.',
            characters: ['Alex'],
            scenes: []
          },
          userInstruction: 'Begin.',
          isFirstScene: true
        }
      }
    } as any;

    const res = {
      statusCode: 200,
      body: null as any,
      headers: {} as Record<string, string>,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
      set(name: string, value: string) {
        this.headers[name.toLowerCase()] = value;
        return this;
      }
    } as any;

    await handleAiGenerate(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.data).toMatchObject({
      heading: 'INT. OFFICE - DAY',
      summary: 'An old recorder clicks on.',
      blocks: [
        { type: 'dialogue', character: 'Alex', parenthetical: null, text: 'We are out of time.' }
      ]
    });
  });

  it('returns 502 when non-dialogue scene blocks include dialogue-only fields', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockResponsesCreate.mockResolvedValue({
        output_text: JSON.stringify({
          heading: 'INT. OFFICE - DAY',
          summary: 'An old recorder clicks on.',
          blocks: [
            { type: 'action', text: 'A tape spins up.', character: 'Alex' },
            { type: 'transition', text: 'CUT TO:', parenthetical: '(hard cut)' }
          ]
        })
      });

      const req = {
        body: {
          kind: 'generateScene',
          context: {
            storyContext: {
              title: 'Test',
              genre: 'Noir',
              premise: 'A mystery unfolds.',
              characters: ['Alex'],
              scenes: []
            },
            userInstruction: 'Begin.',
            isFirstScene: true
          }
        }
      } as any;

      const res = {
        statusCode: 200,
        body: null as any,
        headers: {} as Record<string, string>,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          this.body = payload;
          return this;
        },
        set(name: string, value: string) {
          this.headers[name.toLowerCase()] = value;
          return this;
        }
      } as any;

      await handleAiGenerate(req, res);

      expect(res.statusCode).toBe(502);
      expect(res.body?.error?.code).toBe('INVALID_AI_RESPONSE');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('returns an empty voice catalog for listVoices when inworld is not configured', async () => {
    const req = {
      body: {
        kind: 'listVoices',
        context: {}
      }
    } as any;

    const res = {
      statusCode: 200,
      body: null as any,
      headers: {} as Record<string, string>,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
      set(name: string, value: string) {
        this.headers[name.toLowerCase()] = value;
        return this;
      }
    } as any;

    await handleAiGenerate(req, res);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body?.data?.voices)).toBe(true);
    expect(res.body.data.voices).toEqual([]);
  });

  it('returns a configuration error for generateSpeech when TTS provider is not configured', async () => {
    const req = {
      body: {
        kind: 'generateSpeech',
        context: {
          text: 'Hello world',
          voiceName: 'inworld-voice-1'
        }
      }
    } as any;

    const res = {
      statusCode: 200,
      body: null as any,
      headers: {} as Record<string, string>,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
      set(name: string, value: string) {
        this.headers[name.toLowerCase()] = value;
        return this;
      }
    } as any;

    await handleAiGenerate(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body?.error?.code).toBe('CONFIG_ERROR');
    expect(res.body?.error?.message).toBe('TTS provider not configured.');
  });

  it('enforces login rate limits even when x-forwarded-for is spoofed', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const agent = request(app);
      for (let i = 0; i < 8; i++) {
        const response = await agent
          .post('/api/auth/login')
          .set('x-forwarded-for', `198.51.100.${i}`)
          .send({ password: 'wrong-password' });
        expect(response.status).toBe(401);
      }

      const limited = await agent
        .post('/api/auth/login')
        .set('x-forwarded-for', '203.0.113.200')
        .send({ password: 'wrong-password' });

      expect(limited.status).toBe(429);
      expect(limited.body?.error?.code).toBe('LOGIN_RATE_LIMITED');
    } finally {
      consoleWarn.mockRestore();
    }
  });
});
