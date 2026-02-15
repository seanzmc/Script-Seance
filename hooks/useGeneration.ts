import { useCallback, useRef, useState } from 'react';
import type { GenerateInput } from '../services/llmSceneAdapter';

interface StreamEvent {
  type: 'token' | 'done' | 'error';
  content?: string;
  text?: string;
  message?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  timing?: {
    startMs?: number;
    ttftMs?: number;
    endMs?: number;
  };
  finishReason?: string;
}

export interface GenerationHookState {
  isGenerating: boolean;
  streamedText: string;
  error: string | null;
  providerName: string | null;
  timing: {
    startMs?: number;
    ttftMs?: number;
    endMs?: number;
    durationMs?: number;
  } | null;
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  } | null;
}

const API = '/api/llm';

const initialState: GenerationHookState = {
  isGenerating: false,
  streamedText: '',
  error: null,
  providerName: null,
  timing: null,
  usage: null
};

const parseSSELine = (line: string): StreamEvent | null => {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data: ')) return null;

  const payload = trimmed.slice(6);
  if (!payload || payload === '[DONE]') return null;

  try {
    return JSON.parse(payload) as StreamEvent;
  } catch {
    return null;
  }
};

export function useGeneration() {
  const [state, setState] = useState<GenerationHookState>(initialState);
  const controllerRef = useRef<AbortController | null>(null);

  const streamGenerate = useCallback(
    async (input: GenerateInput, onToken?: (fullTextSoFar: string) => void): Promise<string> => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      setState((current) => ({
        ...current,
        isGenerating: true,
        streamedText: '',
        error: null,
        usage: null,
        timing: { startMs: Date.now() }
      }));

      let accumulated = '';

      try {
        const res = await fetch(`${API}/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(input),
          signal: controller.signal
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error('Streaming response body was empty.');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const event = parseSSELine(line);
            if (!event) continue;

            if (event.type === 'token' && event.content) {
              accumulated += event.content;
              setState((current) => ({ ...current, streamedText: accumulated }));
              onToken?.(accumulated);
              continue;
            }

            if (event.type === 'done') {
              if (!accumulated && typeof event.text === 'string') {
                accumulated = event.text;
                setState((current) => ({ ...current, streamedText: accumulated }));
                onToken?.(accumulated);
              }
              setState((current) => ({
                ...current,
                isGenerating: false,
                timing: event.timing
                  ? {
                      startMs: event.timing.startMs,
                      ttftMs: event.timing.ttftMs,
                      endMs: event.timing.endMs,
                      durationMs:
                        typeof event.timing.startMs === 'number' && typeof event.timing.endMs === 'number'
                          ? event.timing.endMs - event.timing.startMs
                          : undefined
                    }
                  : current.timing,
                usage: event.usage ?? null
              }));
              continue;
            }

            if (event.type === 'error') {
              throw new Error(event.message ?? 'Generation failed');
            }
          }
        }

        return accumulated;
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          setState((current) => ({ ...current, isGenerating: false }));
          return accumulated;
        }

        const normalized = error instanceof Error ? error : new Error(String(error));
        setState((current) => ({ ...current, isGenerating: false, error: normalized.message }));
        throw normalized;
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
      }
    },
    []
  );

  const cancel = useCallback(async () => {
    controllerRef.current?.abort();
    controllerRef.current = null;

    fetch(`${API}/cancel`, {
      method: 'POST',
      credentials: 'include'
    }).catch(() => {
      // Best effort cancellation.
    });

    setState((current) => ({ ...current, isGenerating: false }));
  }, []);

  const toggleProvider = useCallback(async (provider: 'local' | 'gemini') => {
    const res = await fetch(`${API}/toggle-provider`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ provider })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    }

    const data = (await res.json()) as { provider: string };
    setState((current) => ({ ...current, providerName: data.provider }));
    return data.provider;
  }, []);

  return {
    ...state,
    streamGenerate,
    cancel,
    toggleProvider
  };
}
