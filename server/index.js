import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookie from 'cookie';
import { GoogleGenAI, Type } from '@google/genai';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const BODY_LIMIT = '64kb';
const PORT = process.env.PORT || 3001;
const SESSION_COOKIE_NAME = 'ss_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const IS_PROD = process.env.NODE_ENV === 'production';
const AI_RPM = parsePositiveInt(process.env.AI_RPM, 30);
const AI_RPD = parsePositiveInt(process.env.AI_RPD, 500);
const MAX_PROMPT_CHARS = parsePositiveInt(process.env.AI_MAX_PROMPT_CHARS, 8000);
const AI_UPSTREAM_TIMEOUT_MS = parsePositiveInt(process.env.AI_UPSTREAM_TIMEOUT_MS, 30000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

const GENRES = [
  'Sci-Fi', 'Noir', 'Comedy', 'Horror', 'Romance', 'Fantasy', 'Thriller'
];

const VALID_BLOCK_TYPES = new Set(['heading', 'action', 'dialogue', 'transition']);
const sessions = new Map();
const rateBuckets = new Map();

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value, max = 4000) => (
  typeof value === 'string' && value.trim().length > 0 && value.length <= max
);

const sendError = (res, status, message, code, details) =>
  res.status(status).json({ error: { message, code, ...(details ? { details } : {}) } });

const parseCookies = (cookieHeader = '') => cookie.parse(cookieHeader);

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
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

const withTimeout = async (promise, timeoutMs) => {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error('Upstream request timed out.');
      error.code = 'UPSTREAM_TIMEOUT';
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const checkRateLimit = (key) => {
  if (!key) return { allowed: true };
  const now = Date.now();
  const minuteWindow = 60 * 1000;
  const dayWindow = 24 * 60 * 60 * 1000;
  const bucket = rateBuckets.get(key) || {
    minuteStart: now,
    minuteCount: 0,
    dayStart: now,
    dayCount: 0
  };

  if (now - bucket.minuteStart >= minuteWindow) {
    bucket.minuteStart = now;
    bucket.minuteCount = 0;
  }
  if (now - bucket.dayStart >= dayWindow) {
    bucket.dayStart = now;
    bucket.dayCount = 0;
  }

  const nextMinuteCount = bucket.minuteCount + 1;
  const nextDayCount = bucket.dayCount + 1;
  const exceededMinute = AI_RPM > 0 && nextMinuteCount > AI_RPM;
  const exceededDay = AI_RPD > 0 && nextDayCount > AI_RPD;

  if (exceededMinute || exceededDay) {
    const retryAfterMs = exceededMinute
      ? bucket.minuteStart + minuteWindow - now
      : bucket.dayStart + dayWindow - now;
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

app.use(express.json({ limit: BODY_LIMIT }));

app.post('/api/auth/login', (req, res) => {
  const password = req.body?.password;
  if (!isNonEmptyString(password, 256)) {
    return sendError(res, 400, 'Invalid login payload.', 'INVALID_REQUEST');
  }
  if (!ADMIN_PASSWORD) {
    return sendError(res, 500, 'Server missing ADMIN_PASSWORD.', 'CONFIG_ERROR');
  }
  if (!safeEqual(password, ADMIN_PASSWORD)) {
    return sendError(res, 401, 'Invalid password.', 'UNAUTHORIZED');
  }
  const sessionId = createSession();
  setSessionCookie(res, sessionId);
  return res.json({ data: { ok: true } });
});

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

app.post('/api/ai/generate', async (req, res) => {
  const payload = req.body || {};
  const kind = payload.kind;
  const context = payload.context;

  if (!isNonEmptyString(kind, 64) || !isObject(context)) {
    return sendError(res, 400, 'Invalid request payload.', 'INVALID_REQUEST');
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return sendError(res, 500, 'Server missing GEMINI_API_KEY.', 'CONFIG_ERROR');
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    let data;

    if (kind === 'generateScene') {
      const { storyContext, userInstruction, isFirstScene } = context;
      if (!isObject(storyContext) || !isNonEmptyString(userInstruction, 2000) || typeof isFirstScene !== 'boolean') {
        return sendError(res, 400, 'Invalid generateScene context.', 'INVALID_REQUEST');
      }

      const { genre, premise, characters, scenes } = storyContext;
      if (!isNonEmptyString(genre, 120) || !isNonEmptyString(premise, 4000) || !Array.isArray(characters)) {
        return sendError(res, 400, 'Invalid story context.', 'INVALID_REQUEST');
      }

      if (characters.some((c) => !isNonEmptyString(c, 120))) {
        return sendError(res, 400, 'Invalid character list.', 'INVALID_REQUEST');
      }

      const previousScenesSummary = Array.isArray(scenes)
        ? scenes
            .map((scene, index) =>
              isObject(scene) && isNonEmptyString(scene.summary, 1200)
                ? `Scene ${index + 1}: ${scene.summary}`
                : null
            )
            .filter(Boolean)
            .join('\n')
        : '';

      const charactersList = characters.join(', ');
      const promptSize = [
        genre,
        premise,
        charactersList,
        userInstruction,
        previousScenesSummary
      ].filter(Boolean).join('\n').length;
      if (!ensurePromptSize(res, promptSize)) {
        return;
      }

      const prompt = `
    You are a professional screenwriter. Write the ${isFirstScene ? 'opening' : 'next'} scene for a screenplay.
    
    Genre: ${genre}
    Premise: ${premise}
    Characters: ${charactersList}
    
    ${previousScenesSummary ? `Previous Story Context:\n${previousScenesSummary}` : ''}
    
    User Instruction for this scene: "${userInstruction}"
    
    IMPORTANT: Return ONLY a JSON object representing the scene. Do not include markdown formatting or extra text.
    
    The JSON schema is:
    {
      "heading": "INT. LOCATION - TIME",
      "summary": "A one sentence summary of what happens in this scene for context tracking.",
      "blocks": [
        {
          "type": "heading" | "action" | "dialogue" | "transition",
          "character": "CHARACTER NAME (only for dialogue)",
          "parenthetical": "(optional parenthetical instruction)",
          "text": "The content of the block"
        }
      ]
    }

    Ensure the output is valid JSON.
  `;

      const response = await withTimeout(ai.models.generateContent({
        model: 'gemini-2.5-flash',
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
        }
      }), AI_UPSTREAM_TIMEOUT_MS);

      const text = response.text;
      if (!text) {
        throw new Error('No response from AI');
      }

      data = JSON.parse(text);
    } else if (kind === 'suggestPlotTwist') {
      const { genre } = context;
      if (!isNonEmptyString(genre, 120)) {
        return sendError(res, 400, 'Invalid suggestPlotTwist context.', 'INVALID_REQUEST');
      }

      const response = await withTimeout(ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: `Give me a short, shocking, single-sentence plot twist idea for a ${genre} story.`
      }), AI_UPSTREAM_TIMEOUT_MS);

      data = { text: response.text || 'Suddenly, everything changes.' };
    } else if (kind === 'generateScriptElement') {
      const { type, character, instruction, styleContext } = context;
      if (
        !isNonEmptyString(type, 24) ||
        !VALID_BLOCK_TYPES.has(type) ||
        !isNonEmptyString(instruction, 2000) ||
        !isNonEmptyString(styleContext, 4000)
      ) {
        return sendError(res, 400, 'Invalid generateScriptElement context.', 'INVALID_REQUEST');
      }
      if (!ensurePromptSize(res, `${instruction}\n${styleContext}`.length)) {
        return;
      }

      const hasCharacter = character !== undefined && character !== null;
      if (
        (type === 'dialogue' && !isNonEmptyString(character, 120)) ||
        (type !== 'dialogue' && hasCharacter && !isNonEmptyString(character, 120))
      ) {
        return sendError(res, 400, 'Invalid character data.', 'INVALID_REQUEST');
      }

      let userPrompt = '';
      if (type === 'dialogue') {
        userPrompt = `Write a single line of dialogue for character "${character}". Context: ${styleContext}. Instruction: ${instruction}`;
      } else if (type === 'action') {
        userPrompt = `Write a concise screenplay action line. Context: ${styleContext}. Instruction: ${instruction}`;
      } else if (type === 'transition') {
        userPrompt = `Write a screenplay transition (e.g. CUT TO:). Context: ${styleContext}. Instruction: ${instruction}`;
      } else if (type === 'heading') {
        userPrompt = `Write a scene heading (slugline) like INT. HOUSE - DAY. Context: ${styleContext}. Instruction: ${instruction}`;
      }

      const response = await withTimeout(ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: userPrompt,
        config: {
          systemInstruction:
            'You are a screenwriting assistant. Output ONLY the raw script text requested. Do not add quotes, prefixes, or formatting.',
          maxOutputTokens: 100,
          temperature: 0.7
        }
      }), AI_UPSTREAM_TIMEOUT_MS);

      data = { text: response.text?.trim() || '' };
    } else if (kind === 'regenerateScriptBlock') {
      const { block, genre, premise } = context;
      if (!isObject(block) || !isNonEmptyString(genre, 120) || !isNonEmptyString(premise, 4000)) {
        return sendError(res, 400, 'Invalid regenerateScriptBlock context.', 'INVALID_REQUEST');
      }

      const { type, text, character } = block;
      if (
        !isNonEmptyString(type, 24) ||
        !VALID_BLOCK_TYPES.has(type) ||
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

      if (!ensurePromptSize(res, `${premise}\n${text}`.length)) {
        return;
      }

      let prompt = '';
      if (type === 'dialogue') {
        prompt = `Rewrite this dialogue line for ${character} to be more impactful, witty, or dramatic, fitting the genre "${genre}". 
    Premise: ${premise}.
    Original line: "${text}".
    Output ONLY the new dialogue text.`;
      } else {
        prompt = `Rewrite this screenplay ${type} block to be more descriptive and engaging. 
    Genre: ${genre}.
    Original text: "${text}".
    Output ONLY the new text.`;
      }

      const response = await withTimeout(ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: prompt,
        config: {
          maxOutputTokens: 150,
          temperature: 0.8
        }
      }), AI_UPSTREAM_TIMEOUT_MS);

      data = { text: response.text?.trim() || text };
    } else if (kind === 'generateSurpriseSetup') {
      const { targetGenre } = context;
      if (targetGenre !== undefined && targetGenre !== null && !isNonEmptyString(targetGenre, 120)) {
        return sendError(res, 400, 'Invalid generateSurpriseSetup context.', 'INVALID_REQUEST');
      }

      const genreInstruction = targetGenre
        ? `The genre MUST be "${targetGenre}".`
        : `Pick a genre from this list if suitable: ${GENRES.join(', ')}, otherwise choose a fitting one.`;

      const prompt = `
    Generate a creative, unique, and interesting movie premise. 
    ${genreInstruction}
    Return a JSON object with: 
    'genre' (string)${targetGenre ? ' - Use the exact requested genre string.' : ''}, 
    'premise' (string, 1-2 sentences), 
    'characters' (array of 3 character names with brief role description, e.g. "John (The Detective)").
  `;

      const response = await withTimeout(ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
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
        }
      }), AI_UPSTREAM_TIMEOUT_MS);

      const text = response.text;
      if (!text) {
        throw new Error('No response from AI');
      }

      data = JSON.parse(text);
    } else if (kind === 'generateSpeech') {
      const { text, voiceName } = context;
      if (!isNonEmptyString(text, 4000) || !isNonEmptyString(voiceName, 120)) {
        return sendError(res, 400, 'Invalid generateSpeech context.', 'INVALID_REQUEST');
      }
      if (!ensurePromptSize(res, text.length)) {
        return;
      }

      const response = await withTimeout(ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: text }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName }
            }
          }
        }
      }), AI_UPSTREAM_TIMEOUT_MS);

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        throw new Error('No audio data returned');
      }

      data = { audioBase64: base64Audio };
    } else {
      return sendError(res, 400, 'Unknown request kind.', 'INVALID_REQUEST');
    }

    return res.json({ data });
  } catch (error) {
    const message = error?.message || '';
    const isRateLimit =
      message.includes('429') ||
      message.includes('RESOURCE_EXHAUSTED') ||
      message.includes('rate limit');
    const isTimeout = error?.code === 'UPSTREAM_TIMEOUT' || message.includes('timed out');

    console.error('[ai/generate] Failed', error);
    return sendError(
      res,
      isTimeout ? 504 : isRateLimit ? 429 : 502,
      isTimeout ? 'AI request timed out.' : 'AI request failed.',
      isTimeout ? 'UPSTREAM_TIMEOUT' : isRateLimit ? 'RATE_LIMITED' : 'UPSTREAM_ERROR'
    );
  }
});

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

app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
});
