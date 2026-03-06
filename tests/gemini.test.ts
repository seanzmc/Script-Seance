import { describe, it, expect, vi, afterEach } from 'vitest';
import { BlockType } from '../types';
import { createBlock } from '../domain/blocks';
import {
  createGenerateSpeechRequest,
  executeGenerateScriptElement,
  executeRewriteBlock,
  executeGenerateSurpriseSetup,
  executeSuggestPlotTwist,
  generateScriptElement
} from '../services/ai';

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

    const promise = executeSuggestPlotTwist('mystery', { timeoutMs: 10 });
    const expectation = expect(promise).rejects.toMatchObject({
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

  it('does not retry generateSpeech HTTP requests on 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse(429, {
        error: {
          message: 'Too many requests',
          code: 'RATE_LIMITED'
        }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = createGenerateSpeechRequest('hello', 'Alex');
    await expect(request.promise).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED'
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('includes prompt trace metadata only when prompt debug flag is enabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse(200, {
        data: {
          text: 'Twist!'
        }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const debugWindow = window as Window & {
      __SS_DEBUG_PROMPTS__?: boolean;
      __SS_PROMPT_CONTEXT_REVISION__?: number;
      __SS_STYLE_FINGERPRINT__?: string;
    };
    debugWindow.__SS_DEBUG_PROMPTS__ = true;
    debugWindow.__SS_PROMPT_CONTEXT_REVISION__ = 17;
    debugWindow.__SS_STYLE_FINGERPRINT__ = 'abc123ff';

    await executeSuggestPlotTwist('Noir');

    const requestWithTrace = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || '{}'));
    expect(requestWithTrace.promptTrace).toEqual({
      enabled: true,
      promptContextRevision: 17,
      styleFingerprint: 'abc123ff'
    });
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>)?.['X-SS-Debug-Prompts']).toBe('1');

    fetchMock.mockClear();
    debugWindow.__SS_DEBUG_PROMPTS__ = false;
    delete debugWindow.__SS_PROMPT_CONTEXT_REVISION__;
    delete debugWindow.__SS_STYLE_FINGERPRINT__;

    await executeSuggestPlotTwist('Noir');

    const requestWithoutTrace = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || '{}'));
    expect(requestWithoutTrace.promptTrace).toBeUndefined();
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>)?.['X-SS-Debug-Prompts']).toBeUndefined();
  });

  it('sends canonical style metadata for twist, insert, and rewrite requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse(200, {
        data: {
          text: 'Styled response.'
        }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await executeSuggestPlotTwist('Noir', {
      styleId: 'noir-1940s-detective',
      styleName: '1940s Noir Detective',
      style: 'Client fallback label'
    });
    await executeGenerateScriptElement(
      BlockType.ACTION,
      undefined,
      'Set mood quickly.',
      'Genre: Noir.\nPremise: A detective unravels a conspiracy.',
      {
        styleId: 'noir-1940s-detective',
        styleName: '1940s Noir Detective',
        style: 'Client fallback label'
      }
    );
    await executeRewriteBlock(
      createBlock({ type: BlockType.ACTION, text: 'He stares at the board.' }),
      'Noir',
      'A detective unravels a conspiracy.',
      {
        styleId: 'noir-1940s-detective',
        styleName: '1940s Noir Detective',
        style: 'Client fallback label'
      },
      'Make it sharper.'
    );

    const twistRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || '{}'));
    expect(twistRequest.context).toMatchObject({
      genre: 'Noir',
      styleId: 'noir-1940s-detective',
      styleName: '1940s Noir Detective',
      style: 'Client fallback label'
    });

    const insertRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body || '{}'));
    expect(insertRequest.context).toMatchObject({
      type: 'action',
      styleContext: 'Genre: Noir.\nPremise: A detective unravels a conspiracy.',
      styleId: 'noir-1940s-detective',
      styleName: '1940s Noir Detective',
      style: 'Client fallback label'
    });

    const rewriteRequest = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body || '{}'));
    expect(rewriteRequest.context).toMatchObject({
      genre: 'Noir',
      premise: 'A detective unravels a conspiracy.',
      styleId: 'noir-1940s-detective',
      styleName: '1940s Noir Detective',
      style: 'Client fallback label',
      rewriteGuidance: 'Make it sharper.'
    });
  });

  it('sends surprise setup style contract with styleId/styleName only', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createMockResponse(200, {
        data: {
          genre: 'Noir',
          premise: 'A detective takes one last impossible case.',
          characters: ['Mara (Detective)', 'Vale (Fixer)', 'Iris (Witness)']
        }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await executeGenerateSurpriseSetup({
      targetGenre: 'Noir',
      styleId: 'noir-1940s-detective',
      styleName: '1940s Noir Detective'
    });

    const requestPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || '{}'));
    expect(requestPayload.kind).toBe('generateSurpriseSetup');
    expect(requestPayload.context).toMatchObject({
      targetGenre: 'Noir',
      styleId: 'noir-1940s-detective',
      styleName: '1940s Noir Detective'
    });
    expect(requestPayload.context.styleDescription).toBeUndefined();
  });
});
