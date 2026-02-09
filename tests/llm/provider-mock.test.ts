import { describe, expect, it, vi } from 'vitest';

class MockProvider {
  name = 'mock';

  generateFn = vi.fn();

  async generateText(request: { messages: Array<{ role: string; content: string }> }) {
    return this.generateFn(request);
  }

  streamText(
    request: { requestId?: string },
    callbacks: {
      onToken: (token: string) => void;
      onComplete?: (response: {
        text: string;
        finishReason: string;
        requestId?: string;
        timing?: { startMs: number; endMs: number };
      }) => void;
    }
  ) {
    let aborted = false;

    const done = new Promise<{
      text: string;
      finishReason: string;
      requestId?: string;
      timing?: { startMs: number; endMs: number };
    }>((resolve) => {
      setTimeout(() => {
        if (!aborted) {
          callbacks.onToken('Hello ');
          callbacks.onToken('world!');
          const response = {
            text: 'Hello world!',
            finishReason: 'stop',
            timing: { startMs: Date.now(), endMs: Date.now() },
            requestId: request.requestId
          };
          callbacks.onComplete?.(response);
          resolve(response);
          return;
        }

        resolve({
          text: '',
          finishReason: 'cancelled',
          timing: { startMs: Date.now(), endMs: Date.now() }
        });
      }, 10);
    });

    return {
      abort: () => {
        aborted = true;
      },
      done
    };
  }
}

describe('MockProvider contract', () => {
  it('exposes expected provider shape', () => {
    const provider = new MockProvider();
    expect(provider.name).toBe('mock');
    expect(typeof provider.generateText).toBe('function');
    expect(typeof provider.streamText).toBe('function');
  });

  it('generateText delegates to internal mock', async () => {
    const provider = new MockProvider();
    provider.generateFn.mockResolvedValue({ text: 'ok', finishReason: 'stop' });

    const response = await provider.generateText({ messages: [{ role: 'user', content: 'hi' }] });

    expect(response.text).toBe('ok');
    expect(provider.generateFn).toHaveBeenCalledOnce();
  });

  it('streamText sends tokens then completes', async () => {
    const provider = new MockProvider();
    const tokens: string[] = [];
    let completed = false;

    const handle = provider.streamText(
      { requestId: 'abc' },
      {
        onToken: (token) => tokens.push(token),
        onComplete: () => {
          completed = true;
        }
      }
    );

    const response = await handle.done;

    expect(tokens).toEqual(['Hello ', 'world!']);
    expect(completed).toBe(true);
    expect(response.finishReason).toBe('stop');
  });

  it('streamText abort prevents token emission', async () => {
    const provider = new MockProvider();
    const tokens: string[] = [];

    const handle = provider.streamText(
      { requestId: 'abc' },
      {
        onToken: (token) => tokens.push(token)
      }
    );

    handle.abort();

    const response = await handle.done;
    expect(response.finishReason).toBe('cancelled');
    expect(tokens).toEqual([]);
  });
});
