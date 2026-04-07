import { createClient } from 'redis';

const ensureConnected = async (client) => {
  if (!client.isOpen) {
    await client.connect();
  }
};

export const createRedisRuntimeStore = ({ url }) => {
  const client = createClient({ url });

  client.on('error', (error) => {
    console.error('[redis] error', error);
  });

  return {
    async setSession(key, record, ttlMs) {
      await ensureConnected(client);
      await client.set(key, JSON.stringify(record), { PX: ttlMs });
    },
    async getSession(key) {
      await ensureConnected(client);
      const raw = await client.get(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        await client.del(key);
        return null;
      }
    },
    async refreshSession(key, record, ttlMs) {
      await ensureConnected(client);
      await client.set(key, JSON.stringify(record), { PX: ttlMs });
    },
    async deleteSession(key) {
      await ensureConnected(client);
      await client.del(key);
    },
    async check({ key, limit, windowMs }) {
      if (!key || limit <= 0) return { allowed: true };
      await ensureConnected(client);
      const count = await client.incr(key);
      if (count === 1) {
        await client.pExpire(key, windowMs);
      }
      const ttl = await client.pTTL(key);
      if (count > limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil(Math.max(ttl, 0) / 1000))
        };
      }
      return { allowed: true };
    },
    async close() {
      if (client.isOpen) {
        await client.quit();
      }
    }
  };
};
