import crypto from 'node:crypto';
import { authError } from './errors.js';

export const createMemorySessionStore = () => {
  const sessions = new Map();

  return {
    sessions,
    async setSession(key, record, ttlMs) {
      sessions.set(key, { record, expiresAt: Date.now() + ttlMs });
    },
    async getSession(key) {
      const entry = sessions.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        sessions.delete(key);
        return null;
      }
      return entry.record;
    },
    async refreshSession(key, record, ttlMs) {
      sessions.set(key, { record, expiresAt: Date.now() + ttlMs });
    },
    async deleteSession(key) {
      sessions.delete(key);
    },
    async close() {
      sessions.clear();
    }
  };
};

export const createMemoryRateLimiter = () => {
  const buckets = new Map();

  return {
    buckets,
    async check({ key, limit, windowMs }) {
      if (!key || limit <= 0) return { allowed: true };
      const now = Date.now();
      const bucket = buckets.get(key) || { count: 0, expiresAt: now + windowMs };
      if (bucket.expiresAt <= now) {
        bucket.count = 0;
        bucket.expiresAt = now + windowMs;
      }
      bucket.count += 1;
      buckets.set(key, bucket);
      if (bucket.count > limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000))
        };
      }
      return { allowed: true };
    },
    async close() {
      buckets.clear();
    }
  };
};

export const createMemoryAuthStore = (initial = {}) => {
  const users = new Map();
  const invites = new Map();
  const challenges = new Map();

  for (const user of initial.users || []) {
    users.set(user.normalizedEmail, { sessionVersion: 1, status: 'active', ...user });
  }
  for (const invite of initial.invites || []) {
    invites.set(invite.normalizedEmail, { ...invite });
  }

  const getActiveInvite = (normalizedEmail, now) => {
    const invite = invites.get(normalizedEmail);
    if (!invite) return null;
    if (invite.revokedAt || invite.acceptedAt || invite.expiresAt <= now) return null;
    return invite;
  };

  return {
    users,
    invites,
    challenges,
    async findEligibleUserForLogin({ email, normalizedEmail, now }) {
      const existing = users.get(normalizedEmail);
      if (existing?.status === 'disabled') {
        throw authError(403, 'USER_DISABLED', 'This account is disabled.');
      }
      if (existing?.status === 'active') {
        return existing;
      }

      const invite = getActiveInvite(normalizedEmail, now);
      if (!invite) {
        throw authError(403, 'INVITE_REQUIRED', 'This email is not on the beta invite list.');
      }

      const user = existing || {
        id: crypto.randomUUID(),
        email,
        normalizedEmail,
        status: 'invited',
        sessionVersion: 1,
        createdAt: now,
        updatedAt: now
      };
      users.set(normalizedEmail, user);
      return user;
    },
    async createChallenge(challenge) {
      challenges.set(challenge.id, { ...challenge });
      return challenge;
    },
    async findLatestChallengeForEmail(normalizedEmail) {
      return [...challenges.values()]
        .filter((challenge) => challenge.normalizedEmail === normalizedEmail)
        .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
    },
    async incrementChallengeAttempt(id) {
      const challenge = challenges.get(id);
      if (!challenge) return null;
      challenge.attemptCount += 1;
      return challenge;
    },
    async consumeChallengeAndActivate({ id, userId, normalizedEmail, now }) {
      const challenge = challenges.get(id);
      if (!challenge || challenge.consumedAt) return null;
      const user = [...users.values()].find((candidate) => candidate.id === userId);
      if (!user) return null;
      if (user.status === 'invited' && !getActiveInvite(normalizedEmail, now)) {
        throw authError(403, 'INVITE_REQUIRED', 'This email is not on the beta invite list.');
      }
      challenge.consumedAt = now;
      if (user.status === 'invited') {
        user.status = 'active';
        user.updatedAt = now;
      }
      const invite = invites.get(normalizedEmail);
      if (invite && !invite.acceptedAt) {
        invite.acceptedAt = now;
      }
      return user;
    },
    async getUserById(userId) {
      return [...users.values()].find((candidate) => candidate.id === userId) || null;
    }
  };
};
