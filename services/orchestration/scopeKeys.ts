const asPart = (value: string | number) => String(value);

export const scopeKeys = {
  titleSuggestion: (scriptId: string) =>
    `script:${asPart(scriptId)}:title`,
  generateOpeningScene: (scriptId: string) =>
    `script:${asPart(scriptId)}:scene:opening`,
  generateNextScene: (scriptId: string) =>
    `script:${asPart(scriptId)}:scene:next`,
  suggestPlotTwist: (scriptId: string) =>
    `script:${asPart(scriptId)}:twist`,
  rewriteBlock: (scriptId: string, blockId: string) =>
    `script:${asPart(scriptId)}:block:${asPart(blockId)}:rewrite`,
  insertSurpriseText: (scriptId: string, anchorIdOrIndex: string | number) =>
    `script:${asPart(scriptId)}:insert:${asPart(anchorIdOrIndex)}`,
  setupSurprise: (setupSessionId: string) =>
    `setup:${asPart(setupSessionId)}:surprise`,
  setupAutoSurprise: (setupSessionId: string) =>
    `setup:${asPart(setupSessionId)}:auto-surprise`,
  ttsPlaybackPrefetch: (scriptId: string) =>
    `script:${asPart(scriptId)}:tts:playback`,
  ttsPlaybackRefresh: (scriptId: string) =>
    `script:${asPart(scriptId)}:tts:playback`,
  ttsPreview: (scriptId: string, voiceIdOrCharacterId: string) =>
    `script:${asPart(scriptId)}:tts:preview:${asPart(voiceIdOrCharacterId)}`,
  ttsBlockRetry: (scriptId: string, blockId: string) =>
    `script:${asPart(scriptId)}:block:${asPart(blockId)}:tts-retry`
} as const;

export type ScopeKeyBuilders = typeof scopeKeys;
