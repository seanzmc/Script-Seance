import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';

let app: typeof import('../server/index.js').app;
let handleAiGenerate: typeof import('../server/index.js').handleAiGenerate;
let pruneStaleEntries: typeof import('../server/index.js').pruneStaleEntries;
let sessions: typeof import('../server/index.js').sessions;
let rateBuckets: typeof import('../server/index.js').rateBuckets;
let loginBuckets: typeof import('../server/index.js').loginBuckets;

const mockGenerateContent = vi.fn();

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: (...args: unknown[]) => mockGenerateContent(...args)
    };
  },
  Type: { OBJECT: 'object', ARRAY: 'array', STRING: 'string' }
}));

beforeAll(async () => {
  process.env.ADMIN_PASSWORD = 'test-password';
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.TEXT_LLM_PROVIDER = 'gemini';
  process.env.INWORLD_API_KEY = '';
  process.env.INWORLD_API_SECRET = '';
  process.env.INWORLD_WORKSPACE_ID = '';

  const serverModule = await import('../server/index.js');
  app = serverModule.app;
  handleAiGenerate = serverModule.handleAiGenerate;
  pruneStaleEntries = serverModule.pruneStaleEntries;
  sessions = serverModule.sessions;
  rateBuckets = serverModule.rateBuckets;
  loginBuckets = serverModule.loginBuckets;
});

beforeEach(() => {
  mockGenerateContent.mockReset();
  sessions.clear();
  rateBuckets.clear();
  loginBuckets.clear();
});

describe('server reliability', () => {
  it('sends prompt debug metadata only when both server and client debug flags are enabled', async () => {
    const previousDebugEnv = process.env.SS_DEBUG_PROMPTS;
    try {
      delete process.env.SS_DEBUG_PROMPTS;
      mockGenerateContent.mockResolvedValueOnce({ text: 'A twist appears.' });

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
      mockGenerateContent.mockResolvedValueOnce({ text: 'Another twist appears.' });

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

      mockGenerateContent.mockResolvedValueOnce({ text: 'Final twist appears.' });

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
        provider: 'gemini',
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
      mockGenerateContent.mockRejectedValue(timeoutError);

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
      mockGenerateContent.mockResolvedValueOnce({
        text: JSON.stringify({
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
            styleName: 'Client supplied label'
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
      const prompt = String(mockGenerateContent.mock.calls[0]?.[0]?.contents || '');
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

  it('returns request-aborted mapping for canceled upstream execution', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const canceledError = new Error('Client canceled request.');
      const typedError = canceledError as Error & { code?: string; status?: number };
      typedError.code = 'REQUEST_ABORTED';
      typedError.status = 499;
      mockGenerateContent.mockRejectedValue(typedError);

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

  it('returns 429 when upstream error message indicates a rate limit in mixed case', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockGenerateContent.mockRejectedValue(new Error('Rate limit exceeded. Please retry.'));

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
      mockGenerateContent.mockResolvedValue({
        text: JSON.stringify({ heading: 'INT. OFFICE - DAY', blocks: [] })
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

  it('prunes expired sessions and stale rate buckets', () => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    sessions.set('expired', { createdAt: now - 10000, expiresAt: now - 1 });
    sessions.set('active', { createdAt: now - 10000, expiresAt: now + 10000 });

    rateBuckets.set('stale', {
      minuteStart: now - dayMs,
      minuteCount: 1,
      dayStart: now - dayMs * 2,
      dayCount: 1,
      lastSeen: now - dayMs * 2
    });
    rateBuckets.set('active', {
      minuteStart: now - 1000,
      minuteCount: 1,
      dayStart: now - 1000,
      dayCount: 1,
      lastSeen: now - 1000
    });

    pruneStaleEntries(now);

    expect(sessions.has('expired')).toBe(false);
    expect(sessions.has('active')).toBe(true);
    expect(rateBuckets.has('stale')).toBe(false);
    expect(rateBuckets.has('active')).toBe(true);
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
