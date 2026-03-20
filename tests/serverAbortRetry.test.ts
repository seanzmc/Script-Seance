import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithRetry } from '../server/upstreamControl.js';

const mockResponsesCreate = vi.fn();

vi.mock('openai', () => ({
  default: class {
    responses = {
      create: (...args: unknown[]) => mockResponsesCreate(...args)
    };
  }
}));

let handleAiGenerate: typeof import('../server/index.js').handleAiGenerate;
const previousEnv = {
  TEXT_LLM_PROVIDER: process.env.TEXT_LLM_PROVIDER,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OPENAI_FAST_MODEL: process.env.OPENAI_FAST_MODEL,
  OPENAI_BALANCED_MODEL: process.env.OPENAI_BALANCED_MODEL,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  AI_UPSTREAM_TIMEOUT_MS: process.env.AI_UPSTREAM_TIMEOUT_MS,
  AI_UPSTREAM_TIMEOUT_MS_SCENE: process.env.AI_UPSTREAM_TIMEOUT_MS_SCENE,
  AI_UPSTREAM_RETRY_MAX_RETRIES: process.env.AI_UPSTREAM_RETRY_MAX_RETRIES,
  AI_UPSTREAM_RETRY_BASE_DELAY_MS: process.env.AI_UPSTREAM_RETRY_BASE_DELAY_MS,
  AI_UPSTREAM_RETRY_MAX_DELAY_MS: process.env.AI_UPSTREAM_RETRY_MAX_DELAY_MS,
  AI_UPSTREAM_RETRY_JITTER_MS: process.env.AI_UPSTREAM_RETRY_JITTER_MS,
  INWORLD_API_KEY: process.env.INWORLD_API_KEY,
  INWORLD_API_SECRET: process.env.INWORLD_API_SECRET,
  INWORLD_WORKSPACE_ID: process.env.INWORLD_WORKSPACE_ID
};
const originalFetch = globalThis.fetch;

type MockRes = {
  statusCode: number;
  body: Record<string, unknown> | null;
  headers: Record<string, string>;
  status: (code: number) => MockRes;
  json: (payload: Record<string, unknown>) => MockRes;
  set: (name: string, value: string) => MockRes;
};

const createMockRes = (): MockRes => ({
  statusCode: 200,
  body: null,
  headers: {},
  status(code: number) {
    this.statusCode = code;
    return this;
  },
  json(payload: Record<string, unknown>) {
    this.body = payload;
    return this;
  },
  set(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
    return this;
  }
});

const createAbortableReq = (body: Record<string, unknown>) => {
  const req = Object.assign(new EventEmitter(), { body });
  const socket = new EventEmitter();
  (req as any).socket = socket;
  return req as any;
};

beforeAll(async () => {
  process.env.TEXT_LLM_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.OPENAI_MODEL = 'gpt-5.4-test-primary';
  process.env.OPENAI_FAST_MODEL = 'gpt-5.4-nano-test-fast';
  process.env.OPENAI_BALANCED_MODEL = 'gpt-5.4-mini-test-balanced';
  process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-password';
  process.env.AI_UPSTREAM_TIMEOUT_MS = '25';
  process.env.AI_UPSTREAM_TIMEOUT_MS_SCENE = '25';
  process.env.AI_UPSTREAM_RETRY_MAX_RETRIES = '2';
  process.env.AI_UPSTREAM_RETRY_BASE_DELAY_MS = '1';
  process.env.AI_UPSTREAM_RETRY_MAX_DELAY_MS = '2';
  process.env.AI_UPSTREAM_RETRY_JITTER_MS = '0';
  process.env.INWORLD_API_KEY = 'test-inworld-key';
  process.env.INWORLD_API_SECRET = 'test-inworld-secret';
  process.env.INWORLD_WORKSPACE_ID = 'test-workspace';

  vi.resetModules();
  const serverModule = await import('../server/index.js');
  handleAiGenerate = serverModule.handleAiGenerate;
});

afterAll(() => {
  process.env.TEXT_LLM_PROVIDER = previousEnv.TEXT_LLM_PROVIDER;
  process.env.OPENAI_API_KEY = previousEnv.OPENAI_API_KEY;
  process.env.OPENAI_MODEL = previousEnv.OPENAI_MODEL;
  process.env.OPENAI_FAST_MODEL = previousEnv.OPENAI_FAST_MODEL;
  process.env.OPENAI_BALANCED_MODEL = previousEnv.OPENAI_BALANCED_MODEL;
  process.env.ADMIN_PASSWORD = previousEnv.ADMIN_PASSWORD;
  process.env.AI_UPSTREAM_TIMEOUT_MS = previousEnv.AI_UPSTREAM_TIMEOUT_MS;
  process.env.AI_UPSTREAM_TIMEOUT_MS_SCENE = previousEnv.AI_UPSTREAM_TIMEOUT_MS_SCENE;
  process.env.AI_UPSTREAM_RETRY_MAX_RETRIES = previousEnv.AI_UPSTREAM_RETRY_MAX_RETRIES;
  process.env.AI_UPSTREAM_RETRY_BASE_DELAY_MS = previousEnv.AI_UPSTREAM_RETRY_BASE_DELAY_MS;
  process.env.AI_UPSTREAM_RETRY_MAX_DELAY_MS = previousEnv.AI_UPSTREAM_RETRY_MAX_DELAY_MS;
  process.env.AI_UPSTREAM_RETRY_JITTER_MS = previousEnv.AI_UPSTREAM_RETRY_JITTER_MS;
  process.env.INWORLD_API_KEY = previousEnv.INWORLD_API_KEY;
  process.env.INWORLD_API_SECRET = previousEnv.INWORLD_API_SECRET;
  process.env.INWORLD_WORKSPACE_ID = previousEnv.INWORLD_WORKSPACE_ID;
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  mockResponsesCreate.mockReset();
  globalThis.fetch = originalFetch;
});

describe('server abort and retry reliability', () => {
  it('aborts OpenAI upstream request on timeout', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const observedSignals: AbortSignal[] = [];
      mockResponsesCreate.mockImplementation((_: unknown, options?: { signal?: AbortSignal }) => (
        new Promise((_, reject) => {
          const signal = options?.signal;
          if (signal) {
            observedSignals.push(signal);
            if (signal.aborted) {
              reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
              return;
            }
            signal.addEventListener('abort', () => {
              reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
            }, { once: true });
          }
        })
      ));

      const req = {
        body: {
          kind: 'suggestPlotTwist',
          context: { genre: 'Noir' }
        }
      } as any;
      const res = createMockRes();

      await handleAiGenerate(req, res as any);

      expect(res.statusCode).toBe(504);
      expect((res.body as any)?.error?.code).toBe('UPSTREAM_TIMEOUT');
      expect(observedSignals.length).toBeGreaterThan(0);
      expect(observedSignals[0].aborted).toBe(true);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('aborts Inworld fetch on request cancellation', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const observedSignals: AbortSignal[] = [];
      globalThis.fetch = vi.fn((_: RequestInfo | URL, init?: RequestInit) => (
        new Promise((_, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          if (signal) {
            observedSignals.push(signal);
            if (signal.aborted) {
              reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
              return;
            }
            signal.addEventListener('abort', () => {
              reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
            }, { once: true });
          }
        })
      )) as typeof fetch;

      const req = createAbortableReq({
        kind: 'generateSpeech',
        context: {
          text: 'Hello world',
          voiceName: 'voice-1',
          expressive: false
        }
      });
      const res = createMockRes();
      const pending = handleAiGenerate(req, res as any);
      setTimeout(() => {
        req.emit('aborted');
      }, 1);

      await pending;

      expect(observedSignals.length).toBeGreaterThan(0);
      expect(observedSignals.some((signal) => signal.aborted)).toBe(true);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('retries transient 429 and then succeeds', async () => {
    const transient = Object.assign(new Error('rate limited'), { status: 429, code: 'RATE_LIMITED' });
    mockResponsesCreate
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce({ output_text: 'Twist.' });

    const req = {
      body: {
        kind: 'suggestPlotTwist',
        context: { genre: 'Noir' }
      }
    } as any;
    const res = createMockRes();

    await handleAiGenerate(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(mockResponsesCreate).toHaveBeenCalledTimes(2);
  });

  it('promotes one invalid surprise setup response from balanced to primary and then succeeds', async () => {
    mockResponsesCreate
      .mockResolvedValueOnce({ output_text: '{not valid json' })
      .mockResolvedValueOnce({
        output_text: JSON.stringify({
          genre: 'Noir',
          premise: 'A vanished magician is forced back for one impossible final con.',
          characters: ['Mara (Illusionist)', 'Denton (Fixer)', 'Lena (Reporter)']
        })
      });

    const req = {
      body: {
        kind: 'generateSurpriseSetup',
        context: {
          targetGenre: 'Noir'
        }
      }
    } as any;
    const res = createMockRes();

    await handleAiGenerate(req, res as any);

    expect(res.statusCode).toBe(200);
    expect(mockResponsesCreate).toHaveBeenCalledTimes(2);
    expect((mockResponsesCreate.mock.calls[0]?.[0] as { model?: string })?.model).toBe('gpt-5.4-mini-test-balanced');
    expect((mockResponsesCreate.mock.calls[1]?.[0] as { model?: string })?.model).toBe('gpt-5.4-test-primary');
  });

  it('promotes insert-block generation only once on invalid output and then returns INVALID_AI_RESPONSE', async () => {
    const invalidInsert = 'x'.repeat(5001);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockResponsesCreate
        .mockResolvedValueOnce({ output_text: invalidInsert })
        .mockResolvedValueOnce({ output_text: invalidInsert });

      const req = {
        body: {
          kind: 'generateScriptElement',
          context: {
            type: 'action',
            purpose: 'insertBlock',
            instruction: 'Set mood quickly.',
            styleContext: 'Genre: Noir. Premise: A detective unravels a conspiracy.',
            character: null
          }
        }
      } as any;
      const res = createMockRes();

      await handleAiGenerate(req, res as any);

      expect(res.statusCode).toBe(502);
      expect((res.body as any)?.error?.code).toBe('INVALID_AI_RESPONSE');
      expect(mockResponsesCreate).toHaveBeenCalledTimes(2);
      expect((mockResponsesCreate.mock.calls[0]?.[0] as { model?: string })?.model).toBe('gpt-5.4-mini-test-balanced');
      expect((mockResponsesCreate.mock.calls[1]?.[0] as { model?: string })?.model).toBe('gpt-5.4-test-primary');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('retries selected 5xx errors up to the cap and then fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const upstreamError = Object.assign(new Error('service unavailable'), { status: 503, code: 'UPSTREAM_ERROR' });
      mockResponsesCreate.mockRejectedValue(upstreamError);

      const req = {
        body: {
          kind: 'suggestPlotTwist',
          context: { genre: 'Noir' }
        }
      } as any;
      const res = createMockRes();

      await handleAiGenerate(req, res as any);

      expect(res.statusCode).toBe(502);
      expect((res.body as any)?.error?.code).toBe('UPSTREAM_ERROR');
      expect(mockResponsesCreate).toHaveBeenCalledTimes(3);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('does not retry non-transient 4xx errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const badRequest = Object.assign(new Error('bad request'), { status: 400, code: 'UPSTREAM_BAD_REQUEST' });
      mockResponsesCreate.mockRejectedValueOnce(badRequest);

      const req = {
        body: {
          kind: 'suggestPlotTwist',
          context: { genre: 'Noir' }
        }
      } as any;
      const res = createMockRes();

      await handleAiGenerate(req, res as any);

      expect(res.statusCode).toBe(502);
      expect((res.body as any)?.error?.code).toBe('UPSTREAM_ERROR');
      expect(mockResponsesCreate).toHaveBeenCalledTimes(1);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('halts retry loop when abort signal fires', async () => {
    const controller = new AbortController();
    let attempts = 0;

    await expect(runWithRetry(async ({ attempt }) => {
      attempts += 1;
      if (attempt === 0) {
        controller.abort();
      }
      throw Object.assign(new Error('retry me'), { status: 503 });
    }, {
      maxRetries: 5,
      baseDelayMs: 10,
      maxDelayMs: 10,
      jitterMs: 0,
      signal: controller.signal
    })).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });

    expect(attempts).toBe(1);
  });
});
