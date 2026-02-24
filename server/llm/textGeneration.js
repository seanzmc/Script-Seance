import { Type } from '@google/genai';
import crypto from 'node:crypto';
import {
  SCRIPT_ELEMENT_SYSTEM_INSTRUCTION,
  buildGenerateScenePrompt,
  buildPlotTwistPrompt,
  buildScriptElementPrompt,
  buildRegenerateBlockPrompt,
  buildSurpriseSetupPrompt
} from './promptBuilders.js';
import { getTextModels } from './llmClient.js';
import { isTextGenerationKind } from './types.js';
import {
  runWithAbortableTimeout,
  runWithRetry,
  isRetryableUpstreamError
} from '../upstreamControl.js';
import {
  createStyleFingerprint,
  emitPromptTrace
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
const OPENAI_SCENE_MINI_MODEL_MIN_OUTPUT_TOKENS = parsePositiveInt(
  process.env.OPENAI_SCENE_MINI_MODEL_MIN_OUTPUT_TOKENS,
  2600
);
const OPENAI_SCENE_USE_MINI_FOR_LONG = (process.env.OPENAI_SCENE_USE_MINI_FOR_LONG || '1') !== '0';
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
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: ['heading', 'action', 'dialogue', 'transition'] },
          character: { type: ['string', 'null'] },
          parenthetical: { type: ['string', 'null'] },
          text: { type: 'string' }
        },
        required: ['type', 'character', 'parenthetical', 'text']
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

const createInvalidAiResponseError = (kind, reason) => {
  const error = new Error('AI response did not match expected format.');
  error.code = 'INVALID_AI_RESPONSE';
  error.details = { kind, reason };
  return error;
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

const createOpenAiInput = (prompt, systemInstruction) => {
  const input = [];
  if (systemInstruction) {
    input.push({
      role: 'system',
      content: [{ type: 'input_text', text: systemInstruction }]
    });
  }
  input.push({
    role: 'user',
    content: [{ type: 'input_text', text: prompt }]
  });
  return input;
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
const getReasoningEffortForModel = (model) => {
  if (isGpt52OrGpt51Model(model)) return 'none';
  if (isLegacyGpt5Model(model)) return 'minimal';
  return undefined;
};
const shouldApplySamplingControls = (model, reasoningEffort) => {
  if (!isLegacyGpt5Model(model)) return true;
  if (isGpt52OrGpt51Model(model) && reasoningEffort === 'none') return true;
  return false;
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
const resolveSceneModel = (models, lengthProfile, sceneMaxOutputTokens) => {
  const baseModel = models?.openai;
  const balancedModel = models?.openaiBalanced || baseModel;
  const shouldUseBalancedForLength = OPENAI_SCENE_USE_MINI_FOR_LONG && lengthProfile?.key === 'long';
  const shouldUseBalancedForBudget = sceneMaxOutputTokens >= OPENAI_SCENE_MINI_MODEL_MIN_OUTPUT_TOKENS;
  return shouldUseBalancedForLength || shouldUseBalancedForBudget ? balancedModel : baseModel;
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

const getSceneSummariesPreview = (scenes) => (
  Array.isArray(scenes)
    ? scenes
      .map((scene, index) => {
        const summary = typeof scene?.summary === 'string' ? scene.summary.trim() : '';
        return summary ? `Scene ${index + 1}: ${summary}` : null;
      })
      .filter(Boolean)
      .slice(0, 6)
    : []
);

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
    contextPreview
  });
};

const requestOpenAiText = async ({
  openai,
  kind,
  model,
  prompt,
  systemInstruction,
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
  const reasoningEffort = getReasoningEffortForModel(model);
  const shouldApplySampling = shouldApplySamplingControls(model, reasoningEffort);
  const startedAt = Date.now();
  let attempt = 0;
  let outputTokenLimit = maxOutputTokens;

  while (true) {
    const requestPayload = {
      model,
      input: createOpenAiInput(prompt, systemInstruction),
      max_output_tokens: outputTokenLimit,
      store: false,
      prompt_cache_key: cacheKey || buildPromptCacheKey(kind, undefined, model)
    };
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
    return text;
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
  return text;
};

export const getPromptSizeEstimate = ({ kind, context, genres }) => {
  if (!isTextGenerationKind(kind) || !context || typeof context !== 'object') {
    return 0;
  }

  if (kind === 'generateScene') {
    const { storyContext, userInstruction, isFirstScene } = context;
    const { promptSize } = buildGenerateScenePrompt({
      genre: storyContext?.genre || '',
      premise: storyContext?.premise || '',
      characters: storyContext?.characters || [],
      scenes: storyContext?.scenes || [],
      userInstruction: userInstruction || '',
      isFirstScene: Boolean(isFirstScene),
      style: storyContext?.style || '',
      targetLength: storyContext?.targetLength || ''
    });
    return promptSize;
  }

  if (kind === 'suggestPlotTwist') {
    return buildPlotTwistPrompt(context.genre || '', context.style || '').length;
  }

  if (kind === 'generateScriptElement') {
    return buildScriptElementPrompt({
      type: context.type,
      character: context.character,
      instruction: context.instruction || '',
      styleContext: context.styleContext || ''
    }).length;
  }

  if (kind === 'regenerateScriptBlock') {
    return buildRegenerateBlockPrompt({
      type: context.block?.type,
      character: context.block?.character,
      genre: context.genre || '',
      premise: context.premise || '',
      text: context.block?.text || '',
      style: context.style || '',
      rewriteGuidance: context.rewriteGuidance
    }).length;
  }

  if (kind === 'generateSurpriseSetup') {
    return buildSurpriseSetupPrompt({
      targetGenre: context.targetGenre,
      genres,
      style: context.style || ''
    }).length;
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

  const models = getTextModels(kind);
  const traceMeta = upstreamContext?.promptTrace;

  if (kind === 'generateScene') {
    const { storyContext, userInstruction, isFirstScene } = context;
    const { prompt, lengthProfile } = buildGenerateScenePrompt({
      genre: storyContext.genre,
      premise: storyContext.premise,
      characters: storyContext.characters,
      scenes: storyContext.scenes,
      userInstruction,
      isFirstScene,
      style: storyContext.style,
      targetLength: storyContext.targetLength
    });
    const sceneMaxOutputTokens = resolveSceneMaxOutputTokens(lengthProfile);
    const sceneModel = provider === 'openai'
      ? resolveSceneModel(models, lengthProfile, sceneMaxOutputTokens)
      : models.gemini;
    emitKindPromptTrace({
      traceMeta,
      kind,
      provider,
      model: sceneModel,
      timeoutMs,
      upstreamContext,
      maxOutputTokens: sceneMaxOutputTokens,
      styleSource: storyContext.style,
      instructionPreview: {
        task: isFirstScene ? 'Write opening scene' : 'Write next scene',
        userInstruction
      },
      contextPreview: {
        genre: storyContext.genre,
        premise: storyContext.premise,
        characters: storyContext.characters,
        targetLength: storyContext.targetLength || lengthProfile.label,
        previousSceneSummaries: getSceneSummariesPreview(storyContext.scenes)
      }
    });

    const rawText = provider === 'openai'
      ? await requestOpenAiText({
          openai,
          kind,
          model: sceneModel,
          prompt,
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
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                heading: { type: Type.STRING },
                summary: { type: Type.STRING },
                blocks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      type: { type: Type.STRING, enum: ['heading', 'action', 'dialogue', 'transition'] },
                      character: { type: Type.STRING, nullable: true },
                      parenthetical: { type: Type.STRING, nullable: true },
                      text: { type: Type.STRING }
                    },
                    required: ['type', 'text']
                  }
                }
              },
              required: ['heading', 'summary', 'blocks']
            }
          },
          upstreamContext,
          timeoutMs
        });

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
          : []
      }
    };
  }

  if (kind === 'suggestPlotTwist') {
    const prompt = buildPlotTwistPrompt(context.genre, context.style);
    emitKindPromptTrace({
      traceMeta,
      kind,
      provider,
      model: provider === 'openai' ? models.openai : models.gemini,
      timeoutMs,
      upstreamContext,
      maxOutputTokens: 90,
      styleSource: context.style || '',
      instructionPreview: {
        task: 'Give one shocking, single-sentence plot twist'
      },
      contextPreview: {
        genre: context.genre,
        style: context.style || ''
      }
    });
    const text = provider === 'openai'
      ? await requestOpenAiText({
          openai,
          kind,
          model: models.openai,
          prompt,
          maxOutputTokens: 90,
          temperature: 0.92,
          topP: 0.98,
          cacheKey: buildPromptCacheKey(kind, undefined, models.openai),
          cacheRetention: DEFAULT_OPENAI_PROMPT_CACHE_RETENTION,
          upstreamContext,
          timeoutMs
        })
      : await requestGeminiText({
          geminiAi,
          kind,
          model: models.gemini,
          contents: prompt,
          upstreamContext,
          timeoutMs
        });

    return { data: { text: text || 'Suddenly, everything changes.' } };
  }

  if (kind === 'generateScriptElement') {
    const { type, character, instruction, styleContext } = context;
    const prompt = buildScriptElementPrompt({ type, character, instruction, styleContext });
    emitKindPromptTrace({
      traceMeta,
      kind,
      provider,
      model: provider === 'openai' ? models.openai : models.gemini,
      timeoutMs,
      upstreamContext,
      maxOutputTokens: 100,
      styleSource: styleContext,
      instructionPreview: {
        task: 'Generate one script element block',
        instruction
      },
      contextPreview: {
        type,
        character,
        styleContext
      }
    });

    const text = provider === 'openai'
      ? await requestOpenAiText({
          openai,
          kind,
          model: models.openai,
          prompt,
          systemInstruction: SCRIPT_ELEMENT_SYSTEM_INSTRUCTION,
          maxOutputTokens: 100,
          temperature: 0.72,
          topP: 0.92,
          cacheKey: buildPromptCacheKey(kind, type, models.openai),
          cacheRetention: DEFAULT_OPENAI_PROMPT_CACHE_RETENTION,
          upstreamContext,
          timeoutMs
        })
      : await requestGeminiText({
          geminiAi,
          kind,
          model: models.gemini,
          contents: prompt,
          config: {
            systemInstruction: SCRIPT_ELEMENT_SYSTEM_INSTRUCTION,
            maxOutputTokens: 100,
            temperature: 0.7
          },
          upstreamContext,
          timeoutMs
        });

    return { data: { text: text.trim() } };
  }

  if (kind === 'regenerateScriptBlock') {
    const { block, genre, premise, style, rewriteGuidance } = context;
    const prompt = buildRegenerateBlockPrompt({
      type: block.type,
      character: block.character,
      genre,
      premise,
      text: block.text,
      style,
      rewriteGuidance
    });
    emitKindPromptTrace({
      traceMeta,
      kind,
      provider,
      model: provider === 'openai' ? models.openai : models.gemini,
      timeoutMs,
      upstreamContext,
      maxOutputTokens: 150,
      styleSource: style || '',
      instructionPreview: {
        task: 'Rewrite the existing screenplay block',
        rewriteGuidance: rewriteGuidance || ''
      },
      contextPreview: {
        genre,
        premise,
        style: style || '',
        blockType: block.type,
        character: block.character || null,
        originalText: block.text
      }
    });

    const text = provider === 'openai'
      ? await requestOpenAiText({
          openai,
          kind,
          model: models.openai,
          prompt,
          maxOutputTokens: 150,
          temperature: 0.82,
          topP: 0.95,
          cacheKey: buildPromptCacheKey(kind, block.type, models.openai),
          cacheRetention: DEFAULT_OPENAI_PROMPT_CACHE_RETENTION,
          upstreamContext,
          timeoutMs
        })
      : await requestGeminiText({
          geminiAi,
          kind,
          model: models.gemini,
          contents: prompt,
          config: {
            maxOutputTokens: 150,
            temperature: 0.8
          },
          upstreamContext,
          timeoutMs
        });

    return { data: { text: text.trim() || block.text } };
  }

  const prompt = buildSurpriseSetupPrompt({
    targetGenre: context.targetGenre,
    genres,
    style: context.style
  });
  emitKindPromptTrace({
    traceMeta,
    kind,
    provider,
    model: provider === 'openai' ? models.openai : models.gemini,
    timeoutMs,
    upstreamContext,
    maxOutputTokens: 350,
    styleSource: context.style || '',
    instructionPreview: {
      task: 'Generate a surprise setup JSON payload',
      targetGenreRequired: Boolean(context.targetGenre)
    },
    contextPreview: {
      targetGenre: context.targetGenre || null,
      style: context.style || '',
      allowedGenres: genres
    }
  });

  const rawText = provider === 'openai'
    ? await requestOpenAiText({
        openai,
        kind,
        model: models.openai,
        prompt,
        maxOutputTokens: 350,
        temperature: 0.95,
        topP: 0.98,
        cacheKey: buildPromptCacheKey(kind, context.targetGenre ? 'targeted' : 'freeform', models.openai),
        cacheRetention: DEFAULT_OPENAI_PROMPT_CACHE_RETENTION,
        jsonSchemaFormat: {
          name: 'surprise_setup_output',
          description: 'Structured surprise setup response.',
          schema: SURPRISE_SETUP_JSON_SCHEMA
        },
        upstreamContext,
        timeoutMs
      })
    : await requestGeminiText({
        geminiAi,
        kind,
        model: models.gemini,
        contents: prompt,
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
        },
        upstreamContext,
        timeoutMs
      });

  return {
    data: parseJsonObject(rawText, kind)
  };
};
