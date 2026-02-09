import { GoogleGenAI } from '@google/genai';
import { estimateTokens } from '../memory/tokenizer.js';

export class GeminiProvider {
  constructor(config) {
    if (!config.gemini.apiKey) {
      throw new Error('GEMINI_API_KEY is required for GeminiProvider');
    }

    this.name = 'gemini';
    this.client = new GoogleGenAI({ apiKey: config.gemini.apiKey });
    this.model = config.gemini.model;
    this.defaults = {
      temperature: config.gemini.temperature,
      topP: config.gemini.topP,
      maxTokens: config.gemini.maxTokens
    };
  }

  async generateText(request) {
    const startMs = Date.now();
    const { systemInstruction, contents } = this.toGeminiFormat(request);

    const result = await this.client.models.generateContent({
      model: this.model,
      contents,
      config: {
        systemInstruction,
        temperature: request.temperature ?? this.defaults.temperature,
        topP: request.topP ?? this.defaults.topP,
        maxOutputTokens: request.maxTokens ?? this.defaults.maxTokens,
        ...(request.stop?.length ? { stopSequences: request.stop } : {})
      }
    });

    const endMs = Date.now();
    const text = result.text ?? '';

    return {
      text,
      finishReason: 'stop',
      usage: result.usageMetadata
        ? {
            promptTokens: result.usageMetadata.promptTokenCount ?? 0,
            completionTokens: result.usageMetadata.candidatesTokenCount ?? 0,
            totalTokens: result.usageMetadata.totalTokenCount ?? 0
          }
        : undefined,
      timing: { startMs, endMs },
      requestId: request.requestId
    };
  }

  streamText(request, callbacks) {
    const controller = new AbortController();
    const startMs = Date.now();
    let ttftMs;
    let fullText = '';

    const done = (async () => {
      try {
        const { systemInstruction, contents } = this.toGeminiFormat(request);

        const streamResult = await this.client.models.generateContentStream({
          model: this.model,
          contents,
          config: {
            systemInstruction,
            temperature: request.temperature ?? this.defaults.temperature,
            topP: request.topP ?? this.defaults.topP,
            maxOutputTokens: request.maxTokens ?? this.defaults.maxTokens,
            ...(request.stop?.length ? { stopSequences: request.stop } : {})
          }
        });

        const iterable = streamResult?.stream ?? streamResult;

        for await (const chunk of iterable) {
          if (controller.signal.aborted) {
            break;
          }
          const token = chunk?.text ?? '';
          if (token) {
            if (ttftMs === undefined) {
              ttftMs = Date.now();
            }
            fullText += token;
            callbacks.onToken(token);
          }
        }

        const endMs = Date.now();
        const response = {
          text: fullText,
          finishReason: controller.signal.aborted ? 'cancelled' : 'stop',
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
        if (controller.signal.aborted) {
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

  toGeminiFormat(request) {
    const systemInstruction = request.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n');

    const contents = request.messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }]
      }));

    return { systemInstruction, contents };
  }
}
