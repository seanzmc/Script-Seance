/**
 * @typedef {Object} RetryPolicyOptions
 * @property {number} [maxRetries]
 * @property {number} [baseDelayMs]
 * @property {number} [maxDelayMs]
 * @property {number} [jitterMs]
 * @property {(error: unknown) => boolean} [isRetryableError]
 * @property {AbortSignal} [signal]
 */

/**
 * @typedef {Object} AbortableTimeoutOptions
 * @property {number} [timeoutMs]
 * @property {AbortSignal} [signal]
 * @property {string} [operationName]
 * @property {string} [timeoutMessage]
 */

/**
 * @typedef {Object} UpstreamExecutionContext
 * @property {AbortSignal} [signal]
 * @property {RetryPolicyOptions} [retryPolicy]
 * @property {number} [timeoutMs]
 */

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_CODES = new Set([
  'RATE_LIMITED',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENOTFOUND',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET'
]);

const asError = (input, fallbackMessage) => {
  if (input instanceof Error) return input;
  const message = typeof input?.message === 'string' ? input.message : fallbackMessage;
  return new Error(message);
};

const getErrorMeta = (error) => {
  if (!error || typeof error !== 'object') {
    return { code: undefined, status: undefined, message: undefined };
  }
  const record = /** @type {Record<string, unknown>} */ (error);
  const code = typeof record.code === 'string' || typeof record.code === 'number' ? record.code : undefined;
  const status = typeof record.status === 'number' ? record.status : undefined;
  const message = typeof record.message === 'string' ? record.message : undefined;
  return { code, status, message };
};

export const createRequestAbortedError = (message = 'Request canceled.') => {
  const error = new Error(message);
  error.code = 'REQUEST_ABORTED';
  error.status = 499;
  return error;
};

export const createUpstreamTimeoutError = (
  message = 'Upstream request timed out.',
  details = undefined
) => {
  const error = new Error(message);
  error.code = 'UPSTREAM_TIMEOUT';
  error.status = 504;
  if (details && typeof details === 'object') {
    error.details = details;
  }
  return error;
};

export const isAbortError = (error) => {
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  const { code, message } = getErrorMeta(error);
  return code === 'REQUEST_ABORTED' || message === 'Request canceled.';
};

const normalizeAbortReason = (reason, operationName) => {
  const fromReason = asError(reason, 'Request canceled.');
  if (isAbortError(fromReason)) {
    if (!fromReason.code) {
      fromReason.code = 'REQUEST_ABORTED';
    }
    if (!fromReason.status) {
      fromReason.status = 499;
    }
    return fromReason;
  }
  if (fromReason.code === 'UPSTREAM_TIMEOUT') {
    return fromReason;
  }
  const timeoutByName = fromReason instanceof DOMException && fromReason.name === 'TimeoutError';
  if (timeoutByName) {
    return createUpstreamTimeoutError('Upstream request timed out.', {
      operationName
    });
  }
  return createRequestAbortedError(fromReason.message || 'Request canceled.');
};

const wait = async (delayMs, signal) => {
  if (!delayMs || delayMs <= 0) {
    return;
  }
  await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve(undefined);
    }, delayMs);

    const onAbort = () => {
      cleanup();
      reject(normalizeAbortReason(signal?.reason, 'retry-wait'));
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    };

    if (!signal) {
      return;
    }

    if (signal.aborted) {
      cleanup();
      reject(normalizeAbortReason(signal.reason, 'retry-wait'));
      return;
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
};

export const isRetryableUpstreamError = (error) => {
  if (isAbortError(error)) {
    return false;
  }

  const { code, status, message } = getErrorMeta(error);
  if (typeof status === 'number') {
    if (status >= 400 && status < 500 && status !== 429) {
      return false;
    }
    if (RETRYABLE_STATUSES.has(status)) {
      return true;
    }
  }

  if (typeof code === 'string' || typeof code === 'number') {
    const normalizedCode = String(code).toUpperCase();
    if (RETRYABLE_CODES.has(normalizedCode)) {
      return true;
    }
  }

  const normalizedMessage = typeof message === 'string' ? message.toLowerCase() : '';
  return (
    normalizedMessage.includes('network') ||
    normalizedMessage.includes('fetch failed') ||
    normalizedMessage.includes('socket') ||
    normalizedMessage.includes('connection reset') ||
    normalizedMessage.includes('timed out') ||
    normalizedMessage.includes('resource_exhausted') ||
    normalizedMessage.includes('rate limit')
  );
};

/**
 * @template T
 * @param {(signal: AbortSignal) => Promise<T>} run
 * @param {AbortableTimeoutOptions} [options]
 * @returns {Promise<T>}
 */
export const runWithAbortableTimeout = async (run, options = {}) => {
  const {
    timeoutMs = 0,
    signal,
    operationName = 'upstream-operation',
    timeoutMessage = 'Upstream request timed out.'
  } = options;

  const controller = new AbortController();
  let timeoutId;

  const onParentAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort(signal?.reason ?? createRequestAbortedError());
    }
  };

  if (signal) {
    if (signal.aborted) {
      onParentAbort();
    } else {
      signal.addEventListener('abort', onParentAbort, { once: true });
    }
  }

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      if (!controller.signal.aborted) {
        controller.abort(createUpstreamTimeoutError(timeoutMessage, {
          operationName,
          timeoutMs
        }));
      }
    }, timeoutMs);
  }

  try {
    if (controller.signal.aborted) {
      throw normalizeAbortReason(controller.signal.reason, operationName);
    }
    return await run(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw normalizeAbortReason(controller.signal.reason, operationName);
    }
    if (isAbortError(error)) {
      throw normalizeAbortReason(error, operationName);
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (signal) {
      signal.removeEventListener('abort', onParentAbort);
    }
  }
};

/**
 * @template T
 * @param {(ctx: { attempt: number; signal?: AbortSignal }) => Promise<T>} run
 * @param {RetryPolicyOptions} [options]
 * @returns {Promise<T>}
 */
export const runWithRetry = async (run, options = {}) => {
  const {
    maxRetries = 2,
    baseDelayMs = 250,
    maxDelayMs = 4000,
    jitterMs = 150,
    isRetryableError = isRetryableUpstreamError,
    signal
  } = options;

  let attempt = 0;

  while (true) {
    if (signal?.aborted) {
      throw normalizeAbortReason(signal.reason, 'retry-loop');
    }

    try {
      return await run({ attempt, signal });
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        throw normalizeAbortReason(signal?.reason ?? error, 'retry-loop');
      }

      const shouldRetry = attempt < maxRetries && isRetryableError(error);
      if (!shouldRetry) {
        throw error;
      }

      const baseDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
      const jitter = jitterMs > 0 ? Math.floor(Math.random() * (jitterMs + 1)) : 0;
      const delayMs = Math.min(maxDelayMs, baseDelay + jitter);
      attempt += 1;
      await wait(delayMs, signal);
    }
  }
};
