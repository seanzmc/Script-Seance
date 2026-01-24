import { Scene, StoryContext, BlockType, ScriptBlock } from '../types';

type ApiError = {
  message: string;
  code?: string;
};

type ApiResponse<T> =
  | { data: T; error?: never }
  | { data?: never; error: ApiError };

const requestAi = async <T>(kind: string, context: unknown): Promise<T> => {
  const response = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ kind, context })
  });

  const text = await response.text();
  if (!text) {
    throw new Error('Empty response from server');
  }

  let payload: ApiResponse<T>;
  try {
    payload = JSON.parse(text) as ApiResponse<T>;
  } catch (error) {
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
    const error = new Error(message);
    (error as any).code = apiError?.code;
    (error as any).status = response.status;
    throw error;
  }

  return payload.data as T;
};

// --- Text Generation ---

export const generateScene = async (
  context: StoryContext,
  userInstruction: string,
  isFirstScene: boolean
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
  }>('generateScene', { storyContext: context, userInstruction, isFirstScene });

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

export const suggestPlotTwist = async (genre: string): Promise<string> => {
  const data = await requestAi<{ text: string }>('suggestPlotTwist', { genre });
  return data.text || 'Suddenly, everything changes.';
};

export const generateScriptElement = async (
  type: BlockType,
  character: string | undefined,
  instruction: string,
  styleContext: string
): Promise<string> => {
  const data = await requestAi<{ text: string }>('generateScriptElement', {
    type,
    character,
    instruction,
    styleContext
  });

  return data.text?.trim() || '';
};

export const regenerateScriptBlock = async (
  block: ScriptBlock,
  genre: string,
  premise: string
): Promise<string> => {
  const data = await requestAi<{ text: string }>('regenerateScriptBlock', {
    block,
    genre,
    premise
  });

  return data.text?.trim() || block.text;
};

export const generateSurpriseSetup = async (
  targetGenre?: string
): Promise<{ genre: string; premise: string; characters: string[] }> => {
  return requestAi<{ genre: string; premise: string; characters: string[] }>(
    'generateSurpriseSetup',
    { targetGenre }
  );
};

// --- TTS Generation ---

export const generateSpeech = async (text: string, voiceName: string): Promise<ArrayBuffer> => {
  const data = await requestAi<{ audioBase64: string }>('generateSpeech', { text, voiceName });
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
