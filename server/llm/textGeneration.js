import { Type } from '@google/genai';
import crypto from 'node:crypto';
import {
  SCRIPT_ELEMENT_SYSTEM_INSTRUCTION,
  buildSceneHistoryContext,
  buildGenerateScenePrompt,
  buildPlotTwistPrompt,
  buildScriptElementPrompt,
  buildRegenerateBlockPrompt,
  buildSurpriseSetupPrompt
} from './promptBuilders.js';
import { resolveLibraryStyleById } from './styleCatalog.js';
import { resolveTextGenerationModels } from './llmClient.js';
import { isTextGenerationKind } from './types.js';
import {
  runWithAbortableTimeout,
  runWithRetry,
  isRetryableUpstreamError
} from '../upstreamControl.js';
import {
  createStyleFingerprint,
  emitPromptTrace,
  buildPromptPreviewText,
  buildPromptPreviewValue
} from './promptTrace.js';

const OPENAI_PROMPT_CACHE_PREFIX = 'script-seance:text-gen';
const DEFAULT_OPENAI_PROMPT_CACHE_RETENTION = process.env.OPENAI_PROMPT_CACHE_RETENTION || '24h';
const MAX_RAW_RESPONSE_LOG_CHARS = 2000;
const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const parseNonNegativeInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};
const OPENAI_SCENE_MAX_OUTPUT_TOKENS = parsePositiveInt(process.env.OPENAI_SCENE_MAX_OUTPUT_TOKENS, 2200);
const OPENAI_SCENE_MAX_OUTPUT_TOKENS_SHORT = parsePositiveInt(
  process.env.OPENAI_SCENE_MAX_OUTPUT_TOKENS_SHORT,
  Math.max(600, Math.floor(OPENAI_SCENE_MAX_OUTPUT_TOKENS * 0.55))
);
const OPENAI_SCENE_MAX_OUTPUT_TOKENS_MEDIUM = parsePositiveInt(
  process.env.OPENAI_SCENE_MAX_OUTPUT_TOKENS_MEDIUM,
  OPENAI_SCENE_MAX_OUTPUT_TOKENS
);
const OPENAI_SCENE_MAX_OUTPUT_TOKENS_LONG = parsePositiveInt(
  process.env.OPENAI_SCENE_MAX_OUTPUT_TOKENS_LONG,
  Math.max(OPENAI_SCENE_MAX_OUTPUT_TOKENS + 600, Math.floor(OPENAI_SCENE_MAX_OUTPUT_TOKENS * 1.35))
);
const OPENAI_SCENE_COMPLETION_BUFFER_TOKENS = parsePositiveInt(
  process.env.OPENAI_SCENE_COMPLETION_BUFFER_TOKENS,
  180
);
const OPENAI_MAX_OUTPUT_TOKENS_RETRY_CAP = parsePositiveInt(process.env.OPENAI_MAX_OUTPUT_TOKENS_RETRY_CAP, 5000);
const OPENAI_MAX_OUTPUT_TOKENS_RETRY_ATTEMPTS = parsePositiveInt(
  process.env.OPENAI_MAX_OUTPUT_TOKENS_RETRY_ATTEMPTS,
  3
);
const DEFAULT_UPSTREAM_TIMEOUT_MS = parsePositiveInt(process.env.AI_UPSTREAM_TIMEOUT_MS, 30000);
const DEFAULT_UPSTREAM_RETRY_MAX_RETRIES = parseNonNegativeInt(process.env.AI_UPSTREAM_RETRY_MAX_RETRIES, 2);
const DEFAULT_UPSTREAM_RETRY_BASE_DELAY_MS = parseNonNegativeInt(process.env.AI_UPSTREAM_RETRY_BASE_DELAY_MS, 250);
const DEFAULT_UPSTREAM_RETRY_MAX_DELAY_MS = parseNonNegativeInt(process.env.AI_UPSTREAM_RETRY_MAX_DELAY_MS, 4000);
const DEFAULT_UPSTREAM_RETRY_JITTER_MS = parseNonNegativeInt(process.env.AI_UPSTREAM_RETRY_JITTER_MS, 150);

const DIALOGUE_SCENE_BLOCK_REQUIRED_FIELDS = ['type', 'character', 'parenthetical', 'text'];
const SCENE_BLOCK_SCHEMA_VARIANTS = {
  action: {
    type: 'object',
    additionalProperties: false,
    properties: {
      type: { type: 'string', enum: ['action'] },
      text: { type: 'string' }
    },
    required: ['type', 'text']
  },
  transition: {
    type: 'object',
    additionalProperties: false,
    properties: {
      type: { type: 'string', enum: ['transition'] },
      text: { type: 'string' }
    },
    required: ['type', 'text']
  },
  dialogue: {
    type: 'object',
    additionalProperties: false,
    properties: {
      type: { type: 'string', enum: ['dialogue'] },
      character: { type: 'string', minLength: 1 },
      parenthetical: { type: ['string', 'null'] },
      text: { type: 'string' }
    },
    required: DIALOGUE_SCENE_BLOCK_REQUIRED_FIELDS
  }
};

const buildSceneJsonSchema = (lengthProfile) => ({
  type: 'object',
  additionalProperties: false,
  properties: {
    heading: { type: 'string' },
    summary: { type: 'string' },
    blocks: {
      type: 'array',
      minItems: lengthProfile.minBlocks,
      maxItems: lengthProfile.maxBlocks,
      items: {
        anyOf: [
          SCENE_BLOCK_SCHEMA_VARIANTS.action,
          SCENE_BLOCK_SCHEMA_VARIANTS.transition,
          SCENE_BLOCK_SCHEMA_VARIANTS.dialogue
        ]
      }
    }
  },
  required: ['heading', 'summary', 'blocks']
});

const buildGeminiSceneBlockSchema = (blockSchema) => ({
  type: Type.OBJECT,
  properties: Object.fromEntries(
    Object.entries(blockSchema.properties).map(([key, value]) => {
      const property = { ...value };
      if (Array.isArray(property.type)) {
        property.nullable = property.type.includes('null');
        property.type = property.type.find((entry) => entry !== 'null')?.toUpperCase();
      } else {
        property.type = property.type.toUpperCase();
      }
      return [key, property];
    })
  ),
  required: blockSchema.required
});

const buildGeminiSceneResponseSchema = (lengthProfile) => ({
  type: Type.OBJECT,
  properties: {
    heading: { type: Type.STRING },
    summary: { type: Type.STRING },
    blocks: {
      type: Type.ARRAY,
      minItems: lengthProfile.minBlocks,
      maxItems: lengthProfile.maxBlocks,
      items: {
        anyOf: [
          buildGeminiSceneBlockSchema(SCENE_BLOCK_SCHEMA_VARIANTS.action),
          buildGeminiSceneBlockSchema(SCENE_BLOCK_SCHEMA_VARIANTS.transition),
          buildGeminiSceneBlockSchema(SCENE_BLOCK_SCHEMA_VARIANTS.dialogue)
        ]
      }
    }
  },
  required: ['heading', 'summary', 'blocks']
});

const SURPRISE_SETUP_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    genre: { type: 'string' },
    premise: { type: 'string' },
    characters: { type: 'array', items: { type: 'string' } }
  },
  required: ['genre', 'premise', 'characters']
};
const MAX_VALIDATED_TEXT_CHARS = 4000;
const MAX_VALIDATED_GENRE_CHARS = 120;
const MAX_VALIDATED_PREMISE_CHARS = 4000;
const MAX_VALIDATED_CHARACTERS = 12;
const MAX_VALIDATED_CHARACTER_CHARS = 120;

const createInvalidAiResponseError = (kind, reason) => {
  const error = new Error('AI response did not match expected format.');
  error.code = 'INVALID_AI_RESPONSE';
  error.details = { kind, reason };
  return error;
};
const isInvalidAiResponseError = (error) => (
  Boolean(error) &&
  typeof error === 'object' &&
  error.code === 'INVALID_AI_RESPONSE'
);
const validateGeneratedTextResponse = (kind, rawText) => {
  const text = typeof rawText === 'string' ? rawText.trim() : '';
  if (!text) {
    throw createInvalidAiResponseError(kind, 'Empty text response.');
  }
  if (text.length > MAX_VALIDATED_TEXT_CHARS) {
    throw createInvalidAiResponseError(kind, 'Text response too long.');
  }
  return text;
};
const validateSurpriseSetupResponseData = (kind, data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw createInvalidAiResponseError(kind, 'Response was not an object.');
  }
  if (
    typeof data.genre !== 'string' ||
    !data.genre.trim() ||
    data.genre.length > MAX_VALIDATED_GENRE_CHARS
  ) {
    throw createInvalidAiResponseError(kind, 'Genre missing or too long.');
  }
  if (
    typeof data.premise !== 'string' ||
    !data.premise.trim() ||
    data.premise.length > MAX_VALIDATED_PREMISE_CHARS
  ) {
    throw createInvalidAiResponseError(kind, 'Premise missing or too long.');
  }
  if (
    !Array.isArray(data.characters) ||
    data.characters.length === 0 ||
    data.characters.length > MAX_VALIDATED_CHARACTERS ||
    data.characters.some((character) => (
      typeof character !== 'string' ||
      !character.trim() ||
      character.length > MAX_VALIDATED_CHARACTER_CHARS
    ))
  ) {
    throw createInvalidAiResponseError(kind, 'Characters missing or invalid.');
  }
  return data;
};

const stripJsonFormatting = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch && fencedMatch[1]) {
    return fencedMatch[1].trim();
  }
  return trimmed;
};

const parseJsonObject = (value, kind) => {
  const normalized = stripJsonFormatting(value);
  if (!normalized) {
    throw createInvalidAiResponseError(kind, 'Empty JSON response payload.');
  }
  try {
    return JSON.parse(normalized);
  } catch {
    const error = createInvalidAiResponseError(kind, 'Invalid JSON payload.');
    error.details = {
      ...(error.details ?? {}),
      rawResponse: normalized.slice(0, MAX_RAW_RESPONSE_LOG_CHARS)
    };
    throw error;
  }
};

const extractOpenAiText = (response) => {
  if (typeof response?.output_text === 'string' && response.output_text.trim().length > 0) {
    return response.output_text;
  }

  const output = Array.isArray(response?.output) ? response.output : [];
  const parts = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === 'string') {
        parts.push(part.text);
      }
    }
  }
  return parts.join('\n').trim();
};
const getPromptInstructionsText = (promptParts) => (
  typeof promptParts?.instructions === 'string' ? promptParts.instructions.trim() : ''
);
const getPromptInputText = (promptParts) => (
  typeof promptParts?.input === 'string' ? promptParts.input.trim() : ''
);
const getPromptPreviewText = (promptParts) => (
  typeof promptParts?.previewText === 'string' ? promptParts.previewText.trim() : ''
);
const joinPromptTexts = (...values) => values
  .filter((value) => typeof value === 'string' && value.trim())
  .map((value) => value.trim())
  .join('\n\n');
const resolveGeminiPromptRequest = ({ promptParts, config }) => {
  const instructions = getPromptInstructionsText(promptParts);
  const input = getPromptInputText(promptParts) || getPromptPreviewText(promptParts);
  return {
    contents: input,
    config: instructions
      ? {
          ...(config ? { ...config } : {}),
          systemInstruction: joinPromptTexts(config?.systemInstruction, instructions)
        }
      : config
  };
};

const normalizeModelName = (model) => (typeof model === 'string' ? model.trim().toLowerCase() : '');
const isGpt52OrGpt51Model = (model) => {
  const normalized = normalizeModelName(model);
  return normalized.startsWith('gpt-5.2') || normalized.startsWith('gpt-5.1');
};
const isLegacyGpt5Model = (model) => {
  const normalized = normalizeModelName(model);
  if (isGpt52OrGpt51Model(normalized)) return false;
  return normalized === 'gpt-5' || normalized.startsWith('gpt-5-');
};
const supportsExtendedPromptCacheRetention = (model) => {
  const normalized = normalizeModelName(model);
  return (
    normalized.startsWith('gpt-5.2') ||
    normalized.startsWith('gpt-5.1') ||
    normalized === 'gpt-5' ||
    normalized.startsWith('gpt-5-codex') ||
    normalized.startsWith('gpt-4.1')
  );
};
const resolvePromptCacheRetention = (model, retentionOverride) => {
  const normalized = typeof retentionOverride === 'string' ? retentionOverride.trim().toLowerCase() : '';
  if (!normalized) return null;
  if (normalized === 'in-memory' || normalized === 'in_memory') return 'in-memory';
  if (normalized === '24h' && supportsExtendedPromptCacheRetention(model)) return '24h';
  return null;
};
const supportsExplicitOpenAiReasoningPolicy = (model) => normalizeModelName(model).startsWith('gpt-5.4');
const shouldApplySamplingControls = (model, reasoningEffort) => {
  if (!isLegacyGpt5Model(model)) return true;
  if (isGpt52OrGpt51Model(model) && reasoningEffort === 'none') return true;
  return false;
};
const resolveOpenAiFlowPolicy = (kind, context, models) => {
  const reasoningEffort = supportsExplicitOpenAiReasoningPolicy(models?.openai) ? 'none' : undefined;
  const shouldPromote = (
    kind === 'suggestPlotTwist' ||
    kind === 'regenerateScriptBlock' ||
    kind === 'generateSurpriseSetup' ||
    (kind === 'generateScriptElement' && context?.purpose === 'insertBlock')
  );
  return {
    reasoningEffort,
    promotedModel: shouldPromote && models?.openaiPrimary && models.openaiPrimary !== models.openai
      ? models.openaiPrimary
      : null
  };
};
const buildPromptCacheKey = (kind, discriminator, model) => {
  const suffix = discriminator ? `:${discriminator}` : '';
  const modelSegment = normalizeModelName(model).replace(/[^a-z0-9.-]/g, '') || 'model';
  const rawKey = `${OPENAI_PROMPT_CACHE_PREFIX}:${modelSegment}:${kind}${suffix}:v1`;
  const digest = crypto.createHash('sha256').update(rawKey).digest('hex').slice(0, 40);
  return `ss:tg:v1:${digest}`;
};
const getCachedInputTokens = (response) =>
  response?.usage?.input_tokens_details?.cached_tokens ??
  response?.usage?.prompt_tokens_details?.cached_tokens ??
  response?.usage?.input_tokens_details?.cachedTokens ??
  0;
const getOutputTokens = (response) =>
  response?.usage?.output_tokens ??
  response?.usage?.completion_tokens ??
  0;
const resolveSceneMaxOutputTokens = (lengthProfile) => {
  const completionBuffer = Math.max(0, OPENAI_SCENE_COMPLETION_BUFFER_TOKENS);
  if (!lengthProfile || typeof lengthProfile !== 'object') {
    return OPENAI_SCENE_MAX_OUTPUT_TOKENS_MEDIUM + completionBuffer;
  }
  if (lengthProfile.key === 'short') return OPENAI_SCENE_MAX_OUTPUT_TOKENS_SHORT + completionBuffer;
  if (lengthProfile.key === 'long') return OPENAI_SCENE_MAX_OUTPUT_TOKENS_LONG + completionBuffer;
  return OPENAI_SCENE_MAX_OUTPUT_TOKENS_MEDIUM + completionBuffer;
};
const SENTENCE_END_RE = /[.!?…]["')\]]*$/;
const TRANSITION_END_RE = /[:.!?]["')\]]*$/;
const trimToCompleteSentence = (text) => {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) return '';
  const sentenceEnds = ['.', '!', '?']
    .map((char) => trimmed.lastIndexOf(char))
    .filter((index) => index >= 0);
  const lastSentenceEnd = sentenceEnds.length ? Math.max(...sentenceEnds) : -1;
  if (lastSentenceEnd >= Math.floor(trimmed.length * 0.45)) {
    return trimmed.slice(0, lastSentenceEnd + 1).trim();
  }
  return `${trimmed}.`;
};
const normalizeSceneBlockText = (block) => {
  if (!block || typeof block !== 'object') {
    return { block, adjusted: false };
  }
  if (typeof block.text !== 'string') {
    return { block, adjusted: false };
  }
  const text = block.text.trim();
  const blockType = typeof block.type === 'string' ? block.type : '';
  if (!text) {
    return { block: { ...block, text }, adjusted: block.text !== text };
  }

  if (blockType === 'action' || blockType === 'dialogue') {
    if (SENTENCE_END_RE.test(text)) {
      return { block: { ...block, text }, adjusted: block.text !== text };
    }
    const normalizedText = trimToCompleteSentence(text);
    return { block: { ...block, text: normalizedText }, adjusted: normalizedText !== block.text };
  }

  if (blockType === 'transition') {
    if (TRANSITION_END_RE.test(text)) {
      return { block: { ...block, text }, adjusted: block.text !== text };
    }
    const normalizedText = text.endsWith('TO') ? `${text}:` : `${text}.`;
    return { block: { ...block, text: normalizedText }, adjusted: normalizedText !== block.text };
  }

  return { block: { ...block, text }, adjusted: block.text !== text };
};
const normalizeSceneThoughtCompletion = (data) => {
  if (!data || typeof data !== 'object' || !Array.isArray(data.blocks)) {
    return { data, adjustedBlocks: 0 };
  }
  let adjustedBlocks = 0;
  const blocks = data.blocks.map((block) => {
    const normalized = normalizeSceneBlockText(block);
    if (normalized.adjusted) adjustedBlocks += 1;
    return normalized.block;
  });
  return {
    data: { ...data, blocks },
    adjustedBlocks
  };
};

const resolveRetryPolicy = (upstreamContext = {}) => {
  const overrides = upstreamContext.retryPolicy ?? {};
  return {
    maxRetries: overrides.maxRetries ?? DEFAULT_UPSTREAM_RETRY_MAX_RETRIES,
    baseDelayMs: overrides.baseDelayMs ?? DEFAULT_UPSTREAM_RETRY_BASE_DELAY_MS,
    maxDelayMs: overrides.maxDelayMs ?? DEFAULT_UPSTREAM_RETRY_MAX_DELAY_MS,
    jitterMs: overrides.jitterMs ?? DEFAULT_UPSTREAM_RETRY_JITTER_MS,
    isRetryableError: overrides.isRetryableError ?? isRetryableUpstreamError,
    signal: upstreamContext.signal ?? overrides.signal
  };
};

const runWithUpstreamPolicy = async ({
  operationName,
  timeoutMs,
  upstreamContext,
  execute
}) => {
  const resolvedTimeoutMs = timeoutMs ?? upstreamContext?.timeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS;
  const retryPolicy = resolveRetryPolicy(upstreamContext);
  return await runWithRetry(
    async ({ signal }) => runWithAbortableTimeout(
      (timeoutSignal) => execute(timeoutSignal),
      {
        timeoutMs: resolvedTimeoutMs,
        signal,
        operationName
      }
    ),
    retryPolicy
  );
};

const resolveTimeoutForTrace = (timeoutMs, upstreamContext) => (
  timeoutMs ?? upstreamContext?.timeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS
);

const resolveStyleFingerprintForTrace = (explicitStyleFingerprint, styleSource) => (
  explicitStyleFingerprint || createStyleFingerprint(styleSource)
);

const collapseWhitespace = (value) => (
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
);

const buildCanonicalStyleContext = (canonicalStyle) => (
  canonicalStyle
    ? [
        `Style: ${canonicalStyle.title} (${canonicalStyle.id}).`,
        `Style guidance: ${canonicalStyle.description}`
      ].filter(Boolean).join('\n')
    : ''
);

const resolvePromptStyleContext = (styleSource, baseStyleContext = '') => {
  const canonicalStyle = resolveLibraryStyleById(styleSource?.styleId);
  const styleId = canonicalStyle?.id || null;
  const styleName = canonicalStyle?.title || collapseWhitespace(styleSource?.styleName) || null;
  const legacyStyle = collapseWhitespace(styleSource?.style);
  const normalizedBaseStyleContext = typeof baseStyleContext === 'string' ? baseStyleContext.trim() : '';
  const resolvedStyleContext = buildCanonicalStyleContext(canonicalStyle) || (legacyStyle ? `Style: ${legacyStyle}.` : '');

  return {
    styleId,
    styleName,
    legacyStyle,
    styleContext: [normalizedBaseStyleContext, resolvedStyleContext].filter(Boolean).join('\n')
  };
};

const resolveSceneStyleContext = (storyContext) => resolvePromptStyleContext(storyContext).styleContext;

const sanitizeContextPreviewForDebug = (contextPreview) => {
  if (!contextPreview || typeof contextPreview !== 'object' || Array.isArray(contextPreview)) {
    return contextPreview;
  }
  const sanitizedContextPreview = { ...contextPreview };
  if (sanitizedContextPreview.styleId) {
    delete sanitizedContextPreview.style;
  }
  return sanitizedContextPreview;
};

const emitKindPromptTrace = ({
  traceMeta,
  kind,
  provider,
  model,
  timeoutMs,
  upstreamContext,
  maxOutputTokens,
  styleSource,
  instructionPreview,
  contextPreview
}) => {
  if (!traceMeta?.enabled) return;
  const sanitizedContextPreview = sanitizeContextPreviewForDebug(contextPreview);
  emitPromptTrace({
    enabled: true,
    kind,
    provider,
    model,
    timeoutMs: resolveTimeoutForTrace(timeoutMs, upstreamContext),
    maxOutputTokens,
    promptContextRevision: traceMeta.promptContextRevision,
    styleFingerprint: resolveStyleFingerprintForTrace(traceMeta.styleFingerprint, styleSource),
    instructionPreview,
    contextPreview: sanitizedContextPreview
  });
};

const normalizeTokenUsage = (usage) => {
  if (!usage || typeof usage !== 'object') {
    return null;
  }
  const inputTokens = typeof usage.inputTokens === 'number' ? usage.inputTokens : null;
  const outputTokens = typeof usage.outputTokens === 'number' ? usage.outputTokens : null;
  const totalTokens = typeof usage.totalTokens === 'number' ? usage.totalTokens : null;
  const cachedInputTokens = typeof usage.cachedInputTokens === 'number' ? usage.cachedInputTokens : null;
  const cacheHitRatio = typeof usage.cacheHitRatio === 'number' ? usage.cacheHitRatio : null;
  if (
    inputTokens === null &&
    outputTokens === null &&
    totalTokens === null &&
    cachedInputTokens === null &&
    cacheHitRatio === null
  ) {
    return null;
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    cacheHitRatio
  };
};

const buildKindDebugMeta = ({
  traceMeta,
  kind,
  provider,
  model,
  timeoutMs,
  upstreamContext,
  maxOutputTokens,
  styleSource,
  instructionPreview,
  contextPreview,
  promptPreview,
  requestMetrics
}) => ({
  kind,
  provider,
  model,
  max_output_tokens: typeof maxOutputTokens === 'number' ? maxOutputTokens : null,
  timeoutMs: resolveTimeoutForTrace(timeoutMs, upstreamContext),
  promptContextRevision:
    typeof traceMeta?.promptContextRevision === 'number' ? traceMeta.promptContextRevision : null,
  styleFingerprint: resolveStyleFingerprintForTrace(traceMeta?.styleFingerprint, styleSource),
  memoryBundle: {
    sectionSizes: null
  },
  durationMs: typeof requestMetrics?.durationMs === 'number' ? requestMetrics.durationMs : null,
  tokenUsage: normalizeTokenUsage(requestMetrics?.usage),
  previews: {
    instruction: buildPromptPreviewValue(instructionPreview),
    context: buildPromptPreviewValue(sanitizeContextPreviewForDebug(contextPreview)),
    prompt: traceMeta?.enabled ? buildPromptPreviewText(promptPreview) : null
  }
});
const runOpenAiWithSemanticPromotion = async ({
  kind,
  initialModel,
  promotedModel,
  executeAttempt
}) => {
  try {
    const result = await executeAttempt(initialModel);
    return { ...result, promoted: false, promotedFromModel: null };
  } catch (error) {
    if (!isInvalidAiResponseError(error) || !promotedModel || promotedModel === initialModel) {
      throw error;
    }
    console.warn('[text-gen] promoting after invalid output', {
      kind,
      fromModel: initialModel,
      toModel: promotedModel,
      reason: error?.details?.reason || error?.message || 'Invalid AI response'
    });
    const result = await executeAttempt(promotedModel);
    return { ...result, promoted: true, promotedFromModel: initialModel };
  }
};

const requestOpenAiText = async ({
  openai,
  kind,
  model,
  promptParts,
  reasoningEffort,
  maxOutputTokens,
  temperature,
  topP,
  cacheKey,
  cacheRetention,
  jsonSchemaFormat,
  retryOnMaxOutputTokens = false,
  upstreamContext,
  timeoutMs
}) => {
  const resolvedTimeoutMs = timeoutMs ?? upstreamContext?.timeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS;
  console.info('[text-gen] request', {
    kind,
    provider: 'openai',
    model,
    timeoutMs: resolvedTimeoutMs
  });
  const shouldApplySampling = shouldApplySamplingControls(model, reasoningEffort);
  const startedAt = Date.now();
  let attempt = 0;
  let outputTokenLimit = maxOutputTokens;
  const instructions = getPromptInstructionsText(promptParts);
  const input = getPromptInputText(promptParts) || getPromptPreviewText(promptParts);

  while (true) {
    const requestPayload = {
      model,
      input,
      max_output_tokens: outputTokenLimit,
      store: false,
      prompt_cache_key: cacheKey || buildPromptCacheKey(kind, undefined, model)
    };
    if (instructions) {
      requestPayload.instructions = instructions;
    }
    if (jsonSchemaFormat) {
      requestPayload.text = {
        format: {
          type: 'json_schema',
          name: jsonSchemaFormat.name,
          schema: jsonSchemaFormat.schema,
          strict: true,
          ...(jsonSchemaFormat.description ? { description: jsonSchemaFormat.description } : {})
        }
      };
    }

    const resolvedRetention = resolvePromptCacheRetention(model, cacheRetention);
    if (resolvedRetention) {
      requestPayload.prompt_cache_retention = resolvedRetention;
    }

    if (reasoningEffort) {
      requestPayload.reasoning = { effort: reasoningEffort };
    }

    if (shouldApplySampling) {
      if (typeof temperature === 'number') {
        requestPayload.temperature = temperature;
      }
      if (typeof topP === 'number') {
        requestPayload.top_p = topP;
      }
    }

    let response;
    try {
      response = await runWithUpstreamPolicy({
        operationName: 'openai.responses.create',
        timeoutMs: resolvedTimeoutMs,
        upstreamContext,
        execute: (timeoutSignal) => openai.responses.create(requestPayload, { signal: timeoutSignal })
      });
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'UPSTREAM_TIMEOUT') {
        error.details = {
          ...(error.details && typeof error.details === 'object' ? error.details : {}),
          kind,
          provider: 'openai',
          model,
          timeoutMs: resolvedTimeoutMs,
          attempt: attempt + 1,
          maxOutputTokens: outputTokenLimit
        };
        console.warn('[text-gen] timeout', error.details);
      }
      throw error;
    }

    const incompleteReason = response?.incomplete_details?.reason;
    const canRetryForMaxTokens =
      retryOnMaxOutputTokens &&
      response?.status === 'incomplete' &&
      incompleteReason === 'max_output_tokens' &&
      attempt < OPENAI_MAX_OUTPUT_TOKENS_RETRY_ATTEMPTS &&
      outputTokenLimit < OPENAI_MAX_OUTPUT_TOKENS_RETRY_CAP;
    if (canRetryForMaxTokens) {
      const nextLimit = Math.min(
        OPENAI_MAX_OUTPUT_TOKENS_RETRY_CAP,
        Math.max(outputTokenLimit + 600, Math.ceil(outputTokenLimit * 1.75))
      );
      console.warn('[text-gen] retrying after max_output_tokens', {
        kind,
        provider: 'openai',
        model,
        previousMaxOutputTokens: outputTokenLimit,
        nextMaxOutputTokens: nextLimit
      });
      outputTokenLimit = nextLimit;
      attempt += 1;
      continue;
    }

    const latencyMs = Date.now() - startedAt;
    const cachedInputTokens = getCachedInputTokens(response);
    const totalInputTokens = response?.usage?.input_tokens ?? response?.usage?.prompt_tokens ?? 0;
    const outputTokens = getOutputTokens(response);
    const totalTokens = response?.usage?.total_tokens ?? (totalInputTokens + outputTokens);
    const cacheHitRatio = totalInputTokens > 0
      ? Number((cachedInputTokens / totalInputTokens).toFixed(3))
      : 0;
    const text = extractOpenAiText(response);
    const requireCompletedResponse = Boolean(jsonSchemaFormat);
    if (response?.status && response.status !== 'completed') {
      const statusDetails = {
        kind,
        provider: 'openai',
        model,
        status: response.status,
        incompleteDetails: response.incomplete_details ?? null,
        maxOutputTokens: outputTokenLimit,
        attempts: attempt + 1
      };
      if (requireCompletedResponse || !text || !text.trim()) {
        const error = new Error('AI response was not completed.');
        error.code = 'UPSTREAM_ERROR';
        error.details = statusDetails;
        throw error;
      }
      console.warn('[text-gen] response incomplete but text present; proceeding', statusDetails);
    }
    console.info('[text-gen] completed', {
      kind,
      provider: 'openai',
      model,
      latencyMs,
      inputTokens: totalInputTokens,
      outputTokens,
      totalTokens,
      outputChars: text?.length ?? 0,
      cachedInputTokens,
      cacheHitRatio,
      attempts: attempt + 1
    });

    if (!text || !text.trim()) {
      throw new Error('No response from AI');
    }
    return {
      text,
      durationMs: latencyMs,
      usage: {
        inputTokens: totalInputTokens,
        outputTokens,
        totalTokens,
        cachedInputTokens,
        cacheHitRatio
      },
      finalMaxOutputTokens: outputTokenLimit
    };
  }
};

const requestGeminiText = async ({
  geminiAi,
  kind,
  model,
  contents,
  config,
  upstreamContext,
  timeoutMs
}) => {
  const resolvedTimeoutMs = timeoutMs ?? upstreamContext?.timeoutMs ?? DEFAULT_UPSTREAM_TIMEOUT_MS;
  console.info('[text-gen] request', {
    kind,
    provider: 'gemini',
    model,
    timeoutMs: resolvedTimeoutMs
  });
  const startedAt = Date.now();
  let response;
  try {
    response = await runWithUpstreamPolicy({
      operationName: 'gemini.models.generateContent',
      timeoutMs: resolvedTimeoutMs,
      upstreamContext,
      execute: (timeoutSignal) => geminiAi.models.generateContent({
        model,
        contents,
        ...(config ? { config } : {}),
        abortSignal: timeoutSignal
      })
    });
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'UPSTREAM_TIMEOUT') {
      error.details = {
        ...(error.details && typeof error.details === 'object' ? error.details : {}),
        kind,
        provider: 'gemini',
        model,
        timeoutMs: resolvedTimeoutMs
      };
      console.warn('[text-gen] timeout', error.details);
    }
    throw error;
  }

  const latencyMs = Date.now() - startedAt;
  console.info('[text-gen] completed', {
    kind,
    provider: 'gemini',
    model,
    latencyMs
  });

  const text = response?.text;
  if (!text || !text.trim()) {
    throw new Error('No response from AI');
  }
  return {
    text,
    durationMs: latencyMs,
    usage: null,
    finalMaxOutputTokens:
      typeof config?.maxOutputTokens === 'number' ? config.maxOutputTokens : null
  };
};

export const getPromptSizeEstimate = ({ kind, context, genres }) => {
  if (!isTextGenerationKind(kind) || !context || typeof context !== 'object') {
    return 0;
  }

  if (kind === 'generateScene') {
    const { storyContext, userInstruction, isFirstScene } = context;
    const styleContext = resolveSceneStyleContext(storyContext);
    const { promptSize } = buildGenerateScenePrompt({
      genre: storyContext?.genre || '',
      premise: storyContext?.premise || '',
      characters: storyContext?.characters || [],
      scenes: storyContext?.scenes || [],
      userInstruction: userInstruction || '',
      isFirstScene: Boolean(isFirstScene),
      style: storyContext?.style || '',
      styleContext,
      targetLength: storyContext?.targetLength || ''
    });
    return promptSize;
  }

  if (kind === 'suggestPlotTwist') {
    const resolvedStyle = resolvePromptStyleContext(context);
    return buildPlotTwistPrompt({
      genre: context.genre || '',
      premise: context.premise || '',
      characters: context.characters || [],
      recentSceneHeading: context.recentSceneHeading || '',
      recentSceneSummary: context.recentSceneSummary || '',
      userInstruction: context.userInstruction || '',
      style: resolvedStyle.styleContext
    }).previewText.length;
  }

  if (kind === 'generateScriptElement') {
    const resolvedStyle = resolvePromptStyleContext(context, context.styleContext || '');
    return buildScriptElementPrompt({
      type: context.type,
      character: context.character,
      instruction: context.instruction || '',
      styleContext: resolvedStyle.styleContext
    }).previewText.length;
  }

  if (kind === 'regenerateScriptBlock') {
    const resolvedStyle = resolvePromptStyleContext(context);
    return buildRegenerateBlockPrompt({
      type: context.block?.type,
      character: context.block?.character,
      genre: context.genre || '',
      premise: context.premise || '',
      text: context.block?.text || '',
      style: resolvedStyle.styleContext,
      rewriteGuidance: context.rewriteGuidance
    }).previewText.length;
  }

  if (kind === 'generateSurpriseSetup') {
    const canonicalStyle = resolveLibraryStyleById(context.styleId);
    return buildSurpriseSetupPrompt({
      targetGenre: context.targetGenre,
      genres,
      style: {
        styleId: canonicalStyle?.id || context.styleId || '',
        styleName: canonicalStyle?.title || context.styleName || context.style || '',
        styleGuidance: canonicalStyle?.description || '',
        legacyStyle: context.style || ''
      }
    }).previewText.length;
  }

  return 0;
};

export const generateTextByKind = async ({
  kind,
  context,
  genres,
  provider,
  openai,
  geminiAi,
  upstreamContext,
  timeoutMs = undefined
}) => {
  if (!isTextGenerationKind(kind)) {
    throw new Error(`Unsupported text generation kind: ${kind}`);
  }

  const models = resolveTextGenerationModels(kind, context);
  const openAiFlowPolicy = resolveOpenAiFlowPolicy(kind, context, models);
  const traceMeta = upstreamContext?.promptTrace;

  if (kind === 'generateScene') {
    const { storyContext, userInstruction, isFirstScene } = context;
    const styleContext = resolveSceneStyleContext(storyContext);
    const sceneHistory = buildSceneHistoryContext(storyContext.scenes);
    const { instructions, input, previewText, lengthProfile } = buildGenerateScenePrompt({
      genre: storyContext.genre,
      premise: storyContext.premise,
      characters: storyContext.characters,
      scenes: storyContext.scenes,
      userInstruction,
      isFirstScene,
      style: storyContext.style,
      styleContext,
      targetLength: storyContext.targetLength
    });
    const sceneMaxOutputTokens = resolveSceneMaxOutputTokens(lengthProfile);
    const sceneModel = provider === 'openai' ? models.openai : models.gemini;
    const instructionPreview = {
      task: isFirstScene ? 'Write opening scene' : 'Write next scene',
      userInstruction
    };
    const contextPreview = {
      genre: storyContext.genre,
      premise: storyContext.premise,
      characters: storyContext.characters,
      styleId: storyContext.styleId || null,
      styleContext,
      targetLength: storyContext.targetLength || lengthProfile.label,
      olderSceneSummaries: sceneHistory.olderSceneSummaries,
      recentSceneHeading: sceneHistory.recentSceneHeading || null,
      recentSceneBlocks: sceneHistory.recentSceneBlocks
    };
    emitKindPromptTrace({
      traceMeta,
      kind,
      provider,
      model: sceneModel,
      timeoutMs,
      upstreamContext,
      maxOutputTokens: sceneMaxOutputTokens,
      styleSource: styleContext,
      instructionPreview,
      contextPreview
    });

    const responsePayload = provider === 'openai'
      ? await requestOpenAiText({
          openai,
          kind,
          model: sceneModel,
          promptParts: { instructions, input, previewText },
          reasoningEffort: openAiFlowPolicy.reasoningEffort,
          maxOutputTokens: sceneMaxOutputTokens,
          temperature: 0.82,
          topP: 0.95,
          cacheKey: buildPromptCacheKey(
            kind,
            `${isFirstScene ? 'opening' : 'next'}:${lengthProfile.key}:${storyContext.style ? 'styled' : 'unstyled'}`,
            sceneModel
          ),
          cacheRetention: DEFAULT_OPENAI_PROMPT_CACHE_RETENTION,
          jsonSchemaFormat: {
            name: 'scene_output',
            description: 'Structured screenplay scene output.',
            schema: buildSceneJsonSchema(lengthProfile)
          },
          retryOnMaxOutputTokens: true,
          upstreamContext,
          timeoutMs
        })
      : await requestGeminiText({
          geminiAi,
          kind,
          model: models.gemini,
          ...resolveGeminiPromptRequest({
            promptParts: { instructions, input, previewText },
            config: {
              responseMimeType: 'application/json',
              responseSchema: buildGeminiSceneResponseSchema(lengthProfile)
            }
          }),
          upstreamContext,
          timeoutMs
        });
    const rawText = responsePayload.text;

    const data = parseJsonObject(rawText, kind);
    const normalizedScene = normalizeSceneThoughtCompletion(data);
    const sceneBlockCount = Array.isArray(normalizedScene.data?.blocks) ? normalizedScene.data.blocks.length : 0;
    console.info('[text-gen] scene parsed', {
      kind,
      model: sceneModel,
      targetLength: lengthProfile.label,
      maxOutputTokens: sceneMaxOutputTokens,
      blocks: sceneBlockCount,
      normalizedTrailingBlocks: normalizedScene.adjustedBlocks,
      headingChars: typeof normalizedScene.data?.heading === 'string' ? normalizedScene.data.heading.length : 0,
      summaryChars: typeof normalizedScene.data?.summary === 'string' ? normalizedScene.data.summary.length : 0
    });
    return {
      data: normalizedScene.data,
      meta: {
        rawAiResponse: rawText,
        parsedAiKeys: normalizedScene.data && typeof normalizedScene.data === 'object'
          ? Object.keys(normalizedScene.data)
          : [],
        debug: buildKindDebugMeta({
          traceMeta,
          kind,
          provider,
          model: sceneModel,
          timeoutMs,
          upstreamContext,
          maxOutputTokens: provider === 'openai'
            ? responsePayload.finalMaxOutputTokens
            : null,
          styleSource: styleContext,
          instructionPreview,
          contextPreview,
          promptPreview: previewText,
          requestMetrics: responsePayload
        })
      }
    };
  }

  if (kind === 'suggestPlotTwist') {
    const resolvedStyle = resolvePromptStyleContext(context);
    const promptParts = buildPlotTwistPrompt({
      genre: context.genre,
      premise: context.premise,
      characters: context.characters,
      recentSceneHeading: context.recentSceneHeading,
      recentSceneSummary: context.recentSceneSummary,
      userInstruction: context.userInstruction,
      style: resolvedStyle.styleContext
    });
    const twistModel = provider === 'openai' ? models.openai : models.gemini;
    const instructionPreview = {
      task: 'Give one grounded, single-sentence plot twist'
    };
    const contextPreview = {
      genre: context.genre,
      premise: context.premise || null,
      characters: Array.isArray(context.characters) ? context.characters : [],
      recentSceneHeading: context.recentSceneHeading || null,
      recentSceneSummary: context.recentSceneSummary || null,
      userInstruction: context.userInstruction || null,
      styleId: resolvedStyle.styleId,
      styleName: resolvedStyle.styleName,
      styleContext: resolvedStyle.styleContext,
      ...(resolvedStyle.styleId ? {} : { style: resolvedStyle.legacyStyle })
    };
    emitKindPromptTrace({
      traceMeta,
      kind,
      provider,
      model: twistModel,
      timeoutMs,
      upstreamContext,
      maxOutputTokens: 90,
      styleSource: resolvedStyle.styleContext,
      instructionPreview,
      contextPreview
    });
    const openAiResult = provider === 'openai'
      ? await runOpenAiWithSemanticPromotion({
          kind,
          initialModel: models.openai,
          promotedModel: openAiFlowPolicy.promotedModel,
          executeAttempt: async (model) => {
            const responsePayload = await requestOpenAiText({
              openai,
              kind,
              model,
              promptParts,
              reasoningEffort: openAiFlowPolicy.reasoningEffort,
              maxOutputTokens: 90,
              temperature: 0.92,
              topP: 0.98,
              cacheKey: buildPromptCacheKey(kind, undefined, model),
              cacheRetention: DEFAULT_OPENAI_PROMPT_CACHE_RETENTION,
              upstreamContext,
              timeoutMs
            });
            return {
              responsePayload,
              text: validateGeneratedTextResponse(kind, responsePayload.text),
              model
            };
          }
        })
      : null;
    const responsePayload = provider === 'openai'
      ? openAiResult.responsePayload
      : await requestGeminiText({
          geminiAi,
          kind,
          model: models.gemini,
          ...resolveGeminiPromptRequest({ promptParts }),
          upstreamContext,
          timeoutMs
        });
    const text = provider === 'openai' ? openAiResult.text : responsePayload.text;
    const finalModel = provider === 'openai' ? openAiResult.model : twistModel;

    return {
      data: { text: text || 'Suddenly, everything changes.' },
      meta: {
        debug: buildKindDebugMeta({
          traceMeta,
          kind,
          provider,
          model: finalModel,
          timeoutMs,
          upstreamContext,
          maxOutputTokens: provider === 'openai' ? responsePayload.finalMaxOutputTokens : null,
          styleSource: resolvedStyle.styleContext,
          instructionPreview,
          contextPreview,
          promptPreview: promptParts.previewText,
          requestMetrics: responsePayload
        })
      }
    };
  }

  if (kind === 'generateScriptElement') {
    const { type, character, instruction, styleContext, purpose } = context;
    const resolvedStyle = resolvePromptStyleContext(context, styleContext);
    const promptParts = buildScriptElementPrompt({
      type,
      character,
      instruction,
      styleContext: resolvedStyle.styleContext
    });
    const requestPromptParts = {
      instructions: joinPromptTexts(SCRIPT_ELEMENT_SYSTEM_INSTRUCTION, promptParts.instructions),
      input: promptParts.input,
      previewText: joinPromptTexts(
        'Instructions:',
        SCRIPT_ELEMENT_SYSTEM_INSTRUCTION,
        promptParts.instructions,
        'Input:',
        promptParts.input
      )
    };
    const scriptElementModel = provider === 'openai' ? models.openai : models.gemini;
    const instructionPreview = {
      task: purpose === 'titleSuggestion'
        ? 'Generate title suggestion'
        : 'Generate one script element block',
      instruction
    };
    const contextPreview = {
      purpose: purpose || null,
      type,
      character,
      styleId: resolvedStyle.styleId,
      styleName: resolvedStyle.styleName,
      styleContext: resolvedStyle.styleContext,
      ...(resolvedStyle.styleId ? {} : { style: resolvedStyle.legacyStyle })
    };
    emitKindPromptTrace({
      traceMeta,
      kind,
      provider,
      model: scriptElementModel,
      timeoutMs,
      upstreamContext,
      maxOutputTokens: 100,
      styleSource: resolvedStyle.styleContext,
      instructionPreview,
      contextPreview
    });

    const shouldValidateForPromotion = purpose === 'insertBlock';
    const openAiResult = provider === 'openai'
      ? await runOpenAiWithSemanticPromotion({
          kind,
          initialModel: models.openai,
          promotedModel: openAiFlowPolicy.promotedModel,
          executeAttempt: async (model) => {
            const responsePayload = await requestOpenAiText({
              openai,
              kind,
              model,
              promptParts: requestPromptParts,
              reasoningEffort: openAiFlowPolicy.reasoningEffort,
              maxOutputTokens: 100,
              temperature: 0.72,
              topP: 0.92,
              cacheKey: buildPromptCacheKey(
                kind,
                `${purpose || 'legacy'}:${type}`,
                model
              ),
              cacheRetention: DEFAULT_OPENAI_PROMPT_CACHE_RETENTION,
              upstreamContext,
              timeoutMs
            });
            return {
              responsePayload,
              text: shouldValidateForPromotion
                ? validateGeneratedTextResponse(kind, responsePayload.text)
                : responsePayload.text.trim(),
              model
            };
          }
        })
      : null;
    const responsePayload = provider === 'openai'
      ? openAiResult.responsePayload
      : await requestGeminiText({
          geminiAi,
          kind,
          model: models.gemini,
          ...resolveGeminiPromptRequest({
            promptParts: requestPromptParts,
            config: {
            maxOutputTokens: 100,
            temperature: 0.7
            }
          }),
          upstreamContext,
          timeoutMs
        });
    const text = provider === 'openai' ? openAiResult.text : responsePayload.text;
    const finalModel = provider === 'openai' ? openAiResult.model : scriptElementModel;

    return {
      data: { text: text.trim() },
      meta: {
        debug: buildKindDebugMeta({
          traceMeta,
          kind,
          provider,
          model: finalModel,
          timeoutMs,
          upstreamContext,
          maxOutputTokens: provider === 'openai'
            ? responsePayload.finalMaxOutputTokens
            : 100,
          styleSource: resolvedStyle.styleContext,
          instructionPreview,
          contextPreview,
          promptPreview: requestPromptParts.previewText,
          requestMetrics: responsePayload
        })
      }
    };
  }

  if (kind === 'regenerateScriptBlock') {
    const { block, genre, premise, rewriteGuidance } = context;
    const resolvedStyle = resolvePromptStyleContext(context);
    const promptParts = buildRegenerateBlockPrompt({
      type: block.type,
      character: block.character,
      genre,
      premise,
      text: block.text,
      style: resolvedStyle.styleContext,
      rewriteGuidance
    });
    const rewriteModel = provider === 'openai' ? models.openai : models.gemini;
    const instructionPreview = {
      task: 'Rewrite the existing screenplay block',
      rewriteGuidance: rewriteGuidance || ''
    };
    const contextPreview = {
      genre,
      premise,
      styleId: resolvedStyle.styleId,
      styleName: resolvedStyle.styleName,
      styleContext: resolvedStyle.styleContext,
      ...(resolvedStyle.styleId ? {} : { style: resolvedStyle.legacyStyle }),
      blockType: block.type,
      character: block.character || null,
      originalText: block.text
    };
    emitKindPromptTrace({
      traceMeta,
      kind,
      provider,
      model: rewriteModel,
      timeoutMs,
      upstreamContext,
      maxOutputTokens: 150,
      styleSource: resolvedStyle.styleContext,
      instructionPreview,
      contextPreview
    });

    const openAiResult = provider === 'openai'
      ? await runOpenAiWithSemanticPromotion({
          kind,
          initialModel: models.openai,
          promotedModel: openAiFlowPolicy.promotedModel,
          executeAttempt: async (model) => {
            const responsePayload = await requestOpenAiText({
              openai,
              kind,
              model,
              promptParts,
              reasoningEffort: openAiFlowPolicy.reasoningEffort,
              maxOutputTokens: 150,
              temperature: 0.82,
              topP: 0.95,
              cacheKey: buildPromptCacheKey(kind, block.type, model),
              cacheRetention: DEFAULT_OPENAI_PROMPT_CACHE_RETENTION,
              upstreamContext,
              timeoutMs
            });
            return {
              responsePayload,
              text: validateGeneratedTextResponse(kind, responsePayload.text),
              model
            };
          }
        })
      : null;
    const responsePayload = provider === 'openai'
      ? openAiResult.responsePayload
      : await requestGeminiText({
          geminiAi,
          kind,
          model: models.gemini,
          ...resolveGeminiPromptRequest({
            promptParts,
            config: {
            maxOutputTokens: 150,
            temperature: 0.8
            }
          }),
          upstreamContext,
          timeoutMs
        });
    const text = provider === 'openai' ? openAiResult.text : responsePayload.text;
    const finalModel = provider === 'openai' ? openAiResult.model : rewriteModel;

    return {
      data: { text: text.trim() || block.text },
      meta: {
        debug: buildKindDebugMeta({
          traceMeta,
          kind,
          provider,
          model: finalModel,
          timeoutMs,
          upstreamContext,
          maxOutputTokens: provider === 'openai'
            ? responsePayload.finalMaxOutputTokens
            : 150,
          styleSource: resolvedStyle.styleContext,
          instructionPreview,
          contextPreview,
          promptPreview: promptParts.previewText,
          requestMetrics: responsePayload
        })
      }
    };
  }

  const canonicalStyle = resolveLibraryStyleById(context.styleId);
  const resolvedStyleId = canonicalStyle?.id || '';
  const resolvedStyleName = canonicalStyle?.title || (
    typeof context.styleName === 'string' ? context.styleName.trim() : ''
  );
  const legacyStyle = typeof context.style === 'string' ? context.style.trim() : '';

  const promptParts = buildSurpriseSetupPrompt({
    targetGenre: context.targetGenre,
    genres,
    style: {
      styleId: resolvedStyleId,
      styleName: resolvedStyleName || legacyStyle,
      styleGuidance: canonicalStyle?.description || '',
      legacyStyle
    }
  });
  const surpriseModel = provider === 'openai' ? models.openai : models.gemini;
  const instructionPreview = {
    task: 'Generate a surprise setup JSON payload',
    targetGenreRequired: Boolean(context.targetGenre)
  };
  const contextPreview = {
    targetGenre: context.targetGenre || null,
    styleId: resolvedStyleId || null,
    styleName: resolvedStyleName || '',
    ...(resolvedStyleId ? {} : { style: legacyStyle }),
    allowedGenres: genres
  };
  const styleFingerprintSource = [
    resolvedStyleId,
    resolvedStyleName,
    canonicalStyle?.description || '',
    legacyStyle
  ].filter(Boolean).join('|');
  emitKindPromptTrace({
    traceMeta,
    kind,
    provider,
    model: surpriseModel,
    timeoutMs,
    upstreamContext,
    maxOutputTokens: 350,
    styleSource: styleFingerprintSource,
    instructionPreview,
    contextPreview
  });

  const openAiResult = provider === 'openai'
    ? await runOpenAiWithSemanticPromotion({
        kind,
        initialModel: models.openai,
        promotedModel: openAiFlowPolicy.promotedModel,
        executeAttempt: async (model) => {
          const responsePayload = await requestOpenAiText({
            openai,
            kind,
            model,
            promptParts,
            reasoningEffort: openAiFlowPolicy.reasoningEffort,
            maxOutputTokens: 350,
            temperature: 0.95,
            topP: 0.98,
            cacheKey: buildPromptCacheKey(kind, context.targetGenre ? 'targeted' : 'freeform', model),
            cacheRetention: DEFAULT_OPENAI_PROMPT_CACHE_RETENTION,
            jsonSchemaFormat: {
              name: 'surprise_setup_output',
              description: 'Structured surprise setup response.',
              schema: SURPRISE_SETUP_JSON_SCHEMA
            },
            upstreamContext,
            timeoutMs
          });
          return {
            responsePayload,
            data: validateSurpriseSetupResponseData(kind, parseJsonObject(responsePayload.text, kind)),
            model
          };
        }
      })
    : null;
  const responsePayload = provider === 'openai'
    ? openAiResult.responsePayload
    : await requestGeminiText({
        geminiAi,
        kind,
        model: models.gemini,
        ...resolveGeminiPromptRequest({
          promptParts,
          config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              genre: { type: Type.STRING },
              premise: { type: Type.STRING },
              characters: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ['genre', 'premise', 'characters']
          }
          }
        }),
        upstreamContext,
        timeoutMs
      });
  const rawText = responsePayload.text;
  const finalModel = provider === 'openai' ? openAiResult.model : surpriseModel;
  const surpriseData = provider === 'openai'
    ? openAiResult.data
    : parseJsonObject(rawText, kind);

  return {
    data: surpriseData,
    meta: {
      debug: buildKindDebugMeta({
        traceMeta,
        kind,
        provider,
        model: finalModel,
        timeoutMs,
        upstreamContext,
        maxOutputTokens: provider === 'openai'
          ? responsePayload.finalMaxOutputTokens
          : null,
        styleSource: styleFingerprintSource,
        instructionPreview,
        contextPreview,
        promptPreview: promptParts.previewText,
        requestMetrics: responsePayload
      })
    }
  };
};
