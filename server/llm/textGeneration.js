import { Type } from '@google/genai';
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

const OPENAI_PROMPT_CACHE_PREFIX = 'script-seance:text-gen';
const DEFAULT_OPENAI_PROMPT_CACHE_RETENTION = process.env.OPENAI_PROMPT_CACHE_RETENTION || '24h';

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
    throw createInvalidAiResponseError(kind, 'Invalid JSON payload.');
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
  if (normalized === 'in_memory') return 'in_memory';
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
  const modelSegment = normalizeModelName(model).replace(/[^a-z0-9.-]/g, '');
  return `${OPENAI_PROMPT_CACHE_PREFIX}:${modelSegment || 'model'}:${kind}${suffix}:v1`;
};
const getCachedInputTokens = (response) =>
  response?.usage?.input_tokens_details?.cached_tokens ??
  response?.usage?.prompt_tokens_details?.cached_tokens ??
  response?.usage?.input_tokens_details?.cachedTokens ??
  0;

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
  withTimeout,
  timeoutMs
}) => {
  const reasoningEffort = getReasoningEffortForModel(model);
  const shouldApplySampling = shouldApplySamplingControls(model, reasoningEffort);
  const requestPayload = {
    model,
    input: createOpenAiInput(prompt, systemInstruction),
    max_output_tokens: maxOutputTokens,
    store: false,
    prompt_cache_key: cacheKey || buildPromptCacheKey(kind, undefined, model)
  };

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

  const startedAt = Date.now();
  const response = await withTimeout(openai.responses.create(requestPayload), timeoutMs);

  const latencyMs = Date.now() - startedAt;
  const cachedInputTokens = getCachedInputTokens(response);
  const totalInputTokens = response?.usage?.input_tokens ?? response?.usage?.prompt_tokens ?? 0;
  const cacheHitRatio = totalInputTokens > 0
    ? Number((cachedInputTokens / totalInputTokens).toFixed(3))
    : 0;
  console.info('[text-gen] completed', {
    kind,
    provider: 'openai',
    model,
    latencyMs,
    cachedInputTokens,
    cacheHitRatio
  });

  const text = extractOpenAiText(response);
  if (!text || !text.trim()) {
    throw new Error('No response from AI');
  }
  return text;
};

const requestGeminiText = async ({
  geminiAi,
  kind,
  model,
  contents,
  config,
  withTimeout,
  timeoutMs
}) => {
  const startedAt = Date.now();
  const response = await withTimeout(geminiAi.models.generateContent({
    model,
    contents,
    ...(config ? { config } : {})
  }), timeoutMs);

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
      isFirstScene: Boolean(isFirstScene)
    });
    return promptSize;
  }

  if (kind === 'suggestPlotTwist') {
    return buildPlotTwistPrompt(context.genre || '').length;
  }

  if (kind === 'generateScriptElement') {
    return `${context.instruction || ''}\n${context.styleContext || ''}`.length;
  }

  if (kind === 'regenerateScriptBlock') {
    const guidanceText = typeof context.rewriteGuidance === 'string' ? context.rewriteGuidance.trim() : '';
    return `${context.premise || ''}\n${context.block?.text || ''}\n${guidanceText}`.length;
  }

  if (kind === 'generateSurpriseSetup') {
    return buildSurpriseSetupPrompt({
      targetGenre: context.targetGenre,
      genres
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
  withTimeout,
  timeoutMs
}) => {
  if (!isTextGenerationKind(kind)) {
    throw new Error(`Unsupported text generation kind: ${kind}`);
  }

  const models = getTextModels(kind);

  if (kind === 'generateScene') {
    const { storyContext, userInstruction, isFirstScene } = context;
    const { prompt } = buildGenerateScenePrompt({
      genre: storyContext.genre,
      premise: storyContext.premise,
      characters: storyContext.characters,
      scenes: storyContext.scenes,
      userInstruction,
      isFirstScene
    });

    const rawText = provider === 'openai'
      ? await requestOpenAiText({
          openai,
          kind,
          model: models.openai,
          prompt,
          maxOutputTokens: 1400,
          temperature: 0.82,
          topP: 0.95,
          cacheKey: buildPromptCacheKey(kind, isFirstScene ? 'opening' : 'next', models.openai),
          cacheRetention: DEFAULT_OPENAI_PROMPT_CACHE_RETENTION,
          withTimeout,
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
          withTimeout,
          timeoutMs
        });

    const data = parseJsonObject(rawText, kind);
    return {
      data,
      meta: {
        rawAiResponse: rawText,
        parsedAiKeys: data && typeof data === 'object' ? Object.keys(data) : []
      }
    };
  }

  if (kind === 'suggestPlotTwist') {
    const prompt = buildPlotTwistPrompt(context.genre);
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
          withTimeout,
          timeoutMs
        })
      : await requestGeminiText({
          geminiAi,
          kind,
          model: models.gemini,
          contents: prompt,
          withTimeout,
          timeoutMs
        });

    return { data: { text: text || 'Suddenly, everything changes.' } };
  }

  if (kind === 'generateScriptElement') {
    const { type, character, instruction, styleContext } = context;
    const prompt = buildScriptElementPrompt({ type, character, instruction, styleContext });

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
          withTimeout,
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
          withTimeout,
          timeoutMs
        });

    return { data: { text: text.trim() } };
  }

  if (kind === 'regenerateScriptBlock') {
    const { block, genre, premise, rewriteGuidance } = context;
    const prompt = buildRegenerateBlockPrompt({
      type: block.type,
      character: block.character,
      genre,
      premise,
      text: block.text,
      rewriteGuidance
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
          withTimeout,
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
          withTimeout,
          timeoutMs
        });

    return { data: { text: text.trim() || block.text } };
  }

  const prompt = buildSurpriseSetupPrompt({
    targetGenre: context.targetGenre,
    genres
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
        withTimeout,
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
        withTimeout,
        timeoutMs
      });

  return {
    data: parseJsonObject(rawText, kind)
  };
};
