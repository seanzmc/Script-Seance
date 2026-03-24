import OpenAI from 'openai';

const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4';
const DEFAULT_OPENAI_FAST_MODEL = process.env.OPENAI_FAST_MODEL || 'gpt-5.4-nano';
const DEFAULT_OPENAI_BALANCED_MODEL = process.env.OPENAI_BALANCED_MODEL || 'gpt-5.4-mini';

let cachedOpenAiClient = null;

const resolveDefaultOpenAiTextModel = (kind, context = undefined) => {
  switch (kind) {
    case 'generateScene':
      return DEFAULT_OPENAI_MODEL;
    case 'suggestPlotTwist':
    case 'regenerateScriptBlock':
    case 'generateSurpriseSetup':
      return DEFAULT_OPENAI_BALANCED_MODEL;
    case 'generateScriptElement':
      if (context?.purpose === 'insertBlock') {
        return DEFAULT_OPENAI_BALANCED_MODEL;
      }
      return DEFAULT_OPENAI_FAST_MODEL;
    default:
      return DEFAULT_OPENAI_FAST_MODEL;
  }
};

export const resolveTextGenerationModels = (kind, context = undefined) => {
  return {
    defaultModel: resolveDefaultOpenAiTextModel(kind, context),
    primaryModel: DEFAULT_OPENAI_MODEL
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
  const apiKey = process.env.SCRIPT_SEANCE_OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw createConfigError('Server missing SCRIPT_SEANCE_OPENAI_API_KEY.');
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
