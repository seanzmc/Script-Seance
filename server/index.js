import 'dotenv/config';
import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';

const app = express();
app.disable('x-powered-by');

const BODY_LIMIT = '64kb';
const PORT = process.env.PORT || 3001;

const GENRES = [
  'Sci-Fi', 'Noir', 'Comedy', 'Horror', 'Romance', 'Fantasy', 'Thriller'
];

const VALID_BLOCK_TYPES = new Set(['heading', 'action', 'dialogue', 'transition']);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value, max = 4000) => (
  typeof value === 'string' && value.trim().length > 0 && value.length <= max
);

const sendError = (res, status, message, code) =>
  res.status(status).json({ error: { message, code } });

app.use(express.json({ limit: BODY_LIMIT }));

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

      const prompt = `
    You are a professional screenwriter. Write the ${isFirstScene ? 'opening' : 'next'} scene for a screenplay.
    
    Genre: ${genre}
    Premise: ${premise}
    Characters: ${characters.join(', ')}
    
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

      const response = await ai.models.generateContent({
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
      });

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

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: `Give me a short, shocking, single-sentence plot twist idea for a ${genre} story.`
      });

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

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: userPrompt,
        config: {
          systemInstruction:
            'You are a screenwriting assistant. Output ONLY the raw script text requested. Do not add quotes, prefixes, or formatting.',
          maxOutputTokens: 100,
          temperature: 0.7
        }
      });

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

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: prompt,
        config: {
          maxOutputTokens: 150,
          temperature: 0.8
        }
      });

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

      const response = await ai.models.generateContent({
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
      });

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

      const response = await ai.models.generateContent({
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
      });

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

    console.error('[ai/generate] Failed', error);
    return sendError(
      res,
      isRateLimit ? 429 : 502,
      'AI request failed.',
      isRateLimit ? 'RATE_LIMITED' : 'UPSTREAM_ERROR'
    );
  }
});

app.use((err, req, res, next) => {
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
