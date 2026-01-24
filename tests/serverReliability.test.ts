import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';

let app: typeof import('../server/index.js').app;
let pruneStaleEntries: typeof import('../server/index.js').pruneStaleEntries;
let sessions: typeof import('../server/index.js').sessions;
let rateBuckets: typeof import('../server/index.js').rateBuckets;

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
  pruneStaleEntries = serverModule.pruneStaleEntries;
  sessions = serverModule.sessions;
  rateBuckets = serverModule.rateBuckets;
});

beforeEach(() => {
  mockGenerateContent.mockReset();
  sessions.clear();
  rateBuckets.clear();
});

describe('server reliability', () => {
  it('returns 502 when AI response fails schema validation', async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ heading: 'INT. OFFICE - DAY', blocks: [] })
    });

    const server = app.listen(0, '127.0.0.1');
    const agent = request.agent(server);
    try {
      await agent.post('/api/auth/login').send({ password: 'test-password' });

      const response = await agent.post('/api/ai/generate').send({
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
      });

      expect(response.status).toBe(502);
      expect(response.body.error?.code).toBe('INVALID_AI_RESPONSE');
    } finally {
      await new Promise((resolve) => server.close(resolve));
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
});
