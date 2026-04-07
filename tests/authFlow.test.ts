import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAuthConfig, validateAuthConfigForBoot } from '../server/auth/config.js';
import { createAuthHandlers } from '../server/auth/routes.js';
import { createMemoryAuthStore, createMemoryRateLimiter, createMemorySessionStore } from '../server/auth/memoryStores.js';
import { rateLimitAi, resetAuthRuntimeForTests, setAuthRuntimeForTests } from '../server/index.js';

const invitedEmail = 'beta@example.com';
const normalizedEmail = invitedEmail;

const createRuntime = (overrides: Record<string, string> = {}) => {
  const config = resolveAuthConfig({
    NODE_ENV: 'test',
    AUTH_MODE: 'invite_code',
    AUTH_CODE_SECRET: 'test-code-secret',
    AUTH_EMAIL_FROM: 'test@example.com',
    AUTH_EMAIL_TRANSPORT: 'console',
    DATABASE_URL: 'postgres://test',
    REDIS_URL: 'redis://localhost:6379',
    ...overrides
  });
  const authStore = createMemoryAuthStore({
    invites: [{
      id: 'invite-1',
      email: invitedEmail,
      normalizedEmail,
      expiresAt: Date.now() + config.inviteTtlMs,
      acceptedAt: null,
      revokedAt: null
    }]
  });
  const sessionStore = createMemorySessionStore();
  const rateLimiter = createMemoryRateLimiter();
  const sentCodes: Array<{ email: string; code: string }> = [];
  const runtime = {
    config,
    authStore,
    sessionStore,
    rateLimiter,
    emailSender: {
      async sendLoginCode(payload: { email: string; code: string }) {
        sentCodes.push(payload);
      }
    }
  };
  return { runtime, authStore, sessionStore, rateLimiter, sentCodes };
};

const createAuthApp = (runtime: ReturnType<typeof createRuntime>['runtime']) => {
  const app = express();
  const handlers = createAuthHandlers({
    getRuntime: () => runtime,
    getClientIp: (req) => req.ip || '127.0.0.1',
    sendError: (res, status, message, code, details) =>
      res.status(status).json({ error: { message, code, ...(details ? { details } : {}) } })
  });
  app.use(express.json());
  app.post('/api/auth/login', handlers.handleLogin);
  app.post('/api/auth/verify', handlers.handleVerify);
  app.post('/api/auth/logout', handlers.handleLogout);
  app.get('/api/auth/session', handlers.handleSession);
  return app;
};

describe('invite-code auth flow', () => {
  afterEach(() => {
    resetAuthRuntimeForTests();
  });

  it('starts login for an invited email and rejects uninvited email', async () => {
    const { runtime, sentCodes } = createRuntime();
    const app = createAuthApp(runtime);

    const success = await request(app).post('/api/auth/login').send({ email: invitedEmail });
    expect(success.status).toBe(200);
    expect(success.body.data.email).toBe(invitedEmail);
    expect(sentCodes).toHaveLength(1);

    const failure = await request(app).post('/api/auth/login').send({ email: 'nope@example.com' });
    expect(failure.status).toBe(403);
    expect(failure.body.error.code).toBe('INVITE_REQUIRED');
  });

  it('verifies a code, creates a cookie session, reads it from a shared store, and logs out', async () => {
    const { runtime, sentCodes, sessionStore, authStore, rateLimiter } = createRuntime();
    const app = createAuthApp(runtime);
    const agent = request.agent(app);

    await agent.post('/api/auth/login').send({ email: invitedEmail }).expect(200);
    const code = sentCodes[0].code;

    const verify = await agent.post('/api/auth/verify').send({ email: invitedEmail, code });
    expect(verify.status).toBe(200);
    expect(String(verify.headers['set-cookie'])).toContain('ss_session=');
    expect(verify.body.data.user.email).toBe(invitedEmail);

    const secondRuntime = { ...runtime, authStore, sessionStore, rateLimiter };
    const secondApp = createAuthApp(secondRuntime);
    const cookie = verify.headers['set-cookie'];
    const session = await request(secondApp).get('/api/auth/session').set('Cookie', cookie);
    expect(session.status).toBe(200);
    expect(session.body.data.user.email).toBe(invitedEmail);

    await agent.post('/api/auth/logout').expect(200);
    await agent.get('/api/auth/session').expect(401);
  });

  it('rejects expired, consumed, and attempt-limited codes', async () => {
    const { runtime, sentCodes, authStore } = createRuntime();
    const app = createAuthApp(runtime);
    await request(app).post('/api/auth/login').send({ email: invitedEmail }).expect(200);
    const challenge = [...authStore.challenges.values()][0];
    challenge.expiresAt = Date.now() - 1;
    await request(app)
      .post('/api/auth/verify')
      .send({ email: invitedEmail, code: sentCodes[0].code })
      .expect(401)
      .expect((response) => {
        expect(response.body.error.code).toBe('AUTH_CODE_EXPIRED');
      });

    const fresh = createRuntime();
    const freshApp = createAuthApp(fresh.runtime);
    await request(freshApp).post('/api/auth/login').send({ email: invitedEmail }).expect(200);
    const freshCode = fresh.sentCodes[0].code;
    await request(freshApp).post('/api/auth/verify').send({ email: invitedEmail, code: freshCode }).expect(200);
    await request(freshApp)
      .post('/api/auth/verify')
      .send({ email: invitedEmail, code: freshCode })
      .expect(401)
      .expect((response) => {
        expect(response.body.error.code).toBe('AUTH_CODE_CONSUMED');
      });

    const limited = createRuntime();
    const limitedApp = createAuthApp(limited.runtime);
    await request(limitedApp).post('/api/auth/login').send({ email: invitedEmail }).expect(200);
    for (let index = 0; index < limited.runtime.config.maxVerificationAttempts; index += 1) {
      await request(limitedApp).post('/api/auth/verify').send({ email: invitedEmail, code: '000000' }).expect(401);
    }
    await request(limitedApp)
      .post('/api/auth/verify')
      .send({ email: invitedEmail, code: '000000' })
      .expect(429)
      .expect((response) => {
        expect(response.body.error.code).toBe('AUTH_CODE_ATTEMPTS_EXCEEDED');
      });
  });

  it('keys AI quota by userId and rejects insecure production auth mode', async () => {
    const { runtime, rateLimiter } = createRuntime();
    const checkSpy = vi.spyOn(rateLimiter, 'check');
    setAuthRuntimeForTests(runtime);

    const req = { userId: 'user-123' };
    const res = {
      headers: {} as Record<string, string>,
      set(name: string, value: string) {
        this.headers[name] = value;
        return this;
      },
      status() {
        return this;
      },
      json() {
        return this;
      }
    };
    const next = vi.fn();
    await rateLimitAi(req as any, res as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(checkSpy.mock.calls[0][0].key).toMatch(/^ai:minute:/);
    expect(checkSpy.mock.calls[0][0].key).not.toContain('ss_session');

    const prodConfig = resolveAuthConfig({
      NODE_ENV: 'production',
      AUTH_MODE: 'dev_shared_password',
      ADMIN_PASSWORD: 'nope'
    });
    expect(() => validateAuthConfigForBoot(prodConfig)).toThrow(/not allowed in production/);
  });
});
