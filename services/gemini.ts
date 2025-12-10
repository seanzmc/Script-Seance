import { GoogleGenAI, Type } from "@google/genai";
import { Scene, StoryContext, BlockType, GENRES } from '../types';

const getAiClient = () => {
  let apiKey: string | undefined;
  try {
    apiKey = process.env.API_KEY;
  } catch (e) {
    console.warn("process.env access failed");
  }
  
  if (!apiKey) {
    throw new Error("API_KEY is missing from environment variables");
  }
  return new GoogleGenAI({ apiKey });
};

// --- Text Generation ---

export const generateScene = async (
  context: StoryContext,
  userInstruction: string,
  isFirstScene: boolean
): Promise<Scene> => {
  const ai = getAiClient();
  
  const previousScenesSummary = context.scenes.map((s, i) => `Scene ${i + 1}: ${s.summary}`).join('\n');
  
  const prompt = `
    You are a professional screenwriter. Write the ${isFirstScene ? 'opening' : 'next'} scene for a screenplay.
    
    Genre: ${context.genre}
    Premise: ${context.premise}
    Characters: ${context.characters.join(', ')}
    
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
      responseMimeType: "application/json",
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
                type: { type: Type.STRING, enum: ["heading", "action", "dialogue", "transition"] },
                character: { type: Type.STRING, nullable: true },
                parenthetical: { type: Type.STRING, nullable: true },
                text: { type: Type.STRING },
              },
              required: ["type", "text"],
            },
          },
        },
        required: ["heading", "summary", "blocks"],
      },
    }
  });

  const text = response.text;
  if (!text) throw new Error("No response from AI");
  
  const data = JSON.parse(text);
  
  return {
    id: crypto.randomUUID(),
    heading: data.heading,
    summary: data.summary,
    blocks: data.blocks.map((b: any) => ({ ...b, id: crypto.randomUUID() }))
  };
};

export const suggestPlotTwist = async (genre: string): Promise<string> => {
  const ai = getAiClient();
  // Using lite model for fast suggestions
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: `Give me a short, shocking, single-sentence plot twist idea for a ${genre} story.`,
  });
  return response.text || "Suddenly, everything changes.";
};

export const generateScriptElement = async (
  type: BlockType,
  character: string | undefined,
  instruction: string,
  styleContext: string
): Promise<string> => {
  const ai = getAiClient();
  
  let userPrompt = '';
  if (type === BlockType.DIALOGUE) {
    userPrompt = `Write a single line of dialogue for character "${character}". Context: ${styleContext}. Instruction: ${instruction}`;
  } else if (type === BlockType.ACTION) {
    userPrompt = `Write a concise screenplay action line. Context: ${styleContext}. Instruction: ${instruction}`;
  } else if (type === BlockType.TRANSITION) {
    userPrompt = `Write a screenplay transition (e.g. CUT TO:). Context: ${styleContext}. Instruction: ${instruction}`;
  } else if (type === BlockType.HEADING) {
    userPrompt = `Write a scene heading (slugline) like INT. HOUSE - DAY. Context: ${styleContext}. Instruction: ${instruction}`;
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: userPrompt,
    config: {
      systemInstruction: "You are a screenwriting assistant. Output ONLY the raw script text requested. Do not add quotes, prefixes, or formatting.",
      maxOutputTokens: 100,
      temperature: 0.7,
    }
  });

  return response.text?.trim() || "";
};

export const generateSurpriseSetup = async (targetGenre?: string): Promise<{ genre: string; premise: string; characters: string[] }> => {
  const ai = getAiClient();
  
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
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          genre: { type: Type.STRING },
          premise: { type: Type.STRING },
          characters: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["genre", "premise", "characters"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("No response from AI");
  
  return JSON.parse(text);
};

// --- TTS Generation ---

export const generateSpeech = async (text: string, voiceName: string): Promise<ArrayBuffer> => {
  const ai = getAiClient();
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ parts: [{ text: text }] }],
    config: {
      responseModalities: ['AUDIO' as any],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voiceName }
        }
      }
    }
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  
  if (!base64Audio) {
    throw new Error("No audio data returned");
  }

  // Decode base64 to ArrayBuffer
  const binaryString = atob(base64Audio);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};