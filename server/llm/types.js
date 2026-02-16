export const TEXT_GENERATION_KINDS = new Set([
  'generateScene',
  'suggestPlotTwist',
  'generateScriptElement',
  'regenerateScriptBlock',
  'generateSurpriseSetup'
]);

export const isTextGenerationKind = (kind) => TEXT_GENERATION_KINDS.has(kind);
