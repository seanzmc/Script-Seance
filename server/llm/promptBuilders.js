export const SCRIPT_ELEMENT_SYSTEM_INSTRUCTION =
  'You are a screenwriting assistant. Output ONLY the raw script text requested. Do not add quotes, prefixes, or formatting.';

const STYLE_BLOCK_MAX_CHARS = 500;
const SURPRISE_STYLE_GUIDANCE_MAX_CHARS = 240;
const collapseWhitespace = (value) => value.replace(/\s+/g, ' ').trim();
const joinPromptSections = (sections, separator = '\n\n') => sections
  .filter((section) => typeof section === 'string' && section.trim())
  .map((section) => section.trim())
  .join(separator);

const createPromptParts = ({ instructions, input }) => {
  const instructionsText = joinPromptSections(
    Array.isArray(instructions) ? instructions : [instructions]
  );
  const inputText = joinPromptSections(
    Array.isArray(input) ? input : [input]
  );
  const previewText = joinPromptSections([
    instructionsText ? `Instructions:\n${instructionsText}` : '',
    inputText ? `Input:\n${inputText}` : ''
  ]);
  return {
    instructions: instructionsText,
    input: inputText,
    previewText
  };
};

export const formatStyleBlock = (style) => {
  if (typeof style !== 'string') return '';
  const normalized = collapseWhitespace(style);
  if (!normalized) return '';
  const capped = normalized.length > STYLE_BLOCK_MAX_CHARS
    ? normalized.slice(0, STYLE_BLOCK_MAX_CHARS).trim()
    : normalized;
  return capped ? `Style Theme: ${capped}` : '';
};

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
  style = '',
  styleContext = '',
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
  const styleTheme = formatStyleBlock(styleContext || style);
  const lengthProfile = getSceneLengthProfile(targetLength, isFirstScene);
  const promptParts = createPromptParts({
    instructions: [
      `You are a professional screenwriter. Write the ${isFirstScene ? 'opening' : 'next'} scene for a screenplay.`,
      [
        'Style requirements:',
        '- Keep the selected style unmistakable in imagery, dialogue cadence, and word choice.',
        '- Do not just name the style; express it directly in how every block reads.'
      ].join('\n'),
      [
        'Length requirements:',
        `- Aim for roughly ${lengthProfile.wordRange} words unless the user explicitly asks otherwise.`,
        `- Prefer ${lengthProfile.minBlocks}-${lengthProfile.maxBlocks} screenplay blocks.`,
        '- Keep each block tight and playable.',
        '- If you are nearing token limits, reduce detail and end early with complete thoughts.',
        '- Never end a block in a cut-off sentence or dangling fragment.'
      ].join('\n'),
      'IMPORTANT: Return ONLY a JSON object representing the scene. Do not include markdown formatting or extra text.',
      [
        'The JSON schema is:',
        '{',
        '  "heading": "INT. LOCATION - TIME",',
        '  "summary": "A one sentence summary of what happens in this scene for context tracking.",',
        '  "blocks": [',
        '    {',
        '      "type": "action" | "dialogue" | "transition",',
        '      "character": "CHARACTER NAME (only for dialogue)",',
        '      "parenthetical": "(optional parenthetical instruction)",',
        '      "text": "The content of the block"',
        '    }',
        '  ]',
        '}'
      ].join('\n'),
      [
        'Scene heading contract:',
        '- Put the scene heading ONLY in top-level "heading".',
        '- Do NOT emit a heading block inside "blocks".'
      ].join('\n'),
      'Ensure the output is valid JSON.'
    ],
    input: [
      `Genre: ${genre}`,
      `Premise: ${premise}`,
      `Characters: ${charactersList}`,
      styleTheme || 'Style Theme: Lean into a vivid, genre-faithful cinematic voice.',
      `Target Length: ${lengthProfile.label}`,
      previousScenesSummary ? `Previous Story Context:\n${previousScenesSummary}` : '',
      `User Instruction for this scene: "${userInstruction}"`
    ]
  });

  return {
    ...promptParts,
    promptSize: [
      promptParts.previewText
    ].filter(Boolean).join('\n').length,
    lengthProfile
  };
};

export const buildPlotTwistPrompt = (genre, style) => createPromptParts({
  instructions: [
    'Give me a short, shocking, single-sentence plot twist idea.',
    'Output only one sentence.'
  ],
  input: [
    `Genre: ${genre}.`,
    formatStyleBlock(style)
  ]
});

export const buildScriptElementPrompt = ({ type, character, instruction, styleContext }) => {
  const styleBlock = formatStyleBlock(styleContext) || 'Style Theme: Match the established screenplay voice.';
  if (type === 'dialogue') {
    return createPromptParts({
      instructions: `Write a single line of dialogue for character "${character}".`,
      input: [
        styleBlock,
        `Instruction: ${instruction}`
      ]
    });
  }
  if (type === 'action') {
    return createPromptParts({
      instructions: 'Write a concise screenplay action line.',
      input: [
        styleBlock,
        `Instruction: ${instruction}`
      ]
    });
  }
  if (type === 'transition') {
    return createPromptParts({
      instructions: 'Write a screenplay transition (e.g. CUT TO:).',
      input: [
        styleBlock,
        `Instruction: ${instruction}`
      ]
    });
  }
  if (type === 'heading') {
    return createPromptParts({
      instructions: 'Write a scene heading (slugline) like INT. HOUSE - DAY.',
      input: [
        styleBlock,
        `Instruction: ${instruction}`
      ]
    });
  }
  return createPromptParts({ instructions: '', input: '' });
};

export const buildRegenerateBlockPrompt = ({ type, character, genre, premise, text, style, rewriteGuidance }) => {
  const guidanceText = typeof rewriteGuidance === 'string' ? rewriteGuidance.trim() : '';
  const styleBlock = formatStyleBlock(style);

  if (type === 'dialogue') {
    return createPromptParts({
      instructions: [
        `Rewrite this dialogue line for ${character} to be more impactful, witty, or dramatic, fitting the genre "${genre}".`,
        'Output ONLY the new dialogue text.'
      ],
      input: [
        `Premise: ${premise}.`,
        styleBlock,
        `Original line: "${text}".`,
        guidanceText ? `Additional direction: ${guidanceText}.` : ''
      ]
    });
  }

  return createPromptParts({
    instructions: [
      `Rewrite this screenplay ${type} block to be more descriptive and engaging.`,
      'Output ONLY the new text.'
    ],
    input: [
      `Genre: ${genre}.`,
      `Premise: ${premise}.`,
      styleBlock,
      `Original text: "${text}".`,
      guidanceText ? `Additional direction: ${guidanceText}.` : ''
    ]
  });
};

export const buildSurpriseSetupPrompt = ({ targetGenre, genres, style }) => {
  const genreInstruction = targetGenre
    ? `The genre MUST be "${targetGenre}".`
    : `Pick a genre from this list if suitable: ${genres.join(', ')}, otherwise choose a fitting one.`;
  const normalizedStyleId = typeof style?.styleId === 'string' ? collapseWhitespace(style.styleId) : '';
  const normalizedStyleName = typeof style?.styleName === 'string' ? collapseWhitespace(style.styleName) : '';
  const normalizedLegacyStyle = typeof style?.legacyStyle === 'string'
    ? collapseWhitespace(style.legacyStyle)
    : '';
  const styleLabel = normalizedStyleName || normalizedLegacyStyle;
  const styleHeading = normalizedStyleId
    ? (styleLabel ? `Style: ${styleLabel} (${normalizedStyleId})` : `Style: ${normalizedStyleId}`)
    : (styleLabel ? `Style: ${styleLabel}` : '');
  const normalizedStyleGuidance = typeof style?.styleGuidance === 'string'
    ? collapseWhitespace(style.styleGuidance)
    : '';
  const cappedStyleGuidance = normalizedStyleGuidance.length > SURPRISE_STYLE_GUIDANCE_MAX_CHARS
    ? normalizedStyleGuidance.slice(0, SURPRISE_STYLE_GUIDANCE_MAX_CHARS).trim()
    : normalizedStyleGuidance;
  const styleGuidanceLine = cappedStyleGuidance
    ? `Style guidance: ${cappedStyleGuidance}`
    : '';

  return createPromptParts({
    instructions: [
      'Generate a creative, unique, and interesting movie premise.',
      genreInstruction,
      'Return a JSON object with:',
      `'genre' (string)${targetGenre ? ' - Use the exact requested genre string.' : ''},`,
      "'premise' (string, 1-2 sentences),",
      "'characters' (array of 3 character names with brief role description, e.g. \"John (The Detective)\")."
    ],
    input: [
      styleHeading,
      styleGuidanceLine
    ]
  });
};
