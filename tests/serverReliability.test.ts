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
