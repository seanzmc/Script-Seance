import cookie from 'cookie';
import { createOpaqueToken, sha256Hex } from './crypto.js';

export const getSessionCookieName = (config) => (config.isProd ? '__Host-ss_session' : 'ss_session');

export const hashSessionToken = (token) => sha256Hex(token);

export const getSessionStoreKey = (tokenHash) => `auth:session:${tokenHash}`;

export const parseSessionToken = (req, config) => {
  const cookies = cookie.parse(req.headers.cookie || '');
  return cookies[getSessionCookieName(config)] || '';
};

export const createSessionCookieOptions = (config) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProd,
  maxAge: config.sessionAbsoluteTtlMs,
  path: '/'
});

export const setSessionCookie = (res, config, token) => {
  res.cookie(getSessionCookieName(config), token, createSessionCookieOptions(config));
};

export const clearSessionCookie = (res, config) => {
  res.clearCookie(getSessionCookieName(config), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    path: '/'
  });
};

export const createSessionRecord = ({ user, req, config, now = Date.now() }) => {
  const absoluteExpiresAt = now + config.sessionAbsoluteTtlMs;
  return {
    userId: user.id,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: Math.min(now + config.sessionIdleTtlMs, absoluteExpiresAt),
    absoluteExpiresAt,
    sessionVersion: user.sessionVersion,
    userAgentHash: req.headers['user-agent'] ? sha256Hex(String(req.headers['user-agent'])) : null
  };
};

export const createSessionTokenAndRecord = ({ user, req, config, now = Date.now() }) => {
  const token = createOpaqueToken();
  const tokenHash = hashSessionToken(token);
  return {
    token,
    tokenHash,
    key: getSessionStoreKey(tokenHash),
    record: createSessionRecord({ user, req, config, now })
  };
};
