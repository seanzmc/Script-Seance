import { estimateTokens } from '../memory/tokenizer.js';

export class LocalOpenSourceProvider {
  constructor(config) {
    this.name = 'local-llama-cpp';
    this.baseUrl = config.local.baseUrl.replace(/\/+$/, '');
    this.model = config.local.model;
    this.defaults = {
      temperature: config.local.temperature,
      topP: config.local.topP,
      maxTokens: config.local.maxTokens
    };
  }

  async generateText(request) {
    const startMs = Date.now();
    const body = this.buildBody(request, false);

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Local LLM ${res.status}: ${detail}`);
    }

    const json = await res.json();
    const endMs = Date.now();
    const text = json?.choices?.[0]?.message?.content ?? '';

    return {
      text,
      finishReason: toFinish(json?.choices?.[0]?.finish_reason),
      usage: json?.usage
        ? {
            promptTokens: json.usage.prompt_tokens ?? 0,
            completionTokens: json.usage.completion_tokens ?? 0,
            totalTokens: json.usage.total_tokens ?? 0
          }
        : {
            promptTokens: estimateTokens(request.messages.map((m) => m.content).join('')),
            completionTokens: estimateTokens(text),
            totalTokens: estimateTokens(request.messages.map((m) => m.content).join('')) + estimateTokens(text)
          },
      timing: { startMs, endMs },
      requestId: request.requestId
    };
  }

  streamText(request, callbacks) {
    const controller = new AbortController();
    const startMs = Date.now();
    let ttftMs;
    let fullText = '';
    let finishReason = 'stop';

    const done = (async () => {
      try {
        const body = this.buildBody(request, true);

        const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`Local LLM stream ${res.status}: ${detail}`);
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error('Local LLM stream missing response body.');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done: eof, value } = await reader.read();
          if (eof) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) {
              continue;
            }

            const payload = trimmed.slice(6);
            if (payload === '[DONE]') {
              continue;
            }

            try {
              const chunk = JSON.parse(payload);
              const token = chunk?.choices?.[0]?.delta?.content;
              if (token) {
                if (ttftMs === undefined) {
                  ttftMs = Date.now();
                }
                fullText += token;
                callbacks.onToken(token);
              }
              const reason = chunk?.choices?.[0]?.finish_reason;
              if (reason) {
                finishReason = toFinish(reason);
              }
            } catch {
              // Ignore malformed stream lines.
            }
          }
        }

        const endMs = Date.now();
        const response = {
          text: fullText,
          finishReason,
          usage: {
            promptTokens: estimateTokens(request.messages.map((m) => m.content).join('')),
            completionTokens: estimateTokens(fullText),
            totalTokens: estimateTokens(request.messages.map((m) => m.content).join('')) + estimateTokens(fullText)
          },
          timing: { startMs, ttftMs, endMs },
          requestId: request.requestId
        };

        callbacks.onComplete?.(response);
        return response;
      } catch (error) {
        if (error?.name === 'AbortError') {
          const response = {
            text: fullText,
            finishReason: 'cancelled',
            timing: { startMs, ttftMs, endMs: Date.now() },
            requestId: request.requestId
          };
          callbacks.onComplete?.(response);
          return response;
        }

        const normalized = error instanceof Error ? error : new Error(String(error));
        callbacks.onError?.(normalized);
        throw normalized;
      }
    })();

    return {
      abort: () => controller.abort(),
      done
    };
  }

  estimateTokens(text) {
    return estimateTokens(text);
  }

  buildBody(request, stream) {
    return {
      model: this.model,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content
      })),
      max_tokens: request.maxTokens ?? this.defaults.maxTokens,
      temperature: request.temperature ?? this.defaults.temperature,
      top_p: request.topP ?? this.defaults.topP,
      stream,
      ...(request.stop?.length ? { stop: request.stop } : {})
    };
  }
}

function toFinish(raw) {
  if (raw === 'length') return 'length';
  return 'stop';
}
