import { createPostgresAuthStore } from './postgresStore.js';
import { createRedisRuntimeStore } from './redisStore.js';
import { createEmailSender } from './emailDelivery.js';
import { createMemorySessionStore, createMemoryRateLimiter } from './memoryStores.js';

export const createAuthRuntime = (config) => {
  if (config.mode === 'dev_shared_password') {
    const memoryStore = createMemorySessionStore();
    return {
      config,
      authStore: null,
      sessionStore: memoryStore,
      rateLimiter: createMemoryRateLimiter(),
      emailSender: null,
      async close() {
        await memoryStore.close();
      }
    };
  }

  const redisStore = createRedisRuntimeStore({ url: config.redisUrl });
  const authStore = createPostgresAuthStore({ connectionString: config.databaseUrl });
  return {
    config,
    authStore,
    sessionStore: redisStore,
    rateLimiter: redisStore,
    emailSender: createEmailSender(config),
    async close() {
      await Promise.allSettled([
        redisStore.close(),
        authStore.close()
      ]);
    }
  };
};
