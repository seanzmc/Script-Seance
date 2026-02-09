const readEnv = (key, fallback) => process.env[key] ?? fallback;

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toFloat = (value, fallback) => {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toProvider = (value) => (value === 'gemini' ? 'gemini' : 'local');

/**
 * @typedef {Object} LLMConfig
 * @property {'local'|'gemini'} provider
 * @property {{
 *   baseUrl: string;
 *   model: string;
 *   temperature: number;
 *   topP: number;
 *   maxTokens: number;
 *   contextWindow: number;
 * }} local
 * @property {{
 *   apiKey: string;
 *   model: string;
 *   temperature: number;
 *   topP: number;
 *   maxTokens: number;
 * }} gemini
 * @property {{
 *   maxInputTokens: number;
 *   maxOutputTokens: number;
 *   scriptStateBudget: number;
 *   recentBlocksBudget: number;
 *   systemPromptBudget: number;
 *   instructionBudget: number;
 * }} generation
 * @property {{
 *   maxPromptChars: number;
 *   dedupeWindowMs: number;
 *   tokenSpikeThreshold: number;
 * }} safety
 */

/**
 * @returns {LLMConfig}
 */
export function loadLLMConfig() {
  return {
    provider: toProvider(readEnv('LLM_PROVIDER', 'local')),

    local: {
      baseUrl: readEnv('LOCAL_LLM_BASE_URL', 'http://127.0.0.1:8080'),
      model: readEnv('LOCAL_LLM_MODEL', 'default'),
      temperature: toFloat(readEnv('LOCAL_LLM_TEMPERATURE', '0.7'), 0.7),
      topP: toFloat(readEnv('LOCAL_LLM_TOP_P', '0.9'), 0.9),
      maxTokens: toInt(readEnv('LOCAL_LLM_MAX_TOKENS', '1024'), 1024),
      contextWindow: toInt(readEnv('LOCAL_LLM_CONTEXT_WINDOW', '6144'), 6144)
    },

    gemini: {
      apiKey: readEnv('GEMINI_API_KEY', ''),
      model: readEnv('GEMINI_MODEL', 'gemini-2.5-flash'),
      temperature: toFloat(readEnv('GEMINI_TEMPERATURE', '0.7'), 0.7),
      topP: toFloat(readEnv('GEMINI_TOP_P', '0.9'), 0.9),
      maxTokens: toInt(readEnv('GEMINI_MAX_TOKENS', '1024'), 1024)
    },

    generation: {
      maxInputTokens: toInt(readEnv('LLM_MAX_INPUT_TOKENS', '5120'), 5120),
      maxOutputTokens: toInt(readEnv('LLM_MAX_OUTPUT_TOKENS', '1024'), 1024),
      scriptStateBudget: toInt(readEnv('LLM_STATE_BUDGET', '800'), 800),
      recentBlocksBudget: toInt(readEnv('LLM_BLOCKS_BUDGET', '3000'), 3000),
      systemPromptBudget: toInt(readEnv('LLM_SYSTEM_BUDGET', '500'), 500),
      instructionBudget: toInt(readEnv('LLM_INSTRUCTION_BUDGET', '300'), 300)
    },

    safety: {
      maxPromptChars: toInt(readEnv('AI_MAX_PROMPT_CHARS', '25000'), 25000),
      dedupeWindowMs: toInt(readEnv('LLM_DEDUPE_WINDOW_MS', '5000'), 5000),
      tokenSpikeThreshold: toFloat(readEnv('LLM_TOKEN_SPIKE_MULT', '1.5'), 1.5)
    }
  };
}
