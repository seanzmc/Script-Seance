const NARRATOR_FRIENDLY_LABELS = new Set(['narrator', 'calm', 'neutral', 'professional']);
const DISALLOWED_VOICE_KEYS = new Set(['hades']);
const MASCULINE_VOICE_LABELS = new Set(['masculine', 'male']);
const FEMININE_VOICE_LABELS = new Set(['feminine', 'female']);

export const DEFAULT_NARRATOR_VOICE_KEY = 'mark';

export const DEFAULT_VOICE_CONFIG = Object.freeze({
  speed: 1,
  pitch: 0,
  expressive: false
});

const normalizeVoiceToken = (value) =>
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
    : '';

const hashString = (value) => {
  const source = typeof value === 'string' ? value : '';
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const hasVoiceLabel = (voice, labels) => {
  const candidates = [
    voice?.gender,
    ...(Array.isArray(voice?.labels) ? voice.labels : []),
    ...(Array.isArray(voice?.tags) ? voice.tags : [])
  ];
  return candidates.some((value) => labels.has(String(value).trim().toLowerCase()));
};

export const isDisallowedVoiceId = (voiceId) => DISALLOWED_VOICE_KEYS.has(normalizeVoiceToken(voiceId));

export const getSelectableVoices = (voices) =>
  Array.isArray(voices)
    ? voices.filter((voice) => (
      typeof voice?.id === 'string' &&
      voice.id.trim().length > 0 &&
      !isDisallowedVoiceId(voice.id)
    ))
    : [];

export const getAutoAssignableVoices = (voices) =>
  getSelectableVoices(voices).filter((voice) => voice.autoAssignable === true);

export const getVoiceAssignmentPools = (voices) => {
  const selectableVoices = getSelectableVoices(voices);
  const combinedAutoAssignableVoices = getAutoAssignableVoices(voices);
  const maleAutoAssignableVoices = combinedAutoAssignableVoices.filter((voice) =>
    hasVoiceLabel(voice, MASCULINE_VOICE_LABELS)
  );
  const femaleAutoAssignableVoices = combinedAutoAssignableVoices.filter((voice) =>
    hasVoiceLabel(voice, FEMININE_VOICE_LABELS)
  );

  return {
    selectableVoices,
    combinedAutoAssignableVoices,
    maleAutoAssignableVoices,
    femaleAutoAssignableVoices
  };
};

const pickDeterministicVoiceId = (voices, seedKey = '', usedVoiceIds = []) => {
  if (!Array.isArray(voices) || voices.length === 0) {
    return '';
  }

  const blocked = new Set(
    Array.isArray(usedVoiceIds)
      ? usedVoiceIds.filter((value) => typeof value === 'string' && value.trim().length > 0)
      : []
  );
  const startIndex = hashString(seedKey) % voices.length;

  for (let offset = 0; offset < voices.length; offset += 1) {
    const voice = voices[(startIndex + offset) % voices.length];
    if (voice?.id && !blocked.has(voice.id)) {
      return voice.id;
    }
  }

  return typeof voices[startIndex]?.id === 'string' ? voices[startIndex].id : '';
};

export const resolveDefaultNarratorVoiceId = (voices) => {
  const selectableVoices = getSelectableVoices(voices);
  if (selectableVoices.length === 0) {
    return '';
  }

  const byNarratorKey = selectableVoices.find((voice) => {
    const idToken = normalizeVoiceToken(voice?.id);
    const nameToken = normalizeVoiceToken(voice?.displayName);
    return idToken === DEFAULT_NARRATOR_VOICE_KEY || nameToken === DEFAULT_NARRATOR_VOICE_KEY;
  });
  if (byNarratorKey?.id) {
    return byNarratorKey.id;
  }

  const byLabel = selectableVoices.find((voice) =>
    Array.isArray(voice?.labels) &&
    voice.labels.some((label) => NARRATOR_FRIENDLY_LABELS.has(String(label).toLowerCase()))
  );
  if (byLabel?.id) {
    return byLabel.id;
  }

  return typeof selectableVoices[0]?.id === 'string' ? selectableVoices[0].id : '';
};

export const resolveSafestValidVoiceId = (voices) => {
  const selectableVoices = getSelectableVoices(voices);
  return resolveDefaultNarratorVoiceId(selectableVoices)
    || (typeof selectableVoices[0]?.id === 'string' ? selectableVoices[0].id : '');
};

export const resolveAutomaticVoiceId = ({
  voices,
  preference = 'random',
  seedKey = '',
  usedVoiceIds = []
}) => {
  const {
    selectableVoices,
    combinedAutoAssignableVoices,
    maleAutoAssignableVoices,
    femaleAutoAssignableVoices
  } = getVoiceAssignmentPools(voices);

  let preferredVoices = combinedAutoAssignableVoices;
  if (preference === 'male') {
    preferredVoices = maleAutoAssignableVoices;
  } else if (preference === 'female') {
    preferredVoices = femaleAutoAssignableVoices;
  }

  const activeVoices = preferredVoices.length > 0
    ? preferredVoices
    : combinedAutoAssignableVoices;
  const automaticVoiceId = pickDeterministicVoiceId(activeVoices, seedKey, usedVoiceIds);
  if (automaticVoiceId) {
    return automaticVoiceId;
  }

  return pickDeterministicVoiceId(selectableVoices, seedKey, usedVoiceIds);
};

export const sanitizeVoiceIdForUsage = ({
  voiceId,
  voices,
  isNarrator = false,
  preference = 'random',
  seedKey = '',
  usedVoiceIds = []
}) => {
  const selectableVoices = getSelectableVoices(voices);
  if (selectableVoices.length === 0) {
    return isDisallowedVoiceId(voiceId) ? '' : (typeof voiceId === 'string' ? voiceId : '');
  }
  if (selectableVoices.some((voice) => voice.id === voiceId)) {
    return voiceId;
  }

  if (isNarrator) {
    const preferredNarratorVoiceId = (preference === 'male' || preference === 'female')
      ? resolveAutomaticVoiceId({
          voices: selectableVoices,
          preference,
          seedKey
        })
      : '';
    return preferredNarratorVoiceId
      || resolveDefaultNarratorVoiceId(selectableVoices)
      || resolveSafestValidVoiceId(selectableVoices);
  }

  return resolveAutomaticVoiceId({
    voices: selectableVoices,
    preference,
    seedKey,
    usedVoiceIds
  }) || resolveSafestValidVoiceId(selectableVoices);
};
