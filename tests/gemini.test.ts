import { describe, it, expect, vi, afterEach } from 'vitest';
import { BlockType } from '../types';
import { createGenerateSpeechRequest, createSuggestPlotTwistRequest, generateScriptElement } from '../services/ai';

type MockResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

const createMockResponse = (status: number, body: unknown): MockResponse => ({
  ok: status >= 200 && status < 300,
  status,
  text: vi.fn().mockResolvedValue(JSON.stringify(body))
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('AI API wrapper', () => {
  it('surfaces API error responses with a friendly status message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse(429, {
        error: {
          message: 'Too many requests',
          code: 'RATE_LIMITED'
        }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateScriptElement(BlockType.ACTION, undefined, 'Make a noise', 'Noir')
    ).rejects.toMatchObject({
      message: 'Rate limit exceeded. Please wait and try again.',
      status: 429,
      code: 'RATE_LIMITED'
    });
  });

  it('rejects with a timeout error when a request exceeds its timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, options?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = options?.signal;
        if (signal?.aborted) {
          const error = new Error('Aborted');
          (error as any).name = 'AbortError';
          reject(error);
          return;
        }
        signal?.addEventListener('abort', () => {
          const error = new Error('Aborted');
          (error as any).name = 'AbortError';
          reject(error);
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const request = createSuggestPlotTwistRequest('mystery', { timeoutMs: 10 });
    const expectation = expect(request.promise).rejects.toMatchObject({
      message: 'Request timed out.',
      code: 'REQUEST_TIMEOUT'
    });

    await vi.advanceTimersByTimeAsync(10);
    await expectation;
  });

  it('decodes URL-safe base64 audio payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse(200, {
        data: {
          audioBase64: '-_8='
        }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = createGenerateSpeechRequest('hello', 'Alex');
    const buffer = await request.promise;
    expect(Array.from(new Uint8Array(buffer))).toEqual([251, 255]);
  });
});
