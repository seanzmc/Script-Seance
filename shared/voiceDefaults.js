const NARRATOR_FRIENDLY_LABELS = new Set(['narrator', 'calm', 'neutral', 'professional']);

export const DEFAULT_NARRATOR_VOICE_KEY = 'hades';

export const DEFAULT_VOICE_CONFIG = Object.freeze({
  speed: 1,
  pitch: 0,
  expressive: false
});

const normalizeVoiceToken = (value) =>
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
    : '';

export const resolveDefaultNarratorVoiceId = (voices) => {
  if (!Array.isArray(voices) || voices.length === 0) {
    return '';
  }

  const byNarratorKey = voices.find((voice) => {
    const idToken = normalizeVoiceToken(voice?.id);
    const nameToken = normalizeVoiceToken(voice?.displayName);
    return idToken === DEFAULT_NARRATOR_VOICE_KEY || nameToken === DEFAULT_NARRATOR_VOICE_KEY;
  });
  if (byNarratorKey?.id) {
    return byNarratorKey.id;
  }

  const byLabel = voices.find((voice) =>
    Array.isArray(voice?.labels) &&
    voice.labels.some((label) => NARRATOR_FRIENDLY_LABELS.has(String(label).toLowerCase()))
  );
  if (byLabel?.id) {
    return byLabel.id;
  }

  return typeof voices[0]?.id === 'string' ? voices[0].id : '';
};
