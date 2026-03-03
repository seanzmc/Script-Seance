import { Scene, StoryContext, BlockType, ScriptBlock, TtsVoice } from '../types';
import { createBlock } from '../domain/blocks';

type ApiError = {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
};

export type PromptDebugTokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  cacheHitRatio: number | null;
} | null;

export type PromptDebugTrace = {
  requestId?: string;
  kind: string;
  provider: string;
  model: string;
  max_output_tokens: number | null;
  timeoutMs: number | null;
  promptContextRevision: number | null;
  styleFingerprint: string;
  memoryBundle?: {
    sectionSizes: Record<string, number> | null;
  };
  durationMs: number | null;
  tokenUsage: PromptDebugTokenUsage;
  previews?: {
    instruction?: unknown;
    context?: unknown;
    prompt?: unknown;
  };
};

export const PROMPT_DEBUG_EVENT_NAME = 'ss:prompt-debug-trace';

type ApiSuccessResponse<T> = { data: T; error?: never; debug?: PromptDebugTrace };
type ApiFailureResponse = { data?: never; error: ApiError };
type ApiResponse<T> = ApiSuccessResponse<T> | ApiFailureResponse;

const isApiFailureResponse = <T>(payload: ApiResponse<T>): payload is ApiFailureResponse => (
  typeof (payload as ApiFailureResponse).error === 'object' &&
  (payload as ApiFailureResponse).error !== null
);

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

export const AI_KINDS = {
  generateScene: 'generateScene',
  suggestPlotTwist: 'suggestPlotTwist',
  regenerateScriptBlock: 'regenerateScriptBlock',
  generateScriptElement: 'generateScriptElement',
  generateSurpriseSetup: 'generateSurpriseSetup',
  generateSpeech: 'generateSpeech',
  listVoices: 'listVoices'
} as const;

export type AiKind = typeof AI_KINDS[keyof typeof AI_KINDS];

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
  __SS_DEBUG_PROMPTS__?: boolean;
  __SS_PROMPT_CONTEXT_REVISION__?: number;
  __SS_STYLE_FINGERPRINT__?: string;
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

const isPromptDebugEnabled = () =>
  typeof window !== 'undefined' &&
  Boolean((window as DebugWindow).__SS_DEBUG_PROMPTS__) &&
  (typeof process === 'undefined' || process.env.NODE_ENV !== 'production');

const isPromptDebugTrace = (value: unknown): value is PromptDebugTrace => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const trace = value as Record<string, unknown>;
  return (
    typeof trace.kind === 'string' &&
    typeof trace.provider === 'string' &&
    typeof trace.model === 'string'
  );
};

const emitPromptDebugTrace = (trace: unknown) => {
  if (!isPromptDebugEnabled()) {
    return;
  }
  if (!isPromptDebugTrace(trace)) {
    return;
  }
  window.dispatchEvent(new CustomEvent<PromptDebugTrace>(PROMPT_DEBUG_EVENT_NAME, { detail: trace }));
};

const buildPromptTracePayload = () => {
  if (!isPromptDebugEnabled()) {
    return null;
  }
  const promptContextRevisionRaw = (window as DebugWindow).__SS_PROMPT_CONTEXT_REVISION__;
  const promptContextRevision = (
    typeof promptContextRevisionRaw === 'number' &&
    Number.isFinite(promptContextRevisionRaw) &&
    promptContextRevisionRaw >= 0
  )
    ? Math.floor(promptContextRevisionRaw)
    : null;
  const styleFingerprintRaw = (window as DebugWindow).__SS_STYLE_FINGERPRINT__;
  const styleFingerprint = typeof styleFingerprintRaw === 'string' && styleFingerprintRaw.trim()
    ? styleFingerprintRaw.trim().toLowerCase().slice(0, 64)
    : null;
  return {
    enabled: true,
    promptContextRevision,
    styleFingerprint
  };
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
  kind: AiKind,
  context: unknown,
  options: RequestOptions = {}
): CancellableRequest<T> => {
  const controller = new AbortController();
  const kindDefaultTimeout = kind === AI_KINDS.generateScene ? DEFAULT_SCENE_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
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
    const promptTrace = buildPromptTracePayload();
    const response = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(promptTrace ? { 'X-SS-Debug-Prompts': '1' } : {})
      },
      credentials: 'include',
      signal: controller.signal,
      body: JSON.stringify({
        kind,
        context,
        ...(promptTrace ? { promptTrace } : {})
      })
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

    if (isApiFailureResponse(payload)) {
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

    if (!response.ok) {
      const statusMessage =
        response.status === 401
          ? 'Authentication required. Please log in to continue.'
          : response.status === 429
          ? 'Rate limit exceeded. Please wait and try again.'
          : 'AI request failed';
      const error = new Error(statusMessage) as Error & {
        code?: string;
        status?: number;
        details?: Record<string, unknown>;
      };
      error.status = response.status;
      const retryAfterHeader = response.headers?.get?.('Retry-After');
      if (retryAfterHeader) {
        const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10);
        if (Number.isFinite(retryAfterSeconds)) {
          error.details = { ...(error.details ?? {}), retryAfterSeconds };
        }
      }
      throw error;
    }

    emitPromptDebugTrace(payload.debug);
    return payload.data;
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
  kind: AiKind,
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
  blocks: data.blocks
    .filter((block) => block.type !== BlockType.HEADING)
    .map((block) => createBlock({
      type: block.type,
      text: block.text,
      character: block.character ?? undefined,
      parenthetical: block.parenthetical ?? undefined
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
    AI_KINDS.generateScene,
    { storyContext: context, userInstruction, isFirstScene },
    options
  );
  const data = await request.promise;
  return mapSceneGenerationData(data);
};

export const executeSuggestPlotTwist = async (
  genre: string,
  styleOrOptions?: string | RequestOptions,
  maybeOptions?: RequestOptions
): Promise<string> => {
  const style = typeof styleOrOptions === 'string' ? styleOrOptions : undefined;
  const options = typeof styleOrOptions === 'string' ? maybeOptions : styleOrOptions;
  const request = createAiRequest<{ text: string }>(AI_KINDS.suggestPlotTwist, { genre, style }, options);
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
  const request = createAiRequest<{ text: string }>(AI_KINDS.generateScriptElement, {
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
  style?: string,
  rewriteGuidance?: string,
  options?: RequestOptions
): Promise<string> => {
  const request = createAiRequest<{ text: string }>(
    AI_KINDS.regenerateScriptBlock,
    { block, genre, premise, style, rewriteGuidance },
    options
  );
  const data = await request.promise;
  return data.text?.trim() || block.text;
};

export type SurpriseSetupContext = {
  targetGenre?: string;
  styleId?: string;
  styleName?: string;
  // Legacy freeform style text; retained for backward compatibility.
  style?: string;
};

export const executeGenerateSurpriseSetup = async (
  contextOrTargetGenre?: string | SurpriseSetupContext,
  options?: RequestOptions
): Promise<{ genre: string; premise: string; characters: string[] }> => {
  const context = typeof contextOrTargetGenre === 'string'
    ? { targetGenre: contextOrTargetGenre }
    : (contextOrTargetGenre ?? {});
  const request = createAiRequest<{ genre: string; premise: string; characters: string[] }>(
    AI_KINDS.generateSurpriseSetup,
    context,
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
  style?: string,
  options?: RequestOptions
): Promise<string> => {
  return executeSuggestPlotTwist(genre, style, options);
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
  style?: string,
  rewriteGuidance?: string,
  options?: RequestOptions
): Promise<string> => {
  return executeRewriteBlock(block, genre, premise, style, rewriteGuidance, options);
};

export const generateSurpriseSetup = async (
  contextOrTargetGenre?: string | SurpriseSetupContext,
  options?: RequestOptions
): Promise<{ genre: string; premise: string; characters: string[] }> => {
  return executeGenerateSurpriseSetup(contextOrTargetGenre, options);
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
      AI_KINDS.generateSpeech,
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
  const data = await requestAi<{ voices: TtsVoice[] }>(AI_KINDS.listVoices, {}, options);
  return Array.isArray(data.voices) ? data.voices : [];
};
