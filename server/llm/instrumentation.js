export class InstrumentationService {
  constructor(opts) {
    this.log = [];
    this.recentHashes = new Map();
    this.onMetrics = opts.onMetrics;

    this.dedupeWindowMs = opts.dedupeWindowMs;
    this.maxPromptChars = opts.maxPromptChars;
    this.spikeThreshold = opts.tokenSpikeThreshold;
    this.maxInputTokens = opts.maxInputTokens;
  }

  checkDedupe(promptHash) {
    const now = Date.now();
    for (const [hash, ts] of this.recentHashes.entries()) {
      if (now - ts > this.dedupeWindowMs) {
        this.recentHashes.delete(hash);
      }
    }

    if (this.recentHashes.has(promptHash)) {
      return true;
    }

    this.recentHashes.set(promptHash, now);
    return false;
  }

  checkPromptSafety(promptChars, estimatedTokens) {
    if (promptChars > this.maxPromptChars) {
      return {
        safe: false,
        reason: `Prompt chars ${promptChars} > limit ${this.maxPromptChars}`
      };
    }

    const ceiling = this.maxInputTokens * this.spikeThreshold;
    if (estimatedTokens > ceiling) {
      return {
        safe: false,
        reason: `Estimated tokens ${estimatedTokens} > spike ceiling ${ceiling}`
      };
    }

    return { safe: true };
  }

  record(metric) {
    this.log.push(metric);
    this.onMetrics?.(metric);

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[LLM] ${metric.requestId} | ${metric.provider} | ${metric.action} | ` +
          `${metric.durationMs ?? 0}ms | TTFT ${metric.ttftMs ?? '-'}ms | ` +
          `${metric.promptTokens ?? '?'}->${metric.completionTokens ?? '?'} tok | ` +
          `${metric.finishReason}${metric.error ? ` ERR: ${metric.error}` : ''}`
      );
    }

    if (this.log.length > 200) {
      this.log = this.log.slice(-100);
    }
  }

  getRecentMetrics(limit = 20) {
    return this.log.slice(-limit);
  }
}

export function hashPrompt(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}
