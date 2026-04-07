const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MINUTE_MS = 60 * 1000;

const AUTH_MODES = new Set(['invite_code', 'dev_shared_password']);

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const readOptional = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '');

export const resolveAuthConfig = (env = process.env) => {
  const isProd = env.NODE_ENV === 'production';
  const rawMode = readOptional(env.AUTH_MODE);
  const mode = rawMode || (isProd ? 'invite_code' : 'dev_shared_password');
  if (!AUTH_MODES.has(mode)) {
    throw new Error(`Invalid AUTH_MODE "${mode}". Expected invite_code or dev_shared_password.`);
  }

  return {
    mode,
    isProd,
    adminPassword: readOptional(env.ADMIN_PASSWORD),
    databaseUrl: readOptional(env.DATABASE_URL),
    redisUrl: readOptional(env.REDIS_URL),
    appBaseUrl: readOptional(env.APP_BASE_URL),
    authCodeSecret: readOptional(env.AUTH_CODE_SECRET),
    emailFrom: readOptional(env.AUTH_EMAIL_FROM),
    emailTransport: readOptional(env.AUTH_EMAIL_TRANSPORT) || (isProd ? 'smtp' : 'console'),
    smtp: {
      host: readOptional(env.SMTP_HOST),
      port: parsePositiveInt(env.SMTP_PORT, 587),
      user: readOptional(env.SMTP_USER),
      password: readOptional(env.SMTP_PASSWORD)
    },
    sessionIdleTtlMs: parsePositiveInt(env.AUTH_SESSION_IDLE_TTL_MS, 12 * HOUR_MS),
    sessionAbsoluteTtlMs: parsePositiveInt(env.AUTH_SESSION_ABSOLUTE_TTL_MS, 14 * DAY_MS),
    authCodeTtlMs: parsePositiveInt(env.AUTH_CODE_TTL_MS, 10 * MINUTE_MS),
    inviteTtlMs: parsePositiveInt(env.AUTH_INVITE_TTL_MS, 30 * DAY_MS),
    maxVerificationAttempts: parsePositiveInt(env.AUTH_CODE_MAX_ATTEMPTS, 5),
    loginWindowMs: parsePositiveInt(env.AUTH_LOGIN_WINDOW_MS, 10 * MINUTE_MS),
    loginMaxAttempts: parsePositiveInt(env.AUTH_LOGIN_MAX_ATTEMPTS, 8)
  };
};

export const validateAuthConfigForBoot = (config) => {
  if (config.isProd && config.mode === 'dev_shared_password') {
    throw new Error('AUTH_MODE=dev_shared_password is not allowed in production.');
  }

  if (config.mode === 'dev_shared_password') {
    return;
  }

  const missing = [];
  if (!config.databaseUrl) missing.push('DATABASE_URL');
  if (!config.redisUrl) missing.push('REDIS_URL');
  if (!config.authCodeSecret) missing.push('AUTH_CODE_SECRET');
  if (!config.emailFrom) missing.push('AUTH_EMAIL_FROM');

  if (config.emailTransport === 'smtp') {
    if (!config.smtp.host) missing.push('SMTP_HOST');
    if (!config.smtp.user) missing.push('SMTP_USER');
    if (!config.smtp.password) missing.push('SMTP_PASSWORD');
  } else if (config.isProd) {
    missing.push('AUTH_EMAIL_TRANSPORT=smtp');
  }

  if (missing.length > 0) {
    throw new Error(`Missing auth configuration: ${missing.join(', ')}.`);
  }
};
