export const SCRIPT_ELEMENT_SYSTEM_INSTRUCTION =
  'You are a screenwriting assistant. Output ONLY the raw script text requested. Do not add quotes, prefixes, or formatting.';

const SCENE_LENGTH_PROFILES = {
  short: {
    label: 'Short',
    wordRange: '140-260',
    openingBlocks: { min: 4, max: 7 },
    nextBlocks: { min: 5, max: 8 },
    maxOutputTokens: 900
  },
  medium: {
    label: 'Medium',
    wordRange: '260-480',
    openingBlocks: { min: 6, max: 10 },
    nextBlocks: { min: 8, max: 12 },
    maxOutputTokens: 1500
  },
  long: {
    label: 'Long',
    wordRange: '480-850',
    openingBlocks: { min: 10, max: 15 },
    nextBlocks: { min: 12, max: 18 },
    maxOutputTokens: 2600
  }
};

const normalizeSceneLength = (value) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'short' || normalized === 'long' || normalized === 'medium') {
    return normalized;
  }
  return 'medium';
};

export const getSceneLengthProfile = (targetLength, isFirstScene) => {
  const key = normalizeSceneLength(targetLength);
  const profile = SCENE_LENGTH_PROFILES[key];
  const blockRange = isFirstScene ? profile.openingBlocks : profile.nextBlocks;
  return {
    key,
    label: profile.label,
    wordRange: profile.wordRange,
    minBlocks: blockRange.min,
    maxBlocks: blockRange.max,
    maxOutputTokens: profile.maxOutputTokens
  };
};

export const buildGenerateScenePrompt = ({
  genre,
  premise,
  characters,
  scenes,
  userInstruction,
  isFirstScene,
  style,
  targetLength
}) => {
  const previousScenesSummary = Array.isArray(scenes)
    ? scenes
        .map((scene, index) =>
          scene && typeof scene === 'object' && typeof scene.summary === 'string' && scene.summary.trim().length > 0
            ? `Scene ${index + 1}: ${scene.summary}`
            : null
        )
        .filter(Boolean)
        .join('\n')
    : '';

  const charactersList = Array.isArray(characters) ? characters.join(', ') : '';
  const styleTheme = typeof style === 'string' ? style.trim() : '';
  const lengthProfile = getSceneLengthProfile(targetLength, isFirstScene);

  const prompt = `
    You are a professional screenwriter. Write the ${isFirstScene ? 'opening' : 'next'} scene for a screenplay.

    Genre: ${genre}
    Premise: ${premise}
    Characters: ${charactersList}
    Style Theme: ${styleTheme || 'Lean into a vivid, genre-faithful cinematic voice.'}
    Target Length: ${lengthProfile.label}

    ${previousScenesSummary ? `Previous Story Context:\n${previousScenesSummary}` : ''}

    User Instruction for this scene: "${userInstruction}"

    Style requirements:
    - Keep the selected style unmistakable in imagery, dialogue cadence, and word choice.
    - Do not just name the style; express it directly in how every block reads.

    Length requirements:
    - Aim for roughly ${lengthProfile.wordRange} words unless the user explicitly asks otherwise.
    - Prefer ${lengthProfile.minBlocks}-${lengthProfile.maxBlocks} screenplay blocks.
    - Keep each block tight and playable.

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

  return {
    prompt,
    promptSize: [
      genre,
      premise,
      charactersList,
      styleTheme,
      lengthProfile.label,
      userInstruction,
      previousScenesSummary
    ].filter(Boolean).join('\n').length,
    lengthProfile
  };
};

export const buildPlotTwistPrompt = (genre) =>
  `Give me a short, shocking, single-sentence plot twist idea for a ${genre} story.`;

export const buildScriptElementPrompt = ({ type, character, instruction, styleContext }) => {
  if (type === 'dialogue') {
    return `Write a single line of dialogue for character "${character}". Context: ${styleContext}. Instruction: ${instruction}`;
  }
  if (type === 'action') {
    return `Write a concise screenplay action line. Context: ${styleContext}. Instruction: ${instruction}`;
  }
  if (type === 'transition') {
    return `Write a screenplay transition (e.g. CUT TO:). Context: ${styleContext}. Instruction: ${instruction}`;
  }
  if (type === 'heading') {
    return `Write a scene heading (slugline) like INT. HOUSE - DAY. Context: ${styleContext}. Instruction: ${instruction}`;
  }
  return '';
};

export const buildRegenerateBlockPrompt = ({ type, character, genre, premise, text, rewriteGuidance }) => {
  const guidanceText = typeof rewriteGuidance === 'string' ? rewriteGuidance.trim() : '';

  if (type === 'dialogue') {
    return `Rewrite this dialogue line for ${character} to be more impactful, witty, or dramatic, fitting the genre "${genre}". 
    Premise: ${premise}.
    Original line: "${text}".
    ${guidanceText ? `Additional direction: ${guidanceText}.` : ''}
    Output ONLY the new dialogue text.`;
  }

  return `Rewrite this screenplay ${type} block to be more descriptive and engaging. 
    Genre: ${genre}.
    Premise: ${premise}.
    Original text: "${text}".
    ${guidanceText ? `Additional direction: ${guidanceText}.` : ''}
    Output ONLY the new text.`;
};

export const buildSurpriseSetupPrompt = ({ targetGenre, genres }) => {
  const genreInstruction = targetGenre
    ? `The genre MUST be "${targetGenre}".`
    : `Pick a genre from this list if suitable: ${genres.join(', ')}, otherwise choose a fitting one.`;

  return `
    Generate a creative, unique, and interesting movie premise. 
    ${genreInstruction}
    Return a JSON object with: 
    'genre' (string)${targetGenre ? ' - Use the exact requested genre string.' : ''}, 
    'premise' (string, 1-2 sentences), 
    'characters' (array of 3 character names with brief role description, e.g. "John (The Detective)").
  `;
};
