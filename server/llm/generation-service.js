import { randomUUID } from 'node:crypto';
import { buildPrompt } from './prompts/builder.js';
import { hashPrompt } from './instrumentation.js';

export class GenerationService {
  constructor(provider, config, instrumentation) {
    this.provider = provider;
    this.config = config;
    this.instrumentation = instrumentation;
    this.active = null;
  }

  setProvider(provider) {
    this.provider = provider;
  }

  cancel() {
    this.active?.abort();
    this.active = null;
  }

  async generate(input) {
    this.guardConcurrency();

    const requestId = randomUUID().slice(0, 8);
    const { request, promptText } = this.prepare(input, requestId);
    const start = Date.now();

    try {
      const response = await this.provider.generateText(request);
      this.recordOk(requestId, input, start, promptText, response);
      return response;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.recordErr(requestId, input, start, promptText, normalized);
      throw normalized;
    }
  }

  stream(input, callbacks) {
    this.guardConcurrency();

    const requestId = randomUUID().slice(0, 8);
    const { request, promptText } = this.prepare(input, requestId);
    const start = Date.now();

    const wrappedCallbacks = {
      onToken: callbacks.onToken,
      onComplete: (response) => {
        this.active = null;
        this.recordOk(requestId, input, start, promptText, response);
        callbacks.onComplete?.(response);
      },
      onError: (error) => {
        this.active = null;
        this.recordErr(requestId, input, start, promptText, error);
        callbacks.onError?.(error);
      }
    };

    const handle = this.provider.streamText(request, wrappedCallbacks);
    this.active = handle;

    return {
      abort: () => {
        handle.abort();
        this.active = null;
      },
      done: handle.done
    };
  }

  guardConcurrency() {
    if (this.active) {
      throw new Error('Generation already in progress. Cancel it first.');
    }
  }

  prepare(input, requestId) {
    const packed = buildPrompt(
      {
        action: input.action,
        scriptState: input.scriptState,
        blocks: input.blocks,
        callbackNotes: input.callbackNotes
      },
      this.config
    );

    const promptText = packed.messages.map((message) => message.content).join('');

    const safety = this.instrumentation.checkPromptSafety(
      promptText.length,
      packed.metadata.totalEstimatedTokens
    );
    if (!safety.safe) {
      throw new Error(`Prompt safety: ${safety.reason}`);
    }

    if (this.instrumentation.checkDedupe(hashPrompt(promptText))) {
      throw new Error('Duplicate request within dedupe window.');
    }

    const request = {
      messages: packed.messages,
      maxTokens: this.config.generation.maxOutputTokens,
      requestId
    };

    return { request, promptText, packed };
  }

  recordOk(id, input, start, promptText, response) {
    this.instrumentation.record({
      requestId: id,
      provider: this.provider.name,
      action: input.action.type,
      startTime: start,
      endTime: Date.now(),
      ttftMs: response.timing?.ttftMs ? response.timing.ttftMs - start : undefined,
      durationMs: Date.now() - start,
      promptTokens: response.usage?.promptTokens,
      completionTokens: response.usage?.completionTokens,
      totalTokens: response.usage?.totalTokens,
      promptChars: promptText.length,
      responseChars: response.text.length,
      finishReason: response.finishReason
    });
  }

  recordErr(id, input, start, promptText, error) {
    this.instrumentation.record({
      requestId: id,
      provider: this.provider.name,
      action: input.action.type,
      startTime: start,
      endTime: Date.now(),
      durationMs: Date.now() - start,
      promptChars: promptText.length,
      finishReason: 'error',
      error: error.message
    });
  }
}
