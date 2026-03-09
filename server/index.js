import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import cookie from 'cookie';
import {
  getGeminiClient,
  getOpenAIClient,
  getTextProvider
} from './llm/llmClient.js';
import { generateTextByKind, getPromptSizeEstimate } from './llm/textGeneration.js';
import { isTextGenerationKind } from './llm/types.js';
import {
  createStyleFingerprint,
  buildPromptPreviewValue,
  emitPromptTrace,
  isPromptTraceServerEnabled,
  resolvePromptTraceMeta
} from './llm/promptTrace.js';
import { CANONICAL_GENRES, isCanonicalGenre } from './llm/genreCatalog.js';
import {
  applyExpressiveText,
  extractAudioBase64FromPayload,
  collectAudioFromStreamBody,
  parseInworldVoiceList,
  limitInworldVoices,
  normalizeInworldVoice,
  dedupeVoices,
  isInworldVoiceFetchErrorRecoverable
} from './ttsProviders.js';
import {
  createRequestAbortedError,
  runWithAbortableTimeout,
  runWithRetry,
  isAbortError,
  isRetryableUpstreamError
} from './upstreamControl.js';

const app = express();
app.disable('x-powered-by');

const BODY_LIMIT = '64kb';
const PORT = process.env.PORT || 3001;
const SESSION_COOKIE_NAME = 'ss_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const IS_PROD = process.env.NODE_ENV === 'production';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
app.set('trust proxy', TRUST_PROXY ? 1 : false);
const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];
const AI_RPM = parsePositiveInt(process.env.AI_RPM, 30);
const AI_RPD = parsePositiveInt(process.env.AI_RPD, 500);
const MAX_PROMPT_CHARS = parsePositiveInt(process.env.AI_MAX_PROMPT_CHARS, 8000);
const AI_UPSTREAM_TIMEOUT_MS = parsePositiveInt(process.env.AI_UPSTREAM_TIMEOUT_MS, 30000);
const AI_UPSTREAM_TIMEOUT_MS_SCENE = parsePositiveInt(
  process.env.AI_UPSTREAM_TIMEOUT_MS_SCENE,
  Math.max(AI_UPSTREAM_TIMEOUT_MS, 90000)
);
const AI_UPSTREAM_RETRY_MAX_RETRIES = parseNonNegativeInt(process.env.AI_UPSTREAM_RETRY_MAX_RETRIES, 2);
const AI_UPSTREAM_RETRY_BASE_DELAY_MS = parseNonNegativeInt(process.env.AI_UPSTREAM_RETRY_BASE_DELAY_MS, 250);
const AI_UPSTREAM_RETRY_MAX_DELAY_MS = parseNonNegativeInt(process.env.AI_UPSTREAM_RETRY_MAX_DELAY_MS, 4000);
const AI_UPSTREAM_RETRY_JITTER_MS = parseNonNegativeInt(process.env.AI_UPSTREAM_RETRY_JITTER_MS, 150);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const RATE_LIMIT_MINUTE_MS = 60 * 1000;
const RATE_LIMIT_DAY_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = parsePositiveInt(process.env.MAP_CLEANUP_INTERVAL_MS, 20 * 60 * 1000);
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const LOGIN_BUCKET_TTL_MS = LOGIN_WINDOW_MS * 2;
const TTS_INWORLD_MODEL = process.env.TTS_INWORLD_MODEL || 'inworld-tts-1.5-max';
const INWORLD_API_KEY = process.env.INWORLD_API_KEY || '';
const INWORLD_API_SECRET = process.env.INWORLD_API_SECRET || '';
const INWORLD_WORKSPACE_ID = process.env.INWORLD_WORKSPACE_ID || '';
const INWORLD_API_BASE = process.env.INWORLD_API_BASE || 'https://api.inworld.ai';
const INWORLD_ENGINE_HOST = process.env.INWORLD_ENGINE_HOST || 'api-engine.inworld.ai';
const INWORLD_MAX_ENGLISH_VOICES = parsePositiveInt(process.env.INWORLD_MAX_ENGLISH_VOICES, 10);
const VOICE_CATALOG_CACHE_TTL_MS = parsePositiveInt(process.env.VOICE_CATALOG_CACHE_TTL_MS, 5 * 60 * 1000);
const INWORLD_JWT_REFRESH_BUFFER_MS = parsePositiveInt(process.env.INWORLD_JWT_REFRESH_BUFFER_MS, 60 * 1000);
const INWORLD_TOKEN_METHOD = 'ai.inworld.engine.WorldEngine/GenerateToken';
const ALLOWED_ORIGINS = new Set(parseAllowedOrigins(process.env.ALLOWED_ORIGINS));

const VALID_BLOCK_TYPES = new Set(['heading', 'action', 'dialogue', 'transition']);
const VALID_SCENE_BLOCK_TYPES = new Set(['action', 'dialogue', 'transition']);
const VALID_REWRITE_BLOCK_TYPES = new Set(['action', 'dialogue', 'transition']);
const VALID_SCENE_LENGTHS = new Set(['Short', 'Medium', 'Long']);
const sessions = new Map();
const rateBuckets = new Map();
const loginBuckets = new Map();
const MAX_SCENE_HEADING_CHARS = 200;
const MAX_SCENE_SUMMARY_CHARS = 2000;
const MAX_SCENE_BLOCKS = 200;
const MAX_BLOCK_TEXT_CHARS = 4000;
const MAX_BLOCK_CHARACTER_CHARS = 120;
const MAX_BLOCK_PARENTHETICAL_CHARS = 240;
const MAX_PREMISE_CHARS = 4000;
const MAX_GENRE_CHARS = 120;
const MAX_CHARACTERS = 12;
const MAX_AUDIO_BASE64_CHARS = 5 * 1024 * 1024;
const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'"
].join('; ');
const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP_HEADER,
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
  'X-Frame-Options': 'DENY'
};

if (IS_PROD) {
  app.use((req, res, next) => {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(key, value);
    }
    next();
  });
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeOrigin(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed;
  }
}

function parseAllowedOrigins(value) {
  const source = typeof value === 'string' && value.trim().length > 0
    ? value
    : DEFAULT_ALLOWED_ORIGINS.join(',');
  return source
    .split(',')
    .map((entry) => normalizeOrigin(entry))
    .filter(Boolean);
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value, max = 4000) => (
  typeof value === 'string' && value.trim().length > 0 && value.length <= max
);
const isStringWithin = (value, max) => typeof value === 'string' && value.length <= max;

const isValidSceneBlock = (block) => {
  if (!isObject(block)) return false;
  if (!VALID_SCENE_BLOCK_TYPES.has(block.type)) return false;
  if (!isStringWithin(block.text, MAX_BLOCK_TEXT_CHARS)) return false;

  const hasCharacterField = block.character !== undefined;
  const hasParentheticalField = block.parenthetical !== undefined;

  if (block.type === 'dialogue') {
    if (!isNonEmptyString(block.character, MAX_BLOCK_CHARACTER_CHARS)) return false;
    if (hasParentheticalField && block.parenthetical !== null) {
      if (!isStringWithin(block.parenthetical, MAX_BLOCK_PARENTHETICAL_CHARS)) return false;
    }
    return true;
  }

  return !hasCharacterField && !hasParentheticalField;
};

const validateAiResponse = (kind, data) => {
  if (!isObject(data)) {
    return { ok: false, reason: 'Response was not an object.' };
  }

  if (kind === 'generateScene') {
    if (!isNonEmptyString(data.heading, MAX_SCENE_HEADING_CHARS)) {
      return { ok: false, reason: 'Scene heading missing or too long.' };
    }
    if (!isNonEmptyString(data.summary, MAX_SCENE_SUMMARY_CHARS)) {
      return { ok: false, reason: 'Scene summary missing or too long.' };
    }
    if (!Array.isArray(data.blocks) || data.blocks.length > MAX_SCENE_BLOCKS) {
      return { ok: false, reason: 'Scene blocks missing or too many.' };
    }
    if (!data.blocks.every(isValidSceneBlock)) {
      return { ok: false, reason: 'Scene blocks invalid.' };
    }
    return { ok: true };
  }

  if (kind === 'generateSurpriseSetup') {
    if (!isNonEmptyString(data.genre, MAX_GENRE_CHARS)) {
      return { ok: false, reason: 'Genre missing or too long.' };
    }
    if (!isNonEmptyString(data.premise, MAX_PREMISE_CHARS)) {
      return { ok: false, reason: 'Premise missing or too long.' };
    }
    if (!Array.isArray(data.characters) || data.characters.length === 0 || data.characters.length > MAX_CHARACTERS) {
      return { ok: false, reason: 'Characters missing or invalid.' };
    }
    if (!data.characters.every((char) => isNonEmptyString(char, MAX_BLOCK_CHARACTER_CHARS))) {
      return { ok: false, reason: 'Character list invalid.' };
    }
    return { ok: true };
  }

  if (kind === 'generateScriptElement' || kind === 'regenerateScriptBlock') {
    if (!isStringWithin(data.text, MAX_BLOCK_TEXT_CHARS)) {
      return { ok: false, reason: 'Script text missing or too long.' };
    }
    return { ok: true };
  }

  if (kind === 'generateSpeech') {
    if (!isStringWithin(data.audioBase64, MAX_AUDIO_BASE64_CHARS)) {
      return { ok: false, reason: 'Audio payload missing or too large.' };
    }
    return { ok: true };
  }

  if (kind === 'listVoices') {
    if (!Array.isArray(data.voices)) {
      return { ok: false, reason: 'Voice catalog missing or invalid.' };
    }
    return { ok: true };
  }

  if (kind === 'suggestPlotTwist') {
    if (!isStringWithin(data.text, MAX_BLOCK_TEXT_CHARS)) {
      return { ok: false, reason: 'Plot twist missing or too long.' };
    }
    return { ok: true };
  }

  return { ok: true };
};

const voiceCatalogCache = {
  expiresAt: 0,
  voices: []
};
const inworldJwtCache = {
  token: '',
  expiresAt: 0,
  pending: null
};

const hasInworldTtsCredentials = () => Boolean(INWORLD_API_KEY && INWORLD_API_SECRET && INWORLD_WORKSPACE_ID);

const createUpstreamError = (message, status, code, details) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details) {
    error.details = details;
  }
  return error;
};

const createRetryPolicy = (signal, overrides = undefined) => ({
  maxRetries: overrides?.maxRetries ?? AI_UPSTREAM_RETRY_MAX_RETRIES,
  baseDelayMs: overrides?.baseDelayMs ?? AI_UPSTREAM_RETRY_BASE_DELAY_MS,
  maxDelayMs: overrides?.maxDelayMs ?? AI_UPSTREAM_RETRY_MAX_DELAY_MS,
  jitterMs: overrides?.jitterMs ?? AI_UPSTREAM_RETRY_JITTER_MS,
  isRetryableError: overrides?.isRetryableError ?? isRetryableUpstreamError,
  signal: signal ?? overrides?.signal
});

const removeListener = (target, eventName, listener) => {
  if (!target || typeof listener !== 'function') return;
  if (typeof target.off === 'function') {
    target.off(eventName, listener);
  } else if (typeof target.removeListener === 'function') {
    target.removeListener(eventName, listener);
  }
};

const attachRequestAbortSignal = (req, res) => {
  const controller = new AbortController();
  const abortWith = (reason) => {
    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
  };
  const onAborted = () => abortWith(createRequestAbortedError('Client canceled request.'));
  const onResponseClose = () => {
    if (!res?.writableEnded) {
      abortWith(createRequestAbortedError('Client connection closed.'));
    }
  };

  if (req && typeof req.on === 'function') {
    req.on('aborted', onAborted);
  }
  if (res && typeof res.on === 'function') {
    res.on('close', onResponseClose);
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      removeListener(req, 'aborted', onAborted);
      removeListener(res, 'close', onResponseClose);
    }
  };
};

const waitForPromiseOrAbort = async (promise, signal) => {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    throw signal.reason ?? createRequestAbortedError();
  }
  return await new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(signal.reason ?? createRequestAbortedError());
    };
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
  });
};

const parseJsonSafe = (text) => {
  if (!text || typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const mapUpstreamStatusToErrorCode = (status) => {
  if (status === 401 || status === 403) return 'UPSTREAM_UNAUTHORIZED';
  if (status === 404) return 'UPSTREAM_NOT_FOUND';
  if (status === 408 || status === 504) return 'UPSTREAM_TIMEOUT';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'UPSTREAM_ERROR';
  return 'UPSTREAM_BAD_REQUEST';
};

const getInworldWorkspaceResource = () => (
  INWORLD_WORKSPACE_ID.startsWith('workspaces/')
    ? INWORLD_WORKSPACE_ID
    : `workspaces/${INWORLD_WORKSPACE_ID}`
);

const formatInworldDateTime = (date = new Date()) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  const second = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hour}${minute}${second}`;
};

const getInworldHost = () => {
  try {
    return new URL(INWORLD_API_BASE).host;
  } catch {
    return 'api.inworld.ai';
  }
};

const getInworldEngineHost = () => {
  const host = typeof INWORLD_ENGINE_HOST === 'string' ? INWORLD_ENGINE_HOST.trim() : '';
  return host.replace(':443', '') || 'api-engine.inworld.ai';
};

const getSignatureKey = (secret, params) => {
  let signature = Buffer.from(`IW1${secret}`, 'utf8');
  for (const param of params) {
    signature = crypto.createHmac('sha256', signature).update(param).digest();
  }
  return crypto.createHmac('sha256', signature).update('iw1_request').digest('hex');
};

const createInworldJwtRequestHeaders = () => {
  const dateTime = formatInworldDateTime();
  const host = getInworldHost();
  const engineHost = getInworldEngineHost();
  const nonce = crypto.randomBytes(16).toString('hex').slice(1, 12);
  const signature = getSignatureKey(INWORLD_API_SECRET, [
    dateTime,
    engineHost,
    INWORLD_TOKEN_METHOD,
    nonce
  ]);
  return {
    Authorization: `IW1-HMAC-SHA256 ApiKey=${INWORLD_API_KEY},DateTime=${dateTime},Nonce=${nonce},Signature=${signature}`,
    Host: host,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
};

const parseInworldExpirationTime = (value) => {
  if (!value || typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed) && parsed > Date.now()) {
    return parsed;
  }
  return null;
};

const fetchInworldJwtToken = async (executionContext = {}) => {
  const timeoutMs = executionContext.timeoutMs ?? AI_UPSTREAM_TIMEOUT_MS;
  const retryPolicy = createRetryPolicy(executionContext.signal, executionContext.retryPolicy);
  const bodyText = await runWithRetry(
    async ({ signal }) => runWithAbortableTimeout(
      async (timeoutSignal) => {
        const response = await fetch(`${INWORLD_API_BASE}/auth/v1/tokens/token:generate`, {
          method: 'POST',
          headers: createInworldJwtRequestHeaders(),
          body: JSON.stringify({
            key: INWORLD_API_KEY,
            resources: [getInworldWorkspaceResource()]
          }),
          signal: timeoutSignal
        });
        const text = await response.text();
        const payload = parseJsonSafe(text);
        if (!response.ok) {
          const message = payload?.error?.message || payload?.message || `Inworld token generation failed (${response.status})`;
          throw createUpstreamError(
            message,
            response.status,
            mapUpstreamStatusToErrorCode(response.status),
            payload?.error?.details || payload?.details
          );
        }
        return text;
      },
      {
        timeoutMs,
        signal,
        operationName: 'inworld.jwt.generate'
      }
    ),
    retryPolicy
  );

  const payload = parseJsonSafe(bodyText);

  const token = typeof payload?.token === 'string' ? payload.token.trim() : '';
  if (!token) {
    throw createUpstreamError('Inworld token generation returned an empty token.', 502, 'UPSTREAM_ERROR');
  }
  const expiresAt = parseInworldExpirationTime(payload?.expirationTime)
    ?? parseInworldExpirationTime(payload?.expiryTime)
    ?? (Date.now() + 15 * 60 * 1000);

  return { token, expiresAt };
};

const getInworldJwtToken = async (executionContext = {}) => {
  const now = Date.now();
  if (
    inworldJwtCache.token &&
    inworldJwtCache.expiresAt - INWORLD_JWT_REFRESH_BUFFER_MS > now
  ) {
    return inworldJwtCache.token;
  }

  if (inworldJwtCache.pending) {
    return waitForPromiseOrAbort(inworldJwtCache.pending, executionContext.signal);
  }

  inworldJwtCache.pending = (async () => {
    const nextToken = await fetchInworldJwtToken(executionContext);
    inworldJwtCache.token = nextToken.token;
    inworldJwtCache.expiresAt = nextToken.expiresAt;
    return nextToken.token;
  })().finally(() => {
    inworldJwtCache.pending = null;
  });

  return waitForPromiseOrAbort(inworldJwtCache.pending, executionContext.signal);
};

const createInworldHeaders = async (executionContext = {}) => ({
  Authorization: `Bearer ${await getInworldJwtToken(executionContext)}`,
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream'
});

const normalizeVoicePayloads = (voices, source, isCustom) =>
  dedupeVoices(
    voices
      .map((voice) => normalizeInworldVoice(voice, source, isCustom))
      .filter(Boolean)
  );

const fetchInworldVoiceList = async (endpoint, source, isCustom, executionContext = {}) => {
  const headers = await createInworldHeaders(executionContext);
  const timeoutMs = executionContext.timeoutMs ?? AI_UPSTREAM_TIMEOUT_MS;
  const retryPolicy = createRetryPolicy(executionContext.signal, executionContext.retryPolicy);
  const bodyText = await runWithRetry(
    async ({ signal }) => runWithAbortableTimeout(
      async (timeoutSignal) => {
        const response = await fetch(`${INWORLD_API_BASE}${endpoint}`, {
          method: 'GET',
          headers,
          signal: timeoutSignal
        });
        const text = await response.text();
        if (!response.ok) {
          const payload = parseJsonSafe(text);
          const message = payload?.error?.message || payload?.message || `Inworld voice list failed (${response.status})`;
          throw createUpstreamError(
            message,
            response.status,
            mapUpstreamStatusToErrorCode(response.status),
            payload?.error?.details || payload?.details
          );
        }
        return text;
      },
      {
        timeoutMs,
        signal,
        operationName: `inworld.voices:${endpoint}`
      }
    ),
    retryPolicy
  );
  if (!bodyText || bodyText.trim().length === 0) {
    return [];
  }
  const payload = parseJsonSafe(bodyText);
  if (!payload) {
    return [];
  }
  return normalizeVoicePayloads(parseInworldVoiceList(payload), source, isCustom);
};

const listInworldVoices = async (executionContext = {}) => {
  const now = Date.now();
  if (voiceCatalogCache.expiresAt > now && voiceCatalogCache.voices.length > 0) {
    return voiceCatalogCache.voices;
  }

  const premadeEndpoints = [
    '/tts/v1/voices',
    '/tts/v1/voices:premade'
  ];
  const workspaceId = getInworldWorkspaceResource().replace(/^workspaces\//, '');
  const customEndpoints = [
    `/voices/v1/workspaces/${encodeURIComponent(workspaceId)}/voices`,
    '/voices/v1/voices'
  ];

  let premadeVoices = [];
  for (const endpoint of premadeEndpoints) {
    try {
      premadeVoices = await fetchInworldVoiceList(endpoint, 'inworld-premade', false, executionContext);
      if (premadeVoices.length > 0) break;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      if (!isInworldVoiceFetchErrorRecoverable(error?.status)) {
        throw error;
      }
    }
  }

  let customVoices = [];
  for (const endpoint of customEndpoints) {
    try {
      customVoices = await fetchInworldVoiceList(endpoint, 'inworld-custom', true, executionContext);
      if (customVoices.length > 0) {
        break;
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      const status = error?.status;
      const silentlyRecoverable = [400, 401, 403, 404, 405, 422].includes(status);
      if (!silentlyRecoverable && !isInworldVoiceFetchErrorRecoverable(status)) {
        console.warn('[tts] custom voice catalog unavailable', {
          endpoint,
          status,
          code: error?.code
        });
      }
    }
  }

  const curatedInworldVoices = limitInworldVoices(
    dedupeVoices([...premadeVoices, ...customVoices]),
    INWORLD_MAX_ENGLISH_VOICES
  );
  const merged = dedupeVoices(curatedInworldVoices);
  voiceCatalogCache.expiresAt = now + VOICE_CATALOG_CACHE_TTL_MS;
  voiceCatalogCache.voices = merged;
  return merged;
};

const generateSpeechWithInworld = async (text, voiceName, expressive = false, executionContext = {}) => {
  const preparedText = applyExpressiveText(text, expressive);
  const resolvedVoiceId = typeof voiceName === 'string' ? voiceName.trim() : '';
  if (!resolvedVoiceId) {
    throw createUpstreamError('Voice ID is required for Inworld TTS.', 400, 'INVALID_VOICE');
  }
  const payload = {
    model_id: TTS_INWORLD_MODEL,
    text: preparedText,
    voice_id: resolvedVoiceId,
    audio_config: {
      audio_encoding: 'LINEAR16',
      sample_rate_hertz: 24000
    }
  };

  const headers = await createInworldHeaders(executionContext);
  const requestInworld = async (endpoint, parseAsStream = false) => {
    const timeoutMs = executionContext.timeoutMs ?? AI_UPSTREAM_TIMEOUT_MS;
    const retryPolicy = createRetryPolicy(executionContext.signal, executionContext.retryPolicy);
    const bodyText = await runWithRetry(
      async ({ signal }) => runWithAbortableTimeout(
        async (timeoutSignal) => {
          const response = await fetch(`${INWORLD_API_BASE}${endpoint}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: timeoutSignal
          });
          const text = await response.text();
          if (!response.ok) {
            const parsedError = parseJsonSafe(text);
            const message = parsedError?.error?.message || parsedError?.message || `Inworld TTS request failed (${response.status})`;
            throw createUpstreamError(
              message,
              response.status,
              mapUpstreamStatusToErrorCode(response.status),
              parsedError?.error?.details || parsedError?.details
            );
          }
          return text;
        },
        {
          timeoutMs,
          signal,
          operationName: `inworld.tts:${endpoint}`
        }
      ),
      retryPolicy
    );

    if (parseAsStream) {
      const syntheticStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(bodyText));
          controller.close();
        }
      });
      const streamAudioBase64 = await collectAudioFromStreamBody(syntheticStream);
      if (streamAudioBase64) {
        return streamAudioBase64;
      }
      return '';
    }

    const parsed = parseJsonSafe(bodyText);
    return extractAudioBase64FromPayload(parsed) || '';
  };

  try {
    const audioBase64 = await requestInworld('/tts/v1/voice', false);
    if (audioBase64) {
      return { audioBase64, provider: 'inworld' };
    }
  } catch (error) {
    if (![404, 405].includes(error?.status)) {
      throw error;
    }
  }

  const streamFallback = await requestInworld('/tts/v1/voice:stream', true);
  if (streamFallback) {
    return { audioBase64: streamFallback, provider: 'inworld' };
  }

  throw createUpstreamError('No audio data returned from Inworld.', 502, 'UPSTREAM_ERROR');
};

const generateSpeechByProvider = async (text, voiceName, expressive = false, executionContext = {}) => {
  if (!hasInworldTtsCredentials()) {
    throw createUpstreamError('TTS provider not configured.', 500, 'CONFIG_ERROR');
  }
  const startedAt = Date.now();
  const result = await generateSpeechWithInworld(text, voiceName, expressive, executionContext);
  return {
    ...result,
    latencyMs: Date.now() - startedAt
  };
};

const listVoicesByProvider = async (executionContext = {}) => {
  if (!hasInworldTtsCredentials()) {
    return [];
  }
  try {
    return await listInworldVoices(executionContext);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    console.warn('[tts] voice catalog unavailable', {
      status: error?.status,
      code: error?.code,
      name: error?.name,
      message: error?.message
    });
    return [];
  }
};

const createAiValidationError = (kind, reason) => {
  const error = new Error('AI response did not match expected format.');
  error.code = 'INVALID_AI_RESPONSE';
  error.details = { kind, reason };
  throw error;
};

const sendError = (res, status, message, code, details) =>
  res.status(status).json({ error: { message, code, ...(details ? { details } : {}) } });

const parseCookies = (cookieHeader = '') => cookie.parse(cookieHeader);

const getClientIp = (req) => {
  if (typeof req.ip === 'string' && req.ip.trim().length > 0) {
    return req.ip.trim();
  }
  if (typeof req.socket?.remoteAddress === 'string' && req.socket.remoteAddress.trim().length > 0) {
    return req.socket.remoteAddress.trim();
  }
  return 'unknown';
};

const safeEqual = (left, right) => {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const createSession = () => {
  const id = crypto.randomBytes(32).toString('hex');
  sessions.set(id, { createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS });
  return id;
};

const getSessionId = (req) => {
  const cookies = parseCookies(req.headers.cookie || '');
  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return sessionId;
};

const setSessionCookie = (res, sessionId) => {
  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
    path: '/'
  });
};

const clearSessionCookie = (res) => {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
};

const ensurePromptSize = (res, size) => {
  if (size > MAX_PROMPT_CHARS) {
    sendError(res, 413, 'Prompt too large.', 'PROMPT_TOO_LARGE', { maxChars: MAX_PROMPT_CHARS });
    return false;
  }
  return true;
};

const checkRateLimit = (key) => {
  if (!key) return { allowed: true };
  const now = Date.now();
  const bucket = rateBuckets.get(key) || {
    minuteStart: now,
    minuteCount: 0,
    dayStart: now,
    dayCount: 0,
    lastSeen: now
  };

  if (now - bucket.minuteStart >= RATE_LIMIT_MINUTE_MS) {
    bucket.minuteStart = now;
    bucket.minuteCount = 0;
  }
  if (now - bucket.dayStart >= RATE_LIMIT_DAY_MS) {
    bucket.dayStart = now;
    bucket.dayCount = 0;
  }
  bucket.lastSeen = now;

  const nextMinuteCount = bucket.minuteCount + 1;
  const nextDayCount = bucket.dayCount + 1;
  const exceededMinute = AI_RPM > 0 && nextMinuteCount > AI_RPM;
  const exceededDay = AI_RPD > 0 && nextDayCount > AI_RPD;

  if (exceededMinute || exceededDay) {
    const retryAfterMs = exceededMinute
      ? bucket.minuteStart + RATE_LIMIT_MINUTE_MS - now
      : bucket.dayStart + RATE_LIMIT_DAY_MS - now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      scope: exceededMinute ? 'minute' : 'day'
    };
  }

  bucket.minuteCount = nextMinuteCount;
  bucket.dayCount = nextDayCount;
  rateBuckets.set(key, bucket);
  return { allowed: true };
};

const checkLoginRateLimit = (key) => {
  if (!key) return { allowed: true };
  const now = Date.now();
  const bucket = loginBuckets.get(key) || {
    windowStart: now,
    count: 0,
    lastSeen: now
  };

  if (now - bucket.windowStart >= LOGIN_WINDOW_MS) {
    bucket.windowStart = now;
    bucket.count = 0;
  }
  bucket.lastSeen = now;

  const nextCount = bucket.count + 1;
  const exceeded = LOGIN_MAX_ATTEMPTS > 0 && nextCount > LOGIN_MAX_ATTEMPTS;
  if (exceeded) {
    const retryAfterMs = bucket.windowStart + LOGIN_WINDOW_MS - now;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000))
    };
  }

  bucket.count = nextCount;
  loginBuckets.set(key, bucket);
  return { allowed: true };
};

const pruneStaleEntries = (now = Date.now()) => {
  for (const [sessionId, session] of sessions.entries()) {
    if (!session || session.expiresAt <= now) {
      sessions.delete(sessionId);
    }
  }

  for (const [key, bucket] of rateBuckets.entries()) {
    const lastSeen = bucket?.lastSeen ?? bucket?.dayStart ?? bucket?.minuteStart ?? 0;
    if (!lastSeen || now - lastSeen > RATE_LIMIT_DAY_MS) {
      rateBuckets.delete(key);
    }
  }

  for (const [key, bucket] of loginBuckets.entries()) {
    const lastSeen = bucket?.lastSeen ?? bucket?.windowStart ?? 0;
    if (!lastSeen || now - lastSeen > LOGIN_BUCKET_TTL_MS) {
      loginBuckets.delete(key);
    }
  }
};

let cleanupTimer;
const startCleanupTimer = () => {
  if (cleanupTimer || CLEANUP_INTERVAL_MS <= 0) return;
  cleanupTimer = setInterval(() => {
    pruneStaleEntries();
  }, CLEANUP_INTERVAL_MS);
  if (typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
  }
};

const requireSession = (req, res, next) => {
  if (!ADMIN_PASSWORD) {
    return sendError(res, 500, 'Server missing ADMIN_PASSWORD.', 'CONFIG_ERROR');
  }
  const sessionId = getSessionId(req);
  if (!sessionId) {
    return sendError(res, 401, 'Authentication required.', 'UNAUTHORIZED');
  }
  req.aiSessionId = sessionId;
  return next();
};

const rateLimitAi = (req, res, next) => {
  const key = req.aiSessionId || getClientIp(req);
  const result = checkRateLimit(key);
  if (!result.allowed) {
    res.set('Retry-After', String(result.retryAfterSeconds));
    return sendError(res, 429, 'Rate limit exceeded. Please wait and try again.', 'RATE_LIMITED', {
      scope: result.scope,
      retryAfterSeconds: result.retryAfterSeconds,
      limit: result.scope === 'minute' ? AI_RPM : AI_RPD
    });
  }
  return next();
};

const rateLimitLogin = (req, res, next) => {
  const key = getClientIp(req);
  const result = checkLoginRateLimit(key);
  if (!result.allowed) {
    res.set('Retry-After', String(result.retryAfterSeconds));
    console.warn('[auth/login] Rate limited', { ip: key, retryAfterSeconds: result.retryAfterSeconds });
    return sendError(res, 429, 'Too many login attempts. Please try again later.', 'LOGIN_RATE_LIMITED', {
      retryAfterSeconds: result.retryAfterSeconds,
      limit: LOGIN_MAX_ATTEMPTS,
      windowSeconds: Math.ceil(LOGIN_WINDOW_MS / 1000)
    });
  }
  return next();
};

app.use(express.json({ limit: BODY_LIMIT }));

const ORIGIN_GUARD_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const isProtectedApiPath = (pathName = '') => (
  pathName === '/api/auth'
  || pathName.startsWith('/api/auth/')
  || pathName === '/api/ai'
  || pathName.startsWith('/api/ai/')
);

const enforceAllowedOrigin = (req, res, next) => {
  if (!ORIGIN_GUARD_METHODS.has(req.method)) {
    return next();
  }
  if (!isProtectedApiPath(req.path)) {
    return next();
  }

  const originHeader = req.headers.origin;
  if (typeof originHeader !== 'string' || originHeader.trim().length === 0) {
    if (IS_PROD) {
      return sendError(res, 403, 'Origin header required.', 'ORIGIN_REQUIRED');
    }
    if (process.env.NODE_ENV === 'development') {
      console.warn('[origin-guard] Missing Origin header for mutating request', {
        method: req.method,
        path: req.path
      });
    }
    return next();
  }

  const normalizedOrigin = normalizeOrigin(originHeader);
  if (!ALLOWED_ORIGINS.has(normalizedOrigin)) {
    return sendError(res, 403, 'Origin not allowed.', 'ORIGIN_NOT_ALLOWED');
  }

  return next();
};

app.use(enforceAllowedOrigin);

const handleLogin = (req, res) => {
  const password = req.body?.password;
  if (!isNonEmptyString(password, 256)) {
    return sendError(res, 400, 'Invalid login payload.', 'INVALID_REQUEST');
  }
  if (!ADMIN_PASSWORD) {
    return sendError(res, 500, 'Server missing ADMIN_PASSWORD.', 'CONFIG_ERROR');
  }
  if (!safeEqual(password, ADMIN_PASSWORD)) {
    console.warn('[auth/login] Invalid password', { ip: getClientIp(req) });
    return sendError(res, 401, 'Invalid password.', 'UNAUTHORIZED');
  }
  const sessionId = createSession();
  setSessionCookie(res, sessionId);
  return res.json({ data: { ok: true } });
};

app.post('/api/auth/login', rateLimitLogin, handleLogin);

app.post('/api/auth/logout', (req, res) => {
  const sessionId = getSessionId(req);
  if (sessionId) {
    sessions.delete(sessionId);
  }
  clearSessionCookie(res);
  return res.json({ data: { ok: true } });
});

app.get('/api/auth/session', (req, res) => {
  const sessionId = getSessionId(req);
  if (!sessionId) {
    return sendError(res, 401, 'Not authenticated.', 'UNAUTHORIZED');
  }
  return res.json({ data: { ok: true } });
});

app.use('/api/ai', requireSession, rateLimitAi);

const handleAiGenerate = async (req, res) => {
  const payload = req.body || {};
  const kind = payload.kind;
  const context = payload.context;
  const promptTraceRequest = resolvePromptTraceMeta(payload.promptTrace);
  const serverPromptDebugEnabled = isPromptTraceServerEnabled();
  const clientPromptDebugEnabled = Boolean(promptTraceRequest.requestFlag);
  const promptTraceEnabled = serverPromptDebugEnabled && clientPromptDebugEnabled;
  const shouldIncludePromptDebug = promptTraceEnabled;
  const requestId = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  let rawAiResponse;
  let parsedAiKeys;
  let responseDebug = null;

  if (!isNonEmptyString(kind, 64) || !isObject(context)) {
    return sendError(res, 400, 'Invalid request payload.', 'INVALID_REQUEST');
  }

  const requestContext = attachRequestAbortSignal(req, res);
  try {
    try {
      let data;
      const baseExecutionContext = {
        signal: requestContext.signal,
        timeoutMs: AI_UPSTREAM_TIMEOUT_MS,
        retryPolicy: createRetryPolicy(requestContext.signal)
      };

      if (isTextGenerationKind(kind)) {
        if (kind === 'generateScene') {
          const { storyContext, userInstruction, isFirstScene } = context;
          if (!isObject(storyContext) || !isNonEmptyString(userInstruction, 2000) || typeof isFirstScene !== 'boolean') {
            return sendError(res, 400, 'Invalid generateScene context.', 'INVALID_REQUEST');
          }

          const { genre, premise, characters, style, targetLength } = storyContext;
          if (!isNonEmptyString(genre, 120) || !isNonEmptyString(premise, 4000) || !Array.isArray(characters)) {
            return sendError(res, 400, 'Invalid story context.', 'INVALID_REQUEST');
          }

          if (characters.some((c) => !isNonEmptyString(c, 120))) {
            return sendError(res, 400, 'Invalid character list.', 'INVALID_REQUEST');
          }
          if (
            style !== undefined &&
            style !== null &&
            !isNonEmptyString(style, 400)
          ) {
            return sendError(res, 400, 'Invalid story style.', 'INVALID_REQUEST');
          }
          if (
            targetLength !== undefined &&
            targetLength !== null &&
            (typeof targetLength !== 'string' || !VALID_SCENE_LENGTHS.has(targetLength))
          ) {
            return sendError(res, 400, 'Invalid target length.', 'INVALID_REQUEST');
          }
        } else if (kind === 'suggestPlotTwist') {
          const { genre, styleId, styleName, style } = context;
          if (!isNonEmptyString(genre, 120)) {
            return sendError(res, 400, 'Invalid suggestPlotTwist context.', 'INVALID_REQUEST');
          }
          if (styleId !== undefined && styleId !== null && !isNonEmptyString(styleId, 120)) {
            return sendError(res, 400, 'Invalid suggestPlotTwist style id.', 'INVALID_REQUEST');
          }
          if (styleName !== undefined && styleName !== null && !isNonEmptyString(styleName, 200)) {
            return sendError(res, 400, 'Invalid suggestPlotTwist style name.', 'INVALID_REQUEST');
          }
          if (style !== undefined && style !== null && !isNonEmptyString(style, 400)) {
            return sendError(res, 400, 'Invalid suggestPlotTwist style.', 'INVALID_REQUEST');
          }
        } else if (kind === 'generateScriptElement') {
          const { type, character, instruction, styleContext, styleId, styleName, style } = context;
          if (
            !isNonEmptyString(type, 24) ||
            !VALID_BLOCK_TYPES.has(type) ||
            !isNonEmptyString(instruction, 2000) ||
            !isNonEmptyString(styleContext, 4000)
          ) {
            return sendError(res, 400, 'Invalid generateScriptElement context.', 'INVALID_REQUEST');
          }

          const hasCharacter = character !== undefined && character !== null;
          if (
            (type === 'dialogue' && !isNonEmptyString(character, 120)) ||
            (type !== 'dialogue' && hasCharacter && !isNonEmptyString(character, 120))
          ) {
            return sendError(res, 400, 'Invalid character data.', 'INVALID_REQUEST');
          }
          if (styleId !== undefined && styleId !== null && !isNonEmptyString(styleId, 120)) {
            return sendError(res, 400, 'Invalid script element style id.', 'INVALID_REQUEST');
          }
          if (styleName !== undefined && styleName !== null && !isNonEmptyString(styleName, 200)) {
            return sendError(res, 400, 'Invalid script element style name.', 'INVALID_REQUEST');
          }
          if (style !== undefined && style !== null && !isNonEmptyString(style, 400)) {
            return sendError(res, 400, 'Invalid script element style.', 'INVALID_REQUEST');
          }
        } else if (kind === 'regenerateScriptBlock') {
          const { block, genre, premise, rewriteGuidance, styleId, styleName, style } = context;
          if (!isObject(block) || !isNonEmptyString(genre, 120) || !isNonEmptyString(premise, 4000)) {
            return sendError(res, 400, 'Invalid regenerateScriptBlock context.', 'INVALID_REQUEST');
          }
          if (
            rewriteGuidance !== undefined &&
            rewriteGuidance !== null &&
            !isNonEmptyString(rewriteGuidance, 1200)
          ) {
            return sendError(res, 400, 'Invalid rewrite guidance.', 'INVALID_REQUEST');
          }

          const { type, text, character } = block;
          if (
            !isNonEmptyString(type, 24) ||
            !VALID_REWRITE_BLOCK_TYPES.has(type) ||
            !isNonEmptyString(text, 2000)
          ) {
            return sendError(res, 400, 'Invalid block data.', 'INVALID_REQUEST');
          }

          const hasCharacter = character !== undefined && character !== null;
          if (
            (type === 'dialogue' && !isNonEmptyString(character, 120)) ||
            (type !== 'dialogue' && hasCharacter && !isNonEmptyString(character, 120))
          ) {
            return sendError(res, 400, 'Invalid character data.', 'INVALID_REQUEST');
          }
          if (styleId !== undefined && styleId !== null && !isNonEmptyString(styleId, 120)) {
            return sendError(res, 400, 'Invalid rewrite style id.', 'INVALID_REQUEST');
          }
          if (styleName !== undefined && styleName !== null && !isNonEmptyString(styleName, 200)) {
            return sendError(res, 400, 'Invalid rewrite style name.', 'INVALID_REQUEST');
          }
          if (style !== undefined && style !== null && !isNonEmptyString(style, 400)) {
            return sendError(res, 400, 'Invalid rewrite style.', 'INVALID_REQUEST');
          }
        } else if (kind === 'generateSurpriseSetup') {
          const { targetGenre, styleId, styleName, style } = context;
          if (targetGenre !== undefined && targetGenre !== null && !isNonEmptyString(targetGenre, 120)) {
            return sendError(res, 400, 'Invalid generateSurpriseSetup context.', 'INVALID_REQUEST');
          }
          if (targetGenre !== undefined && targetGenre !== null && !isCanonicalGenre(targetGenre)) {
            return sendError(res, 400, 'Invalid surprise setup target genre.', 'INVALID_REQUEST');
          }
          if (styleId !== undefined && styleId !== null && !isNonEmptyString(styleId, 120)) {
            return sendError(res, 400, 'Invalid surprise setup style id.', 'INVALID_REQUEST');
          }
          if (styleName !== undefined && styleName !== null && !isNonEmptyString(styleName, 200)) {
            return sendError(res, 400, 'Invalid surprise setup style name.', 'INVALID_REQUEST');
          }
          if (style !== undefined && style !== null && !isNonEmptyString(style, 400)) {
            return sendError(res, 400, 'Invalid surprise setup style.', 'INVALID_REQUEST');
          }
        }

        const promptSize = getPromptSizeEstimate({ kind, context, genres: CANONICAL_GENRES });
        if (!ensurePromptSize(res, promptSize)) {
          return;
        }

        const textProvider = getTextProvider();
        const textTimeoutMs = kind === 'generateScene'
          ? AI_UPSTREAM_TIMEOUT_MS_SCENE
          : AI_UPSTREAM_TIMEOUT_MS;
        const generationResult = await generateTextByKind({
          kind,
          context,
          genres: CANONICAL_GENRES,
          provider: textProvider,
          openai: textProvider === 'openai' ? getOpenAIClient() : null,
          geminiAi: textProvider === 'gemini' ? getGeminiClient() : null,
          upstreamContext: {
            ...baseExecutionContext,
            timeoutMs: textTimeoutMs,
            retryPolicy: createRetryPolicy(requestContext.signal),
            promptTrace: {
              enabled: promptTraceEnabled,
              promptContextRevision: promptTraceRequest.promptContextRevision,
              styleFingerprint: promptTraceRequest.styleFingerprint
            }
          }
        });
        data = generationResult.data;
        rawAiResponse = generationResult.meta?.rawAiResponse;
        parsedAiKeys = generationResult.meta?.parsedAiKeys;
        if (shouldIncludePromptDebug) {
          responseDebug = generationResult.meta?.debug ?? null;
        }
      } else if (kind === 'generateSpeech') {
        const { text, voiceName, expressive } = context;
        if (!isNonEmptyString(text, 4000) || !isNonEmptyString(voiceName, 120)) {
          return sendError(res, 400, 'Invalid generateSpeech context.', 'INVALID_REQUEST');
        }
        if (!ensurePromptSize(res, text.length)) {
          return;
        }
        emitPromptTrace({
          enabled: promptTraceEnabled,
          kind,
          provider: 'inworld',
          model: TTS_INWORLD_MODEL,
          timeoutMs: baseExecutionContext.timeoutMs,
          maxOutputTokens: null,
          promptContextRevision: promptTraceRequest.promptContextRevision,
          styleFingerprint: promptTraceRequest.styleFingerprint || createStyleFingerprint(''),
          instructionPreview: {
            task: 'Synthesize speech audio from screenplay text'
          },
          contextPreview: {
            voiceName,
            expressive: Boolean(expressive),
            text
          }
        });
        const result = await generateSpeechByProvider(text, voiceName, Boolean(expressive), baseExecutionContext);
        data = { audioBase64: result.audioBase64 };
        console.info('[tts] generated', {
          provider: result.provider,
          voiceName,
          latencyMs: result.latencyMs
        });
        if (shouldIncludePromptDebug) {
          responseDebug = {
            kind,
            provider: 'inworld',
            model: TTS_INWORLD_MODEL,
            max_output_tokens: null,
            timeoutMs: baseExecutionContext.timeoutMs,
            promptContextRevision: promptTraceRequest.promptContextRevision,
            styleFingerprint: promptTraceRequest.styleFingerprint || createStyleFingerprint(''),
            memoryBundle: {
              sectionSizes: null
            },
            durationMs: typeof result.latencyMs === 'number' ? result.latencyMs : null,
            tokenUsage: null,
            previews: {
              instruction: buildPromptPreviewValue({
                task: 'Synthesize speech audio from screenplay text'
              }),
              context: buildPromptPreviewValue({
                voiceName,
                expressive: Boolean(expressive)
              }),
              prompt: buildPromptPreviewValue(text)
            }
          };
        }
      } else if (kind === 'listVoices') {
        const voices = await listVoicesByProvider(baseExecutionContext);
        data = { voices };
        if (shouldIncludePromptDebug) {
          responseDebug = {
            kind,
            provider: 'inworld',
            model: TTS_INWORLD_MODEL,
            max_output_tokens: null,
            timeoutMs: baseExecutionContext.timeoutMs,
            promptContextRevision: promptTraceRequest.promptContextRevision,
            styleFingerprint: promptTraceRequest.styleFingerprint || createStyleFingerprint(''),
            memoryBundle: {
              sectionSizes: null
            },
            durationMs: null,
            tokenUsage: null,
            previews: {
              instruction: buildPromptPreviewValue({
                task: 'List TTS voices'
              }),
              context: buildPromptPreviewValue({}),
              prompt: null
            }
          };
        }
      } else {
        return sendError(res, 400, 'Unknown request kind.', 'INVALID_REQUEST');
      }

      const validation = validateAiResponse(kind, data);
      if (!validation.ok) {
        createAiValidationError(kind, validation.reason);
      }

      const debugPayload = shouldIncludePromptDebug && responseDebug
        ? { requestId, ...responseDebug }
        : null;
      return res.json({
        data,
        ...(debugPayload ? { debug: debugPayload } : {})
      });
    } catch (error) {
      const message = error?.message || '';
      const normalizedMessage = message.toLowerCase();
      const isRequestAborted = isAbortError(error);
      const isRateLimit =
        error?.status === 429 ||
        normalizedMessage.includes('429') ||
        normalizedMessage.includes('resource_exhausted') ||
        normalizedMessage.includes('rate limit');
      const isTimeout = error?.code === 'UPSTREAM_TIMEOUT' || message.includes('timed out');
      const isInvalidAi = error?.code === 'INVALID_AI_RESPONSE';
      const isConfigError = error?.code === 'CONFIG_ERROR';

      if (!IS_PROD && isInvalidAi && kind === 'generateScene') {
        const rawFromError = error?.details?.rawResponse;
        const rawSnippet = typeof rawAiResponse === 'string'
          ? rawAiResponse.slice(0, 2000)
          : typeof rawFromError === 'string'
          ? rawFromError.slice(0, 2000)
          : null;
        console.warn('[ai/generate] Invalid AI response', {
          requestId,
          kind,
          reason: error?.details?.reason,
          parsedKeys: parsedAiKeys || null,
          rawResponse: rawSnippet
        });
      }

      if (isRequestAborted) {
        if (!IS_PROD) {
          console.info('[ai/generate] Aborted', {
            requestId,
            kind,
            code: error?.code,
            status: error?.status,
            message
          });
        }
        if (!res.writableEnded && !res.destroyed) {
          return sendError(res, 499, 'Request canceled.', 'REQUEST_ABORTED');
        }
        return;
      }

      console.error('[ai/generate] Failed', error);
      return sendError(
        res,
        isConfigError ? 500 : isTimeout ? 504 : isRateLimit ? 429 : 502,
        isTimeout
          ? 'AI request timed out.'
          : isConfigError
          ? error?.message || 'Server configuration error.'
          : isInvalidAi
          ? 'AI response did not match expected format.'
          : 'AI request failed.',
        isConfigError
          ? 'CONFIG_ERROR'
          : isTimeout
          ? 'UPSTREAM_TIMEOUT'
          : isRateLimit
          ? 'RATE_LIMITED'
          : isInvalidAi
          ? 'INVALID_AI_RESPONSE'
          : 'UPSTREAM_ERROR',
        isInvalidAi ? error?.details : undefined
      );
    }
  } finally {
    requestContext.cleanup();
  }
};

app.post('/api/ai/generate', handleAiGenerate);

if (IS_PROD) {
  app.use(express.static(DIST_DIR));
  app.get(/^(?!\/api).*/, (req, res) => {
    return res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  void next;
  if (err?.type === 'entity.too.large') {
    return sendError(res, 413, 'Request body too large.', 'REQUEST_TOO_LARGE');
  }

  if (err instanceof SyntaxError) {
    return sendError(res, 400, 'Invalid JSON body.', 'INVALID_JSON');
  }

  console.error('[server] Unhandled error', err);
  return sendError(res, 500, 'Server error.', 'SERVER_ERROR');
});

const startServer = () => {
  startCleanupTimer();
  return app.listen(PORT, () => {
    console.log(`[api] listening on http://localhost:${PORT}`);
  });
};

const isMain =
  typeof process !== 'undefined' &&
  process.argv?.[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  startServer();
}

export {
  app,
  startServer,
  pruneStaleEntries,
  sessions,
  rateBuckets,
  loginBuckets,
  handleLogin,
  handleAiGenerate
};
