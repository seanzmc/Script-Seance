import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

const DEFAULT_TEXT_PROVIDER = 'openai';
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.2';
const DEFAULT_OPENAI_FAST_MODEL = process.env.OPENAI_FAST_MODEL || 'gpt-5-nano';
const DEFAULT_OPENAI_BALANCED_MODEL = process.env.OPENAI_BALANCED_MODEL || 'gpt-5-mini';
const DEFAULT_GEMINI_SCENE_MODEL = process.env.GEMINI_TEXT_MODEL_SCENE || 'gemini-2.5-flash';
const DEFAULT_GEMINI_FAST_MODEL = process.env.GEMINI_TEXT_MODEL_FAST || 'gemini-2.5-flash-lite';

let cachedOpenAiClient = null;
let cachedGeminiClient = null;

const normalizeProvider = (value) => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'gemini') return 'gemini';
  return 'openai';
};

export const getTextProvider = () =>
  normalizeProvider(process.env.TEXT_LLM_PROVIDER || DEFAULT_TEXT_PROVIDER);

export const getTextModels = (kind) => {
  const isScene = kind === 'generateScene';
  return {
    openai: isScene ? DEFAULT_OPENAI_MODEL : DEFAULT_OPENAI_FAST_MODEL,
    openaiBalanced: DEFAULT_OPENAI_BALANCED_MODEL,
    gemini: isScene ? DEFAULT_GEMINI_SCENE_MODEL : DEFAULT_GEMINI_FAST_MODEL
  };
};

export const createConfigError = (message, code = 'CONFIG_ERROR', details) => {
  const error = new Error(message);
  error.code = code;
  if (details && typeof details === 'object') {
    error.details = details;
  }
  return error;
};

export const getOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw createConfigError('Server missing OPENAI_API_KEY.');
  }
  if (cachedOpenAiClient) {
    return cachedOpenAiClient;
  }
  cachedOpenAiClient = new OpenAI({
    apiKey,
    // Retries are handled by our upstream retry policy to avoid nested retry loops.
    maxRetries: 0
  });
  return cachedOpenAiClient;
};

export const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw createConfigError('Server missing GEMINI_API_KEY.');
  }
  if (cachedGeminiClient) {
    return cachedGeminiClient;
  }
  cachedGeminiClient = new GoogleGenAI({ apiKey });
  return cachedGeminiClient;
};
