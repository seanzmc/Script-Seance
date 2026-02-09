import { describe, expect, it } from 'vitest';

interface StreamEvent {
  type: 'token' | 'done' | 'error';
  content?: string;
  message?: string;
}

const parseSSE = (chunk: string): StreamEvent[] => {
  const out: StreamEvent[] = [];
  for (const line of chunk.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data: ')) continue;

    const payload = trimmed.slice(6);
    if (!payload || payload === '[DONE]') continue;

    try {
      out.push(JSON.parse(payload));
    } catch {
      // Ignore malformed lines.
    }
  }
  return out;
};

describe('SSE parser', () => {
  it('parses a single token event', () => {
    const parsed = parseSSE('data: {"type":"token","content":"Hello"}\n\n');
    expect(parsed).toEqual([{ type: 'token', content: 'Hello' }]);
  });

  it('parses multiple events in one chunk', () => {
    const chunk = [
      'data: {"type":"token","content":"A"}',
      '',
      'data: {"type":"token","content":"B"}',
      '',
      'data: {"type":"done"}'
    ].join('\n');

    expect(parseSSE(chunk)).toHaveLength(3);
  });

  it('skips malformed lines', () => {
    const chunk = [
      'data: {"type":"token","content":"ok"}',
      'data: {broken',
      ':comment',
      'data: {"type":"done"}'
    ].join('\n');

    const parsed = parseSSE(chunk);
    expect(parsed).toHaveLength(2);
  });

  it('parses error events', () => {
    const parsed = parseSSE('data: {"type":"error","message":"Rate limit"}\n');
    expect(parsed).toEqual([{ type: 'error', message: 'Rate limit' }]);
  });

  it('ignores DONE sentinel', () => {
    expect(parseSSE('data: [DONE]\n')).toEqual([]);
  });
});
