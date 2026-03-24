import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const MANAGED_ENV_KEYS = [
  'ADMIN_PASSWORD',
  'SCRIPT_SEANCE_OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_FAST_MODEL',
  'OPENAI_BALANCED_MODEL',
  'INWORLD_API_KEY',
  'INWORLD_API_SECRET',
  'INWORLD_WORKSPACE_ID',
  'NODE_ENV',
  'ALLOWED_ORIGINS'
] as const;

type ManagedEnvKey = (typeof MANAGED_ENV_KEYS)[number];

let previousEnv: Partial<Record<ManagedEnvKey, string | undefined>> = {};

const restoreManagedEnv = () => {
  for (const key of MANAGED_ENV_KEYS) {
    const value = previousEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

const loadApp = async (overrides?: Partial<Record<ManagedEnvKey, string>>) => {
  vi.resetModules();
  process.env.ADMIN_PASSWORD = 'test-password';
  process.env.SCRIPT_SEANCE_OPENAI_API_KEY = 'test-openai-key';
  process.env.OPENAI_MODEL = 'gpt-5.4-test-primary';
  process.env.OPENAI_FAST_MODEL = 'gpt-5.4-nano-test-fast';
  process.env.OPENAI_BALANCED_MODEL = 'gpt-5.4-mini-test-balanced';
  process.env.INWORLD_API_KEY = '';
  process.env.INWORLD_API_SECRET = '';
  process.env.INWORLD_WORKSPACE_ID = '';
  process.env.NODE_ENV = 'development';
  process.env.ALLOWED_ORIGINS = 'http://localhost:3000,http://127.0.0.1:3000';
  if (overrides) {
    Object.assign(process.env, overrides);
  }
  const serverModule = await import('../server/index.js');
  return serverModule.app;
};

beforeEach(() => {
  previousEnv = {};
  for (const key of MANAGED_ENV_KEYS) {
    previousEnv[key] = process.env[key];
  }
});

afterEach(() => {
  restoreManagedEnv();
  vi.resetModules();
});

describe('origin guard', () => {
  it('returns 403 for disallowed Origin on POST /api/auth/login', async () => {
    const app = await loadApp();
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ password: 'test-password' });

    expect(response.status).toBe(403);
    expect(response.body?.error?.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('returns 403 for disallowed Origin on POST /api/ai/generate', async () => {
    const app = await loadApp();
    const response = await request(app)
      .post('/api/ai/generate')
      .set('Origin', 'https://evil.example')
      .send({
        kind: 'suggestPlotTwist',
        context: { genre: 'Noir' }
      });

    expect(response.status).toBe(403);
    expect(response.body?.error?.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('allows allowlisted Origin on POST /api/ai/generate to pass origin guard', async () => {
    const app = await loadApp();
    const response = await request(app)
      .post('/api/ai/generate')
      .set('Origin', 'http://localhost:3000')
      .send({
        kind: 'suggestPlotTwist',
        context: { genre: 'Noir' }
      });

    expect(response.status).not.toBe(403);
  });

  it('returns 403 for missing Origin in production', async () => {
    const app = await loadApp({ NODE_ENV: 'production' });
    const response = await request(app)
      .post('/api/auth/login')
      .send({ password: 'test-password' });

    expect(response.status).toBe(403);
    expect(response.body?.error?.code).toBe('ORIGIN_REQUIRED');
  });
});
