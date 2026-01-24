import { Scene, StoryContext, BlockType, ScriptBlock } from '../types';

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
  const data = await requestAi<{ text: string }>('generateScriptElement', {
    type,
    character,
    instruction,
    styleContext
  }, options);

  return data.text?.trim() || '';
};

export const regenerateScriptBlock = async (
  block: ScriptBlock,
  genre: string,
  premise: string,
  options?: RequestOptions
): Promise<string> => {
  const data = await requestAi<{ text: string }>('regenerateScriptBlock', {
    block,
    genre,
    premise
  }, options);

  return data.text?.trim() || block.text;
};

export const generateSurpriseSetup = async (
  targetGenre?: string,
  options?: RequestOptions
): Promise<{ genre: string; premise: string; characters: string[] }> => {
  return requestAi<{ genre: string; premise: string; characters: string[] }>(
    'generateSurpriseSetup',
    { targetGenre },
    options
  );
};

// --- TTS Generation ---

export const generateSpeech = async (
  text: string,
  voiceName: string,
  options?: RequestOptions
): Promise<ArrayBuffer> => {
  const data = await requestAi<{ audioBase64: string }>(
    'generateSpeech',
    { text, voiceName },
    options
  );
  const base64Audio = data.audioBase64;

  if (!base64Audio) {
    throw new Error('No audio data returned');
  }

  const binaryString = atob(base64Audio);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
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
  options?: RequestOptions
): CancellableRequest<string> => {
  const request = createAiRequest<{ text: string }>(
    'regenerateScriptBlock',
    { block, genre, premise },
    options
  );
  return {
    cancel: request.cancel,
    promise: request.promise.then((data) => data.text?.trim() || block.text)
  };
};
