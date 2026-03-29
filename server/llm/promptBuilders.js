export const SCRIPT_ELEMENT_SYSTEM_INSTRUCTION =
  'You are a screenwriting assistant. Output ONLY the raw script text requested. Do not add quotes, prefixes, or formatting.';

const STYLE_BLOCK_MAX_CHARS = 500;
const SURPRISE_STYLE_GUIDANCE_MAX_CHARS = 240;
const RECENT_SCENE_BLOCK_COUNT = 3;
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
    nextBlocks: { min: 5, max: 8 }
  },
  medium: {
    label: 'Medium',
    wordRange: '260-480',
    openingBlocks: { min: 6, max: 10 },
    nextBlocks: { min: 8, max: 12 }
  },
  long: {
    label: 'Long',
    wordRange: '480-850',
    openingBlocks: { min: 10, max: 15 },
    nextBlocks: { min: 12, max: 18 }
  }
};

const normalizeSceneLength = (value) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'short' || normalized === 'long' || normalized === 'medium') {
    return normalized;
  }
  return 'medium';
};

const getSceneLengthProfile = (targetLength, isFirstScene) => {
  const key = normalizeSceneLength(targetLength);
  const profile = SCENE_LENGTH_PROFILES[key];
  const blockRange = isFirstScene ? profile.openingBlocks : profile.nextBlocks;
  return {
    key,
    label: profile.label,
    wordRange: profile.wordRange,
    minBlocks: blockRange.min,
    maxBlocks: blockRange.max
  };
};

const formatSceneSummaryLine = (scene, index) => {
  const summary = typeof scene?.summary === 'string' ? scene.summary.trim() : '';
  return summary ? `Scene ${index + 1}: ${summary}` : null;
};

const formatRecentSceneBlock = (block, index) => {
  if (!block || typeof block !== 'object') return null;
  const text = typeof block.text === 'string' ? block.text.trim() : '';
  const type = typeof block.type === 'string' ? block.type.trim().toLowerCase() : '';
  if (!text || !type) return null;

  if (type === 'dialogue') {
    const character = typeof block.character === 'string' ? block.character.trim() : '';
    const parenthetical = typeof block.parenthetical === 'string' ? block.parenthetical.trim() : '';
    const speakerLine = [character || 'UNKNOWN', parenthetical].filter(Boolean).join(' ');
    return `${index + 1}. DIALOGUE - ${speakerLine}: ${text}`;
  }

  if (type === 'transition') {
    return `${index + 1}. TRANSITION: ${text}`;
  }

  return `${index + 1}. ACTION: ${text}`;
};

export const buildSceneHistoryContext = (scenes) => {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return {
      olderSceneSummaries: [],
      recentSceneHeading: '',
      recentSceneBlocks: [],
      inputText: ''
    };
  }

  const recentScene = scenes[scenes.length - 1];
  const olderSceneSummaries = scenes
    .slice(0, -1)
    .map(formatSceneSummaryLine)
    .filter(Boolean);
  const recentSceneHeading = typeof recentScene?.heading === 'string' ? recentScene.heading.trim() : '';
  const recentSceneBlocks = Array.isArray(recentScene?.blocks)
    ? recentScene.blocks
      .slice(-RECENT_SCENE_BLOCK_COUNT)
      .map(formatRecentSceneBlock)
      .filter(Boolean)
    : [];

  const inputText = joinPromptSections([
    olderSceneSummaries.length
      ? `Earlier scene summaries:\n${olderSceneSummaries.join('\n')}`
      : '',
    (recentSceneHeading || recentSceneBlocks.length)
      ? joinPromptSections([
          'Most recent prior scene:',
          recentSceneHeading ? `Heading: ${recentSceneHeading}` : '',
          recentSceneBlocks.length ? `Recent blocks:\n${recentSceneBlocks.join('\n')}` : ''
        ], '\n')
      : ''
  ]);

  return {
    olderSceneSummaries,
    recentSceneHeading,
    recentSceneBlocks,
    inputText
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
  const charactersList = Array.isArray(characters) ? characters.join(', ') : '';
  const styleTheme = formatStyleBlock(styleContext || style);
  const lengthProfile = getSceneLengthProfile(targetLength, isFirstScene);
  const sceneHistory = buildSceneHistoryContext(scenes);
  const promptParts = createPromptParts({
    instructions: [
      `You are a professional screenwriter. Write the ${isFirstScene ? 'opening' : 'next'} scene for a screenplay.`,
      [
        'Completion criteria:',
        '- Advance the story with a concrete turn, reveal, or complication.',
        '- Stay consistent with the provided recent-scene details.',
        '- End on a playable beat with complete thoughts.'
      ].join('\n'),
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
      'Ensure the output is valid JSON.'
    ],
    input: [
      `Genre: ${genre}`,
      `Premise: ${premise}`,
      `Characters: ${charactersList}`,
      styleTheme || 'Style Theme: Lean into a vivid, genre-faithful cinematic voice.',
      `Target Length: ${lengthProfile.label}`,
      sceneHistory.inputText ? `Previous Story Context:\n${sceneHistory.inputText}` : '',
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

export const buildPlotTwistPrompt = ({
  genre,
  premise,
  characters,
  recentSceneHeading,
  recentSceneSummary,
  userInstruction,
  style
}) => {
  const normalizedCharacters = Array.isArray(characters)
    ? characters.map((character) => collapseWhitespace(character)).filter(Boolean)
    : [];
  const recentStoryContext = [
    typeof recentSceneHeading === 'string' && recentSceneHeading.trim()
      ? `Heading: ${recentSceneHeading.trim()}`
      : '',
    typeof recentSceneSummary === 'string' && recentSceneSummary.trim()
      ? `Summary: ${recentSceneSummary.trim()}`
      : ''
  ].filter(Boolean);

  return createPromptParts({
    instructions: [
      'Suggest exactly one plot twist sentence for what should happen next in the screenplay.',
      'It must stay compatible with the premise, named characters, and recent story facts.',
      'It must introduce a concrete complication, reveal, or reversal that changes what happens next.',
      'Avoid generic filler phrasing or vague "everything changes" language.',
      'Output only one sentence.'
    ],
    input: [
      `Genre: ${genre}.`,
      typeof premise === 'string' && premise.trim() ? `Premise: ${premise.trim()}` : '',
      normalizedCharacters.length ? `Named characters: ${normalizedCharacters.join(', ')}.` : '',
      recentStoryContext.length ? `Recent story context:\n${recentStoryContext.join('\n')}` : '',
      typeof userInstruction === 'string' && userInstruction.trim()
        ? `Current user instruction: ${userInstruction.trim()}`
        : '',
      formatStyleBlock(style)
    ]
  });
};

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
        `Rewrite this dialogue line for ${character} so it lands better while preserving the line's core intent in the genre "${genre}".`,
        'Keep the same speaker identity and stay consistent with the surrounding story continuity.',
        'Return dialogue only. Do not add speaker labels, stage directions, or extra lines.',
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
      `Rewrite this screenplay ${type} block to improve phrasing while preserving its core intent.`,
      'Keep continuity with the surrounding story context and preserve the same block type.',
      'Do not add dialogue, speaker labels, or extra screenplay blocks.',
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
      'Generate a creative, specific movie premise.',
      genreInstruction,
      'Make the premise concrete rather than generic or cliche.',
      'Make the three characters clearly distinct from one another in role and energy.',
      'Avoid vague setup language and generic stakes.',
      'Return a JSON object with:',
      `'genre' (string)${targetGenre ? ' - Use the exact requested genre string.' : ''},`,
      "'premise' (string, 1-2 sentences),",
      "'characters' (array of exactly 3 plain strings with brief role description, e.g. \"John (The Detective)\").",
      "Do not use objects, nested fields, numbering, or extra wrapper keys inside 'characters'."
    ],
    input: [
      styleHeading,
      styleGuidanceLine
    ]
  });
};
