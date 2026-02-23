import { Scene, StoryContext, BlockType, ScriptBlock, TtsVoice } from '../types';

type ApiError = {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
};

type ApiResponse<T> =
  | { data: T; error?: never }
  | { data?: never; error: ApiError };

const getErrorName = (error: unknown): string | undefined => {
  if (error instanceof Error) {
    return error.name;
  }
  if (typeof error === 'object' && error !== null) {
    const name = (error as Record<string, unknown>).name;
    return typeof name === 'string' ? name : undefined;
  }
  return undefined;
};

const getErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const code = (error as Record<string, unknown>).code;
  return typeof code === 'string' ? code : undefined;
};

export type AiExecuteOptions = {
  signal?: AbortSignal;
};

export type RequestOptions = AiExecuteOptions & {
  timeoutMs?: number;
  opType?: string;
  scopeKey?: string;
};

export type CancellableRequest<T> = {
  promise: Promise<T>;
  cancel: () => void;
};

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_SCENE_TIMEOUT_MS = 95000;
const DEFAULT_VOICE_NAME = '';

type DebugWindow = Window & {
  __SS_DEBUG_AI_ABORTS__?: boolean;
};

const isAbortDebugEnabled = () =>
  typeof window !== 'undefined' &&
  Boolean((window as DebugWindow).__SS_DEBUG_AI_ABORTS__);

const debugAbortLog = (event: string, details: Record<string, unknown>) => {
  if (!isAbortDebugEnabled()) {
    return;
  }
  console.info(`[ai:${event}]`, details);
};

type GenerateSpeechContext = {
  text: string;
  voiceName: string;
  [key: string]: unknown;
};

export type GenerateSpeechExtraContext = {
  expressive?: boolean;
  [key: string]: unknown;
};

type TtsQueueItem<T> = {
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  cancelled: boolean;
  inFlightCancel?: (() => void) | null;
};

const ttsQueue: Array<TtsQueueItem<unknown>> = [];
let ttsActive = false;

const createAbortError = () => {
  const abortError = new Error('Request canceled.') as Error & { code?: string };
  abortError.code = 'REQUEST_ABORTED';
  return abortError;
};

const drainTtsQueue = () => {
  if (ttsActive) return;
  const next = ttsQueue.shift() as TtsQueueItem<unknown> | undefined;
  if (!next) return;
  if (next.cancelled) {
    next.reject(createAbortError());
    drainTtsQueue();
    return;
  }
  ttsActive = true;
  next.run()
    .then(next.resolve)
    .catch(next.reject)
    .finally(() => {
      ttsActive = false;
      drainTtsQueue();
    });
};

const enqueueTts = <T>(run: (item: TtsQueueItem<T>) => Promise<T>): CancellableRequest<T> => {
  let item!: TtsQueueItem<T>;
  const promise = new Promise<T>((resolve, reject) => {
    item = {
      run: () => run(item),
      resolve,
      reject,
      cancelled: false,
      inFlightCancel: null
    };
    ttsQueue.push(item as unknown as TtsQueueItem<unknown>);
    drainTtsQueue();
  });

  const cancel = () => {
    if (!item || item.cancelled) return;
    item.cancelled = true;
    if (item.inFlightCancel) {
      item.inFlightCancel();
    }
    const index = ttsQueue.indexOf(item as unknown as TtsQueueItem<unknown>);
    if (index >= 0) {
      ttsQueue.splice(index, 1);
      item.reject(createAbortError());
    }
  };

  return { promise, cancel };
};

const normalizeBase64Audio = (value: string) => {
  const withoutDataUrl = value.replace(/^data:[^;]+;base64,/i, '');
  const compact = withoutDataUrl.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!compact) return '';
  const remainder = compact.length % 4;
  if (remainder === 0) return compact;
  return `${compact}${'='.repeat(4 - remainder)}`;
};

const decodeAudioBase64 = (value: string): ArrayBuffer => {
  const normalized = normalizeBase64Audio(value);
  if (!normalized) {
    throw new Error('No audio data returned');
  }
  try {
    const binaryString = atob(normalized);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch {
    const error = new Error('Audio payload was not valid base64.') as Error & {
      code?: string;
      details?: Record<string, unknown>;
    };
    error.code = 'INVALID_AUDIO_BASE64';
    error.details = {
      length: normalized.length,
      preview: normalized.slice(0, 48)
    };
    throw error;
  }
};

const createAiRequest = <T>(
  kind: string,
  context: unknown,
  options: RequestOptions = {}
): CancellableRequest<T> => {
  const controller = new AbortController();
  const kindDefaultTimeout = kind === 'generateScene' ? DEFAULT_SCENE_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
  const timeoutMs = options.timeoutMs ?? kindDefaultTimeout;
  let abortReason: 'cancel' | 'timeout' | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      abortReason = 'timeout';
      controller.abort();
    }, timeoutMs);
  }

  const upstreamSignal = options.signal;
  let upstreamAbortHandler: (() => void) | null = null;
  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      abortReason = 'cancel';
      controller.abort(upstreamSignal.reason);
    } else {
      upstreamAbortHandler = () => {
        abortReason = 'cancel';
        controller.abort(upstreamSignal.reason);
      };
      upstreamSignal.addEventListener('abort', upstreamAbortHandler, { once: true });
    }
  }

  const cancel = () => {
    if (!controller.signal.aborted) {
      debugAbortLog('cancel', {
        kind,
        opType: options.opType,
        scopeKey: options.scopeKey
      });
      abortReason = 'cancel';
      controller.abort();
    }
  };

  const promise = (async () => {
    const response = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: controller.signal,
      body: JSON.stringify({ kind, context })
    });

    const text = await response.text();
    if (!text) {
      throw new Error('Empty response from server');
    }

    let payload: ApiResponse<T>;
    try {
      payload = JSON.parse(text) as ApiResponse<T>;
    } catch {
      throw new Error('Invalid JSON response from server');
    }

    if (!response.ok || payload.error) {
      const apiError = payload.error;
      const statusMessage =
        response.status === 401
          ? 'Authentication required. Please log in to continue.'
          : response.status === 429
          ? 'Rate limit exceeded. Please wait and try again.'
          : null;
      const message = statusMessage || apiError?.message || 'AI request failed';
      const error = new Error(message) as Error & {
        code?: string;
        status?: number;
        details?: Record<string, unknown>;
      };
      if (apiError?.code) {
        error.code = apiError.code;
      }
      error.status = response.status;
      if (apiError?.details) {
        error.details = apiError.details;
      }
      const retryAfterHeader = response.headers?.get?.('Retry-After');
      if (retryAfterHeader) {
        const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10);
        if (Number.isFinite(retryAfterSeconds)) {
          error.details = { ...(error.details ?? {}), retryAfterSeconds };
        }
      }
      throw error;
    }

    return payload.data as T;
  })();

  const wrappedPromise = promise.catch((error: unknown) => {
    const errorName = getErrorName(error);
    const errorCode = getErrorCode(error);
    if (errorName === 'AbortError' || errorCode === 'REQUEST_ABORTED') {
      debugAbortLog('fetch-reject', {
        kind,
        opType: options.opType,
        scopeKey: options.scopeKey,
        errorName,
        errorCode,
        abortReason
      });
    }
    if (errorName === 'AbortError') {
      const message =
        abortReason === 'timeout' ? 'Request timed out.' : 'Request canceled.';
      const abortError = new Error(message) as Error & { code?: string };
      abortError.code =
        abortReason === 'timeout' ? 'REQUEST_TIMEOUT' : 'REQUEST_ABORTED';
      throw abortError;
    }
    throw error;
  }).finally(() => {
    if (upstreamSignal && upstreamAbortHandler) {
      upstreamSignal.removeEventListener('abort', upstreamAbortHandler);
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });

  return { promise: wrappedPromise, cancel };
};

const requestAi = async <T>(
  kind: string,
  context: unknown,
  options?: RequestOptions
): Promise<T> => {
  const { promise } = createAiRequest<T>(kind, context, options);
  return promise;
};

type SceneGenerationData = {
  heading: string;
  summary: string;
  blocks: Array<{
    type: ScriptBlock['type'];
    character?: string | null;
    parenthetical?: string | null;
    text: string;
  }>;
};

const mapSceneGenerationData = (data: SceneGenerationData): Scene => ({
  id: crypto.randomUUID(),
  heading: data.heading,
  summary: data.summary,
  blocks: data.blocks.map((block) => ({
    ...block,
    id: crypto.randomUUID(),
    blockRevision: 1
  }))
});

// --- Text Generation ---

export const executeGenerateScene = async (
  context: StoryContext,
  userInstruction: string,
  isFirstScene: boolean,
  options?: RequestOptions
): Promise<Scene> => {
  const request = createAiRequest<SceneGenerationData>(
    'generateScene',
    { storyContext: context, userInstruction, isFirstScene },
    options
  );
  const data = await request.promise;
  return mapSceneGenerationData(data);
};

export const executeSuggestPlotTwist = async (
  genre: string,
  options?: RequestOptions
): Promise<string> => {
  const request = createAiRequest<{ text: string }>('suggestPlotTwist', { genre }, options);
  const data = await request.promise;
  return data.text || 'Suddenly, everything changes.';
};

export const executeGenerateScriptElement = async (
  type: BlockType,
  character: string | undefined,
  instruction: string,
  styleContext: string,
  options?: RequestOptions
): Promise<string> => {
  const request = createAiRequest<{ text: string }>('generateScriptElement', {
    type,
    character,
    instruction,
    styleContext
  }, options);
  const data = await request.promise;
  return data.text?.trim() || '';
};

export const executeRewriteBlock = async (
  block: ScriptBlock,
  genre: string,
  premise: string,
  rewriteGuidance?: string,
  options?: RequestOptions
): Promise<string> => {
  const request = createAiRequest<{ text: string }>(
    'regenerateScriptBlock',
    { block, genre, premise, rewriteGuidance },
    options
  );
  const data = await request.promise;
  return data.text?.trim() || block.text;
};

export const executeGenerateSurpriseSetup = async (
  targetGenre?: string,
  options?: RequestOptions
): Promise<{ genre: string; premise: string; characters: string[] }> => {
  const request = createAiRequest<{ genre: string; premise: string; characters: string[] }>(
    'generateSurpriseSetup',
    { targetGenre },
    options
  );
  return request.promise;
};

export const generateScene = async (
  context: StoryContext,
  userInstruction: string,
  isFirstScene: boolean,
  options?: RequestOptions
): Promise<Scene> => {
  return executeGenerateScene(context, userInstruction, isFirstScene, options);
};

export const suggestPlotTwist = async (
  genre: string,
  options?: RequestOptions
): Promise<string> => {
  return executeSuggestPlotTwist(genre, options);
};

export const generateScriptElement = async (
  type: BlockType,
  character: string | undefined,
  instruction: string,
  styleContext: string,
  options?: RequestOptions
): Promise<string> => {
  return executeGenerateScriptElement(type, character, instruction, styleContext, options);
};

export const regenerateScriptBlock = async (
  block: ScriptBlock,
  genre: string,
  premise: string,
  rewriteGuidance?: string,
  options?: RequestOptions
): Promise<string> => {
  return executeRewriteBlock(block, genre, premise, rewriteGuidance, options);
};

export const generateSurpriseSetup = async (
  targetGenre?: string,
  options?: RequestOptions
): Promise<{ genre: string; premise: string; characters: string[] }> => {
  return executeGenerateSurpriseSetup(targetGenre, options);
};

// --- TTS Generation ---

const buildGenerateSpeechContext = (
  text: string,
  voiceName: string,
  extraContext?: Record<string, unknown>
): GenerateSpeechContext => {
  const safeText = text?.trim() ?? '';
  const extraVoice =
    typeof extraContext?.voiceName === 'string' ? extraContext.voiceName.trim() : '';
  const resolvedVoiceName = voiceName?.trim() || extraVoice || DEFAULT_VOICE_NAME;

  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    if (!voiceName || !voiceName.trim()) {
      console.debug('[generateSpeech] missing voiceName, falling back to', resolvedVoiceName);
    }
    if (extraVoice && extraVoice !== resolvedVoiceName) {
      console.debug('[generateSpeech] voiceName mismatch, using', resolvedVoiceName);
    }
  }

  return {
    ...extraContext,
    text: safeText,
    voiceName: resolvedVoiceName
  };
};

export const generateSpeech = async (
  text: string,
  voiceName: string,
  options?: RequestOptions,
  extraContext?: GenerateSpeechExtraContext
): Promise<ArrayBuffer> => {
  const request = createGenerateSpeechRequest(text, voiceName, options, extraContext);
  return request.promise;
};

export const createGenerateSpeechRequest = (
  text: string,
  voiceName: string,
  options?: RequestOptions,
  extraContext?: GenerateSpeechExtraContext
): CancellableRequest<ArrayBuffer> => {
  const context = buildGenerateSpeechContext(text, voiceName, extraContext);

  return enqueueTts<ArrayBuffer>(async (item) => {
    if (item.cancelled) {
      throw createAbortError();
    }
    const request = createAiRequest<{ audioBase64: string }>(
      'generateSpeech',
      context,
      options
    );
    item.inFlightCancel = request.cancel;

    try {
      const data = await request.promise;
      const base64Audio = data.audioBase64;
      if (!base64Audio) {
        throw new Error('No audio data returned');
      }
      return decodeAudioBase64(base64Audio);
    } finally {
      item.inFlightCancel = null;
    }
  });
};

export const listVoices = async (options?: RequestOptions): Promise<TtsVoice[]> => {
  const data = await requestAi<{ voices: TtsVoice[] }>('listVoices', {}, options);
  return Array.isArray(data.voices) ? data.voices : [];
};

/** @deprecated Use executeGenerateScene instead. */
export const createGenerateSceneRequest = (
  context: StoryContext,
  userInstruction: string,
  isFirstScene: boolean,
  options?: RequestOptions
): CancellableRequest<Scene> => {
  const controller = new AbortController();
  if (options?.signal) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason);
    } else {
      options.signal.addEventListener('abort', () => controller.abort(options.signal?.reason), { once: true });
    }
  }
  return {
    cancel: () => controller.abort(),
    promise: executeGenerateScene(context, userInstruction, isFirstScene, {
      ...options,
      signal: controller.signal
    })
  };
};

/** @deprecated Use executeSuggestPlotTwist instead. */
export const createSuggestPlotTwistRequest = (
  genre: string,
  options?: RequestOptions
): CancellableRequest<string> => {
  const controller = new AbortController();
  if (options?.signal) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason);
    } else {
      options.signal.addEventListener('abort', () => controller.abort(options.signal?.reason), { once: true });
    }
  }
  return {
    cancel: () => controller.abort(),
    promise: executeSuggestPlotTwist(genre, {
      ...options,
      signal: controller.signal
    })
  };
};

/** @deprecated Use executeRewriteBlock instead. */
export const createRegenerateScriptBlockRequest = (
  block: ScriptBlock,
  genre: string,
  premise: string,
  rewriteGuidance?: string,
  options?: RequestOptions
): CancellableRequest<string> => {
  const controller = new AbortController();
  if (options?.signal) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason);
    } else {
      options.signal.addEventListener('abort', () => controller.abort(options.signal?.reason), { once: true });
    }
  }
  return {
    cancel: () => controller.abort(),
    promise: executeRewriteBlock(block, genre, premise, rewriteGuidance, {
      ...options,
      signal: controller.signal
    })
  };
};

export const createGenerateScriptElementRequest = (
  type: BlockType,
  character: string | undefined,
  instruction: string,
  styleContext: string,
  options?: RequestOptions
): CancellableRequest<string> => {
  const controller = new AbortController();
  if (options?.signal) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason);
    } else {
      options.signal.addEventListener('abort', () => controller.abort(options.signal?.reason), { once: true });
    }
  }

  return {
    cancel: () => controller.abort(),
    promise: executeGenerateScriptElement(type, character, instruction, styleContext, {
      ...options,
      signal: controller.signal
    })
  };
};

export const createGenerateSurpriseSetupRequest = (
  targetGenre?: string,
  options?: RequestOptions
): CancellableRequest<{ genre: string; premise: string; characters: string[] }> => {
  const controller = new AbortController();
  if (options?.signal) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason);
    } else {
      options.signal.addEventListener('abort', () => controller.abort(options.signal?.reason), { once: true });
    }
  }
  return {
    cancel: () => controller.abort(),
    promise: executeGenerateSurpriseSetup(targetGenre, {
      ...options,
      signal: controller.signal
    })
  };
};
