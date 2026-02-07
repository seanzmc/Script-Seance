const LEGACY_TTS_VOICES = [
  {
    id: 'Aoede',
    displayName: 'Aoede',
    source: 'legacy',
    language: 'en-US',
    labels: ['calm', 'narrator'],
    isCustom: false,
    gender: 'Feminine',
    category: 'Calm',
    description: 'Smooth, confident, and professional. The narrator type.'
  },
  {
    id: 'Callirrhoe',
    displayName: 'Callirrhoe',
    source: 'legacy',
    language: 'en-US',
    labels: ['warm'],
    isCustom: false,
    gender: 'Feminine',
    category: 'Warm',
    description: 'Gentle, warm, and slightly breathy.'
  },
  {
    id: 'Kore',
    displayName: 'Kore',
    source: 'legacy',
    language: 'en-US',
    labels: ['firm'],
    isCustom: false,
    gender: 'Feminine',
    category: 'Firm',
    description: 'Firm, clear, and direct.'
  },
  {
    id: 'Sulafat',
    displayName: 'Sulafat',
    source: 'legacy',
    language: 'en-US',
    labels: ['warm'],
    isCustom: false,
    gender: 'Feminine',
    category: 'Warm',
    description: 'Warm, motherly, and assuring.'
  },
  {
    id: 'Zephyr',
    displayName: 'Zephyr',
    source: 'legacy',
    language: 'en-US',
    labels: ['high-energy'],
    isCustom: false,
    gender: 'Feminine',
    category: 'High Energy',
    description: 'Breezy, cheerful, and fast.'
  },
  {
    id: 'Charon',
    displayName: 'Charon',
    source: 'legacy',
    language: 'en-US',
    labels: ['deep'],
    isCustom: false,
    gender: 'Masculine',
    category: 'Deep',
    description: 'Deep, resonant, and serious.'
  },
  {
    id: 'Fenrir',
    displayName: 'Fenrir',
    source: 'legacy',
    language: 'en-US',
    labels: ['high-energy'],
    isCustom: false,
    gender: 'Masculine',
    category: 'High Energy',
    description: 'Excitable, fast, and intense.'
  },
  {
    id: 'Puck',
    displayName: 'Puck',
    source: 'legacy',
    language: 'en-US',
    labels: ['high-energy'],
    isCustom: false,
    gender: 'Masculine',
    category: 'High Energy',
    description: 'Playful, mischievous, and higher-pitch.'
  },
  {
    id: 'Rasalgethi',
    displayName: 'Rasalgethi',
    source: 'legacy',
    language: 'en-US',
    labels: ['textured'],
    isCustom: false,
    gender: 'Masculine',
    category: 'Textured',
    description: 'Gravelly, informative, and older.'
  },
  {
    id: 'Umbriel',
    displayName: 'Umbriel',
    source: 'legacy',
    language: 'en-US',
    labels: ['calm'],
    isCustom: false,
    gender: 'Masculine',
    category: 'Calm',
    description: 'Smooth, easy-going, and low-stress.'
  }
];

const LEGACY_VOICE_IDS = new Set(LEGACY_TTS_VOICES.map((voice) => voice.id));
const TTS_PROVIDER_SET = new Set(['gemini', 'inworld', 'dual']);
const AUDIO_FIELD_KEYS = ['audioBase64', 'audio_base64', 'audioContent', 'audio_content', 'audio'];

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');
const asArray = (value) => (Array.isArray(value) ? value : []);

const normalizeTtsProvider = (value, fallback = 'dual') => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return TTS_PROVIDER_SET.has(normalized) ? normalized : fallback;
};

const mergeUniqueLabels = (labels) => {
  const next = new Set();
  asArray(labels).forEach((label) => {
    if (typeof label === 'string' && label.trim().length > 0) {
      next.add(label.trim().toLowerCase());
    }
  });
  return [...next];
};

const applyExpressiveText = (rawText, expressive) => {
  const text = normalizeString(rawText);
  if (!expressive || !text) {
    return text;
  }
  return text
    .replace(/\((whisper(?:ing)?|whispers?)\)/gi, '[whisper]')
    .replace(/\((sighs?|sighing)\)/gi, '[sigh]')
    .replace(/\((laughs?|laughing)\)/gi, '[laugh]')
    .replace(/\((beat|pause)\)/gi, '[pause=250ms]');
};

const extractAudioBase64FromPayload = (value, depth = 0) => {
  if (depth > 6 || value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    return trimmed;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractAudioBase64FromPayload(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === 'object') {
    const record = value;
    for (const key of AUDIO_FIELD_KEYS) {
      if (key in record) {
        const found = extractAudioBase64FromPayload(record[key], depth + 1);
        if (found) return found;
      }
    }
    for (const nestedKey of ['result', 'data', 'chunk', 'message', 'payload']) {
      if (nestedKey in record) {
        const found = extractAudioBase64FromPayload(record[nestedKey], depth + 1);
        if (found) return found;
      }
    }
  }
  return null;
};

const parseJsonLine = (line) => {
  const normalized = line.startsWith('data:') ? line.slice(5).trim() : line.trim();
  if (!normalized || normalized === '[DONE]') {
    return null;
  }
  try {
    return JSON.parse(normalized);
  } catch {
    return null;
  }
};

const normalizeBase64Chunk = (value) => {
  if (typeof value !== 'string') return '';
  const withoutDataUrl = value.replace(/^data:[^;]+;base64,/i, '');
  const compact = withoutDataUrl.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!compact) return '';
  const remainder = compact.length % 4;
  if (remainder === 0) return compact;
  return `${compact}${'='.repeat(4 - remainder)}`;
};

const decodeBase64Chunk = (value) => {
  const normalized = normalizeBase64Chunk(value);
  if (!normalized) return null;
  try {
    return Buffer.from(normalized, 'base64');
  } catch {
    return null;
  }
};

const collectAudioFromStreamBody = async (body) => {
  if (!body || typeof body.getReader !== 'function') {
    return '';
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parts = [];
  const chunkBytes = [];
  let buffered = '';
  let rawBody = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    rawBody += chunk;
    buffered += chunk;

    let newlineIndex = buffered.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = buffered.slice(0, newlineIndex);
      buffered = buffered.slice(newlineIndex + 1);
      newlineIndex = buffered.indexOf('\n');

      const parsed = parseJsonLine(line);
      if (!parsed) continue;
      const audioBase64 = extractAudioBase64FromPayload(parsed);
      if (audioBase64) {
        parts.push(audioBase64);
        const bytes = decodeBase64Chunk(audioBase64);
        if (bytes && bytes.length > 0) {
          chunkBytes.push(bytes);
        }
      }
    }
  }

  const finalChunk = decoder.decode();
  if (finalChunk) {
    rawBody += finalChunk;
    buffered += finalChunk;
  }
  const parsedTail = parseJsonLine(buffered);
  if (parsedTail) {
    const audioBase64 = extractAudioBase64FromPayload(parsedTail);
    if (audioBase64) {
      parts.push(audioBase64);
      const bytes = decodeBase64Chunk(audioBase64);
      if (bytes && bytes.length > 0) {
        chunkBytes.push(bytes);
      }
    }
  }

  if (parts.length === 0) {
    const parsedWhole = parseJsonLine(rawBody);
    if (parsedWhole) {
      const audioBase64 = extractAudioBase64FromPayload(parsedWhole);
      if (audioBase64) {
        parts.push(audioBase64);
        const bytes = decodeBase64Chunk(audioBase64);
        if (bytes && bytes.length > 0) {
          chunkBytes.push(bytes);
        }
      }
    }
  }

  if (parts.length > 0 && chunkBytes.length === parts.length) {
    return Buffer.concat(chunkBytes).toString('base64');
  }

  return parts.join('');
};

const parseInworldVoiceList = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  const record = payload;
  const candidates = [record.voices, record.items, record.data, record.results];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
};

const normalizeInworldVoice = (voice, source, isCustom) => {
  if (!voice || typeof voice !== 'object') {
    return null;
  }
  const record = voice;
  const id = normalizeString(
    record.id ||
    record.voiceId ||
    record.voiceName ||
    record.name ||
    record.key
  );
  if (!id) return null;

  const displayName = normalizeString(record.displayName || record.name || record.voiceName || id);
  const languages = asArray(record.languages).filter((entry) => typeof entry === 'string');
  const language = normalizeString(
    record.language ||
    record.languageCode ||
    record.locale ||
    languages[0] ||
    record.metadata?.language
  );
  const gender = normalizeString(record.gender || record.metadata?.gender);
  const category = normalizeString(record.category || record.style || record.metadata?.category);
  const description = normalizeString(record.description || record.summary || record.metadata?.description);
  const tags = mergeUniqueLabels([
    ...(asArray(record.tags)),
    ...(asArray(record.labels)),
    ...(asArray(record.styles)),
    ...(asArray(record.metadata?.tags))
  ]);
  const labels = mergeUniqueLabels([
    ...tags,
    ...(category ? [category] : []),
    ...(gender ? [gender] : [])
  ]);

  return {
    id,
    displayName: displayName || id,
    source,
    language: language || undefined,
    labels,
    tags,
    isCustom,
    gender: gender || undefined,
    category: category || undefined,
    description: description || undefined
  };
};

const dedupeVoices = (voices) => {
  const byId = new Map();
  for (const voice of voices) {
    if (!voice || typeof voice.id !== 'string') continue;
    if (!byId.has(voice.id)) {
      byId.set(voice.id, voice);
      continue;
    }
    const prev = byId.get(voice.id);
    const merged = { ...prev };
    for (const [key, value] of Object.entries(voice)) {
      if (value !== undefined) {
        merged[key] = value;
      }
    }
    merged.labels = mergeUniqueLabels([...(prev.labels || []), ...(voice.labels || [])]);
    merged.tags = mergeUniqueLabels([...(prev.tags || []), ...(voice.tags || [])]);
    byId.set(voice.id, merged);
  }
  return [...byId.values()];
};

const isInworldVoiceFetchErrorRecoverable = (status) =>
  status === 404 || status === 405 || status === 400 || status === 422;

export {
  LEGACY_TTS_VOICES,
  LEGACY_VOICE_IDS,
  normalizeTtsProvider,
  applyExpressiveText,
  extractAudioBase64FromPayload,
  collectAudioFromStreamBody,
  parseInworldVoiceList,
  normalizeInworldVoice,
  dedupeVoices,
  isInworldVoiceFetchErrorRecoverable
};
