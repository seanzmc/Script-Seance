import crypto from 'node:crypto';
import {
  createNumericCode,
  hashCode,
  isValidEmail,
  normalizeEmail,
  safeEqual,
  sha256Hex
} from './crypto.js';
import { authError, AuthError } from './errors.js';
import {
  clearSessionCookie,
  createSessionTokenAndRecord,
  hashSessionToken,
  getSessionStoreKey,
  parseSessionToken,
  setSessionCookie
} from './session.js';

const createUserPayload = (user) => ({
  id: user.id,
  email: user.email,
  status: user.status
});

const getIpKey = (ip) => sha256Hex(ip || 'unknown').slice(0, 32);
const getEmailKey = (normalizedEmail) => sha256Hex(normalizedEmail).slice(0, 32);

const throwIfLimited = async ({ runtime, key, limit, windowMs, code = 'LOGIN_RATE_LIMITED' }) => {
  const result = await runtime.rateLimiter.check({ key, limit, windowMs });
  if (!result.allowed) {
    throw authError(429, code, 'Too many attempts. Please try again later.', {
      retryAfterSeconds: result.retryAfterSeconds,
      limit,
      windowSeconds: Math.ceil(windowMs / 1000)
    });
  }
};

const sendAuthError = (sendError, res, error) => {
  if (error instanceof AuthError) {
    return sendError(res, error.status, error.message, error.code, error.details);
  }
  console.error('[auth] failed', error);
  return sendError(res, 500, 'Authentication failed.', 'AUTH_ERROR');
};

const createDevUser = () => ({
  id: 'dev-user',
  email: 'dev@script-seance.local',
  normalizedEmail: 'dev@script-seance.local',
  status: 'active',
  sessionVersion: 1
});

const createSessionForUser = async ({ runtime, req, res, user }) => {
  const now = Date.now();
  const { token, key, record } = createSessionTokenAndRecord({
    user,
    req,
    config: runtime.config,
    now
  });
  await runtime.sessionStore.setSession(key, record, record.expiresAt - now);
  setSessionCookie(res, runtime.config, token);
  return record;
};

export const resolveRequestSession = async (runtime, req) => {
  const token = parseSessionToken(req, runtime.config);
  if (!token) return null;
  const key = getSessionStoreKey(hashSessionToken(token));
  const session = await runtime.sessionStore.getSession(key);
  const now = Date.now();
  if (!session || session.expiresAt <= now || session.absoluteExpiresAt <= now) {
    await runtime.sessionStore.deleteSession(key);
    return null;
  }

  let user;
  if (runtime.config.mode === 'dev_shared_password') {
    user = createDevUser();
  } else {
    user = await runtime.authStore.getUserById(session.userId);
  }

  if (!user || user.status === 'disabled' || user.sessionVersion !== session.sessionVersion) {
    await runtime.sessionStore.deleteSession(key);
    return null;
  }

  const nextExpiresAt = Math.min(now + runtime.config.sessionIdleTtlMs, session.absoluteExpiresAt);
  const refreshedSession = {
    ...session,
    lastSeenAt: now,
    expiresAt: nextExpiresAt
  };
  await runtime.sessionStore.refreshSession(key, refreshedSession, nextExpiresAt - now);
  return { key, session: refreshedSession, user };
};

export const createAuthHandlers = ({ getRuntime, getClientIp, sendError }) => {
  const handleLogin = async (req, res) => {
    const runtime = getRuntime();
    try {
      if (runtime.config.mode === 'dev_shared_password') {
        const password = req.body?.password;
        const email = typeof req.body?.email === 'string' && isValidEmail(normalizeEmail(req.body.email))
          ? req.body.email.trim()
          : 'dev@script-seance.local';
        await throwIfLimited({
          runtime,
          key: `auth:dev-login:${getIpKey(getClientIp(req))}`,
          limit: runtime.config.loginMaxAttempts,
          windowMs: runtime.config.loginWindowMs
        });
        if (typeof password === 'string' && password.trim() && !safeEqual(password, runtime.config.adminPassword)) {
          throw authError(401, 'UNAUTHORIZED', 'Invalid password.');
        }
        if (typeof password !== 'string' && !req.body?.email) {
          throw authError(400, 'INVALID_REQUEST', 'Invalid login payload.');
        }
        const user = { ...createDevUser(), email, normalizedEmail: normalizeEmail(email) };
        await createSessionForUser({ runtime, req, res, user });
        return res.json({ data: { ok: true, user: createUserPayload(user) } });
      }

      const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
      const normalizedEmail = normalizeEmail(email);
      if (!isValidEmail(normalizedEmail)) {
        throw authError(400, 'INVALID_REQUEST', 'Enter a valid email address.');
      }
      await throwIfLimited({
        runtime,
        key: `auth:login:${getIpKey(getClientIp(req))}:${getEmailKey(normalizedEmail)}`,
        limit: runtime.config.loginMaxAttempts,
        windowMs: runtime.config.loginWindowMs
      });

      const now = Date.now();
      const user = await runtime.authStore.findEligibleUserForLogin({ email, normalizedEmail, now });
      const challengeId = crypto.randomUUID();
      const code = createNumericCode();
      await runtime.authStore.createChallenge({
        id: challengeId,
        userId: user.id,
        normalizedEmail,
        codeHash: hashCode({ challengeId, code, secret: runtime.config.authCodeSecret }),
        expiresAt: now + runtime.config.authCodeTtlMs,
        maxAttempts: runtime.config.maxVerificationAttempts,
        attemptCount: 0,
        createdAt: now
      });
      await runtime.emailSender.sendLoginCode({
        email: user.email,
        code,
        expiresInMinutes: Math.ceil(runtime.config.authCodeTtlMs / 60000)
      });
      return res.json({ data: { ok: true, email: user.email } });
    } catch (error) {
      return sendAuthError(sendError, res, error);
    }
  };

  const handleVerify = async (req, res) => {
    const runtime = getRuntime();
    try {
      if (runtime.config.mode === 'dev_shared_password') {
        throw authError(404, 'NOT_FOUND', 'Code verification is not available in dev password mode.');
      }
      const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
      const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
      const normalizedEmail = normalizeEmail(email);
      if (!isValidEmail(normalizedEmail) || !/^\d{6}$/.test(code)) {
        throw authError(400, 'INVALID_REQUEST', 'Invalid verification payload.');
      }
      await throwIfLimited({
        runtime,
        key: `auth:verify:${getIpKey(getClientIp(req))}:${getEmailKey(normalizedEmail)}`,
        limit: runtime.config.loginMaxAttempts,
        windowMs: runtime.config.loginWindowMs,
        code: 'VERIFY_RATE_LIMITED'
      });

      const challenge = await runtime.authStore.findLatestChallengeForEmail(normalizedEmail);
      const now = Date.now();
      if (!challenge) {
        throw authError(401, 'AUTH_CODE_INVALID', 'Invalid or expired sign-in code.');
      }
      if (challenge.consumedAt) {
        throw authError(401, 'AUTH_CODE_CONSUMED', 'This sign-in code was already used.');
      }
      if (challenge.expiresAt <= now) {
        throw authError(401, 'AUTH_CODE_EXPIRED', 'This sign-in code has expired.');
      }
      if (challenge.attemptCount >= challenge.maxAttempts) {
        throw authError(429, 'AUTH_CODE_ATTEMPTS_EXCEEDED', 'Too many incorrect code attempts.');
      }

      const expectedHash = hashCode({
        challengeId: challenge.id,
        code,
        secret: runtime.config.authCodeSecret
      });
      if (!safeEqual(expectedHash, challenge.codeHash)) {
        await runtime.authStore.incrementChallengeAttempt(challenge.id);
        throw authError(401, 'AUTH_CODE_INVALID', 'Invalid or expired sign-in code.');
      }

      const user = await runtime.authStore.consumeChallengeAndActivate({
        id: challenge.id,
        userId: challenge.userId,
        normalizedEmail,
        now
      });
      if (!user || user.status === 'disabled') {
        throw authError(403, 'USER_DISABLED', 'This account is disabled.');
      }
      await createSessionForUser({ runtime, req, res, user });
      return res.json({ data: { ok: true, user: createUserPayload(user) } });
    } catch (error) {
      return sendAuthError(sendError, res, error);
    }
  };

  const handleSession = async (req, res) => {
    const runtime = getRuntime();
    try {
      const resolved = await resolveRequestSession(runtime, req);
      if (!resolved) {
        throw authError(401, 'UNAUTHORIZED', 'Not authenticated.');
      }
      return res.json({ data: { ok: true, user: createUserPayload(resolved.user) } });
    } catch (error) {
      return sendAuthError(sendError, res, error);
    }
  };

  const handleLogout = async (req, res) => {
    const runtime = getRuntime();
    try {
      const token = parseSessionToken(req, runtime.config);
      if (token) {
        await runtime.sessionStore.deleteSession(getSessionStoreKey(hashSessionToken(token)));
      }
      clearSessionCookie(res, runtime.config);
      return res.json({ data: { ok: true } });
    } catch (error) {
      return sendAuthError(sendError, res, error);
    }
  };

  return {
    handleLogin,
    handleVerify,
    handleSession,
    handleLogout
  };
};

export const createRequireSession = ({ getRuntime, sendError }) => async (req, res, next) => {
  try {
    const runtime = getRuntime();
    const resolved = await resolveRequestSession(runtime, req);
    if (!resolved) {
      return sendError(res, 401, 'Authentication required.', 'UNAUTHORIZED');
    }
    req.authSession = resolved.session;
    req.user = resolved.user;
    req.userId = resolved.user.id;
    return next();
  } catch (error) {
    return sendAuthError(sendError, res, error);
  }
};
