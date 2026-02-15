import { Scene, StoryContext, BlockType, ScriptBlock, TtsVoice } from '../types';
import { buildInsertInput, buildSurpriseSetupInput, type GenerateInput } from './llmSceneAdapter';

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

export type RequestOptions = {
  timeoutMs?: number;
};

export type CancellableRequest<T> = {
  promise: Promise<T>;
  cancel: () => void;
};

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_VOICE_NAME = 'Zephyr';
const TTS_MAX_ATTEMPTS = 5;
const TTS_BASE_DELAY_MS = 1000;
const TTS_MAX_DELAY_MS = 10000;
const TTS_JITTER_MS = 250;

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
  delayTimeout?: ReturnType<typeof setTimeout> | null;
  delayReject?: ((error: unknown) => void) | null;
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
      inFlightCancel: null,
      delayTimeout: null,
      delayReject: null
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
    if (item.delayTimeout) {
      clearTimeout(item.delayTimeout);
      item.delayTimeout = null;
      const rejectDelay = item.delayReject;
      item.delayReject = null;
      rejectDelay?.(createAbortError());
    }
    const index = ttsQueue.indexOf(item as unknown as TtsQueueItem<unknown>);
    if (index >= 0) {
      ttsQueue.splice(index, 1);
      item.reject(createAbortError());
    }
  };

  return { promise, cancel };
};

const isRateLimitError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const record = error as { status?: number; code?: string | number; message?: string; details?: Record<string, unknown> };
  if (record.status === 429 || record.code === 429 || record.code === 'RATE_LIMITED') {
    return true;
  }
  const message = record.message?.toLowerCase() ?? '';
  if (message.includes('resource_exhausted') || message.includes('rate limit') || message.includes('429')) {
    return true;
  }
  const details = record.details as Record<string, unknown> | undefined;
  if (!details) return false;
  const reason = typeof details.reason === 'string' ? details.reason.toLowerCase() : '';
  return reason.includes('resource_exhausted') || reason.includes('rate limit');
};

const getRetryDelayMs = (error: unknown) => {
  if (!error || typeof error !== 'object') return null;
  const record = error as { details?: Record<string, unknown> };
  const details = record.details as Record<string, unknown> | undefined;
  if (!details) return null;
  const retryAfterSeconds = details.retryAfterSeconds;
  if (typeof retryAfterSeconds === 'number' && Number.isFinite(retryAfterSeconds)) {
    return Math.ceil(retryAfterSeconds * 1000);
  }
  const retryDelayMs = details.retryDelayMs;
  if (typeof retryDelayMs === 'number' && Number.isFinite(retryDelayMs)) {
    return Math.ceil(retryDelayMs);
  }
  const retryDelaySeconds = details.retryDelaySeconds;
  if (typeof retryDelaySeconds === 'number' && Number.isFinite(retryDelaySeconds)) {
    return Math.ceil(retryDelaySeconds * 1000);
  }
  const retryDelay = (details.retryDelay ?? (details.retryInfo as { retryDelay?: unknown } | undefined)?.retryDelay) as
    | { seconds?: number; nanos?: number }
    | number
    | string
    | undefined;
  if (typeof retryDelay === 'number' && Number.isFinite(retryDelay)) {
    return Math.ceil(retryDelay);
  }
  if (typeof retryDelay === 'string') {
    const parsed = Number.parseInt(retryDelay, 10);
    if (Number.isFinite(parsed)) {
      return Math.ceil(parsed);
    }
  }
  if (retryDelay && typeof retryDelay === 'object') {
    const seconds = typeof retryDelay.seconds === 'number' ? retryDelay.seconds : 0;
    const nanos = typeof retryDelay.nanos === 'number' ? retryDelay.nanos : 0;
    const totalMs = seconds * 1000 + Math.ceil(nanos / 1e6);
    if (Number.isFinite(totalMs) && totalMs > 0) {
      return totalMs;
    }
  }
  return null;
};

const waitWithCancel = (ms: number, item: TtsQueueItem<unknown>) =>
  new Promise<void>((resolve, reject) => {
    if (item.cancelled) {
      reject(createAbortError());
      return;
    }
    const timeout = setTimeout(() => {
      item.delayTimeout = null;
      item.delayReject = null;
      resolve();
    }, ms);
    item.delayTimeout = timeout;
    item.delayReject = reject;
  });

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
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let abortReason: 'cancel' | 'timeout' | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      abortReason = 'timeout';
      controller.abort();
    }, timeoutMs);
  }

  const cancel = () => {
    if (!controller.signal.aborted) {
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
    if (getErrorName(error) === 'AbortError') {
      const message =
        abortReason === 'timeout' ? 'Request timed out.' : 'Request canceled.';
      const abortError = new Error(message) as Error & { code?: string };
      abortError.code =
        abortReason === 'timeout' ? 'REQUEST_TIMEOUT' : 'REQUEST_ABORTED';
      throw abortError;
    }
    throw error;
  }).finally(() => {
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

const requestLlm = async <T>(
  input: GenerateInput,
  options: RequestOptions = {}
): Promise<T> => {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let abortReason: 'cancel' | 'timeout' | null = null;

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      abortReason = 'timeout';
      controller.abort();
    }, timeoutMs);
  }

  try {
    const response = await fetch('/api/llm/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: controller.signal,
      body: JSON.stringify(input)
    });

    let payload = {} as T & { error?: string };
    if (typeof (response as Response).text === 'function') {
      const raw = await response.text();
      if (raw) {
        try {
          payload = JSON.parse(raw) as T & { error?: string };
        } catch {
          payload = {} as T & { error?: string };
        }
      }
    } else if (typeof (response as Response).json === 'function') {
      payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    }

    if (!response.ok) {
      const apiError =
        payload && typeof payload.error === 'object' && payload.error !== null
          ? (payload.error as { message?: string; code?: string })
          : null;
      const statusMessage =
        response.status === 401
          ? 'Authentication required. Please log in to continue.'
          : response.status === 429
          ? 'Rate limit exceeded. Please wait and try again.'
          : null;
      const payloadMessage = typeof payload.error === 'string' ? payload.error : apiError?.message;
      const message = statusMessage || payloadMessage || `HTTP ${response.status}`;
      const error = new Error(message) as Error & {
        code?: string;
        status?: number;
      };
      if (apiError?.code) {
        error.code = apiError.code;
      }
      error.status = response.status;
      throw error;
    }

    if (payload.error) {
      if (typeof payload.error === 'string') {
        throw new Error(payload.error);
      }
      const apiError = payload.error as { message?: string };
      throw new Error(apiError.message || 'LLM request failed.');
    }

    return payload as T;
  } catch (error: unknown) {
    if (getErrorName(error) === 'AbortError') {
      const message = abortReason === 'timeout' ? 'Request timed out.' : 'Request canceled.';
      const abortError = new Error(message) as Error & { code?: string };
      abortError.code = abortReason === 'timeout' ? 'REQUEST_TIMEOUT' : 'REQUEST_ABORTED';
      throw abortError;
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

// --- Text Generation ---

export const generateScene = async (
  context: StoryContext,
  userInstruction: string,
  isFirstScene: boolean,
  options?: RequestOptions
): Promise<Scene> => {
  const data = await requestAi<{
    heading: string;
    summary: string;
    blocks: Array<{
      type: ScriptBlock['type'];
      character?: string | null;
      parenthetical?: string | null;
      text: string;
    }>;
  }>('generateScene', { storyContext: context, userInstruction, isFirstScene }, options);

  return {
    id: crypto.randomUUID(),
    heading: data.heading,
    summary: data.summary,
    blocks: data.blocks.map((block) => ({
      ...block,
      id: crypto.randomUUID()
    }))
  };
};

export const suggestPlotTwist = async (
  genre: string,
  options?: RequestOptions
): Promise<string> => {
  const data = await requestAi<{ text: string }>('suggestPlotTwist', { genre }, options);
  return data.text || 'Suddenly, everything changes.';
};

export const generateScriptElement = async (
  type: BlockType,
  character: string | undefined,
  instruction: string,
  styleContext: string,
  options?: RequestOptions
): Promise<string> => {
  const syntheticContext: StoryContext = {
    title: 'Untitled Screenplay',
    genre: styleContext?.trim() || 'Screenplay',
    premise: instruction?.trim() || 'Generate a screenplay block.',
    characters: character ? [character] : [],
    scenes: []
  };

  const input = buildInsertInput(
    syntheticContext,
    'scene-0',
    'insert-root',
    type,
    [instruction, character ? `Character: ${character}.` : '', 'Return only the block text.']
      .filter(Boolean)
      .join(' '),
    styleContext
  );

  const data = await requestLlm<{ text?: string }>(input, options);
  return data.text?.trim() || '';
};

export const regenerateScriptBlock = async (
  block: ScriptBlock,
  genre: string,
  premise: string,
  rewriteGuidance?: string,
  options?: RequestOptions
): Promise<string> => {
  const data = await requestAi<{ text: string }>('regenerateScriptBlock', {
    block,
    genre,
    premise,
    rewriteGuidance
  }, options);

  return data.text?.trim() || block.text;
};

const parseSurpriseSetupText = (
  rawText: string,
  targetGenre?: string
): { genre: string; premise: string; characters: string[] } => {
  const fallbackGenre = targetGenre?.trim() || 'Drama';
  const fallback = {
    genre: fallbackGenre,
    premise: `A gripping ${fallbackGenre} story with unexpected twists.`,
    characters: ['Protagonist', 'Antagonist', 'The Catalyst']
  };

  const normalized = rawText.trim();
  if (!normalized) return fallback;

  const parseJson = (value: string) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  };

  const parsedDirect = parseJson(normalized);
  const objectMatch = normalized.match(/\{[\s\S]*\}/);
  const parsedMatched = objectMatch ? parseJson(objectMatch[0]) : null;
  const candidate = (parsedDirect && typeof parsedDirect === 'object' ? parsedDirect : parsedMatched) as
    | {
        genre?: unknown;
        premise?: unknown;
        characters?: unknown;
      }
    | null;

  if (candidate) {
    const genre = typeof candidate.genre === 'string' && candidate.genre.trim() ? candidate.genre.trim() : fallback.genre;
    const premise = typeof candidate.premise === 'string' && candidate.premise.trim() ? candidate.premise.trim() : fallback.premise;
    const characters = Array.isArray(candidate.characters)
      ? candidate.characters
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];
    if (characters.length >= 2) {
      return { genre, premise, characters: characters.slice(0, 4) };
    }
  }

  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  const genreLine = lines.find((line) => /^genre\s*:/i.test(line));
  const premiseLine = lines.find((line) => /^premise\s*:/i.test(line));
  const charactersLine = lines.find((line) => /^characters?\s*:/i.test(line));

  const parsedGenre = genreLine ? genreLine.replace(/^genre\s*:\s*/i, '').trim() : '';
  const parsedPremise = premiseLine ? premiseLine.replace(/^premise\s*:\s*/i, '').trim() : '';
  const parsedCharacters = charactersLine
    ? charactersLine
        .replace(/^characters?\s*:\s*/i, '')
        .split(/[,|]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

  if (parsedCharacters.length >= 2) {
    return {
      genre: parsedGenre || fallback.genre,
      premise: parsedPremise || fallback.premise,
      characters: parsedCharacters.slice(0, 4)
    };
  }

  return fallback;
};

export const generateSurpriseSetup = async (
  targetGenre?: string,
  options?: RequestOptions
): Promise<{ genre: string; premise: string; characters: string[] }> => {
  const response = await requestLlm<{ text?: string }>(buildSurpriseSetupInput(targetGenre), options);
  return parseSurpriseSetupText(response.text ?? '', targetGenre);
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
    let attempt = 1;
    let lastDelayMs = 0;

    while (attempt <= TTS_MAX_ATTEMPTS) {
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
        item.inFlightCancel = null;
        const base64Audio = data.audioBase64;
        if (!base64Audio) {
          throw new Error('No audio data returned');
        }
        return decodeAudioBase64(base64Audio);
      } catch (error: unknown) {
        item.inFlightCancel = null;
        if (item.cancelled) {
          throw createAbortError();
        }
        if (!isRateLimitError(error)) {
          throw error;
        }
        if (attempt >= TTS_MAX_ATTEMPTS) {
          const finalError = new Error(
            `TTS rate limit exceeded after retries (attempts: ${attempt}, lastDelayMs: ${lastDelayMs})`
          ) as Error & { code?: string; status?: number; details?: Record<string, unknown> };
          const record = error as { code?: string | number; status?: number; details?: Record<string, unknown> };
          finalError.code = record.code ? String(record.code) : 'RATE_LIMITED';
          finalError.status = record.status ?? 429;
          finalError.details = {
            ...(record.details ?? {}),
            attempts: attempt,
            lastDelayMs
          };
          throw finalError;
        }

        const retryDelayMs = getRetryDelayMs(error);
        const baseDelay = Math.min(
          TTS_MAX_DELAY_MS,
          TTS_BASE_DELAY_MS * Math.pow(2, attempt - 1)
        );
        const jitter = Math.floor(Math.random() * TTS_JITTER_MS);
        const delayMs = Math.min(TTS_MAX_DELAY_MS, (retryDelayMs ?? baseDelay) + jitter);
        lastDelayMs = delayMs;
        await waitWithCancel(delayMs, item as unknown as TtsQueueItem<unknown>);
        attempt += 1;
      }
    }

    throw new Error('TTS retry loop exhausted.');
  });
};

export const listVoices = async (options?: RequestOptions): Promise<TtsVoice[]> => {
  const data = await requestAi<{ voices: TtsVoice[] }>('listVoices', {}, options);
  return Array.isArray(data.voices) ? data.voices : [];
};

export const createGenerateSceneRequest = (
  context: StoryContext,
  userInstruction: string,
  isFirstScene: boolean,
  options?: RequestOptions
): CancellableRequest<Scene> => {
  const request = createAiRequest<{
    heading: string;
    summary: string;
    blocks: Array<{
      type: ScriptBlock['type'];
      character?: string | null;
      parenthetical?: string | null;
      text: string;
    }>;
  }>('generateScene', { storyContext: context, userInstruction, isFirstScene }, options);

  return {
    cancel: request.cancel,
    promise: request.promise.then((data) => ({
      id: crypto.randomUUID(),
      heading: data.heading,
      summary: data.summary,
      blocks: data.blocks.map((block) => ({
        ...block,
        id: crypto.randomUUID()
      }))
    }))
  };
};

export const createSuggestPlotTwistRequest = (
  genre: string,
  options?: RequestOptions
): CancellableRequest<string> => {
  const request = createAiRequest<{ text: string }>('suggestPlotTwist', { genre }, options);
  return {
    cancel: request.cancel,
    promise: request.promise.then((data) => data.text || 'Suddenly, everything changes.')
  };
};

export const createRegenerateScriptBlockRequest = (
  block: ScriptBlock,
  genre: string,
  premise: string,
  rewriteGuidance?: string,
  options?: RequestOptions
): CancellableRequest<string> => {
  const request = createAiRequest<{ text: string }>(
    'regenerateScriptBlock',
    { block, genre, premise, rewriteGuidance },
    options
  );
  return {
    cancel: request.cancel,
    promise: request.promise.then((data) => data.text?.trim() || block.text)
  };
};
