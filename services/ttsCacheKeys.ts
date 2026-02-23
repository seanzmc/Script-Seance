export const TTS_CACHE_SCHEMA_VERSION = 3;

export type TtsCacheCommonFields = {
  provider: string;
  modelId: string;
  audioEncoding: string;
  sampleRateHz: number;
  voiceId: string;
  expressive: boolean;
};

export type TtsBlockCacheKeyInput = TtsCacheCommonFields & {
  blockId: string;
  blockRevision: number;
  schemaVersion?: number;
};

export type TtsPreviewCacheKeyInput = TtsCacheCommonFields & {
  text: string;
  schemaVersion?: number;
};

const encodePart = (value: string | number | boolean) =>
  encodeURIComponent(String(value));

export const normalizePreviewText = (text: string) => text.replace(/\s+/g, ' ').trim();

export const hashNormalizedText = (text: string) => {
  // FNV-1a 32-bit hash for deterministic, sync cache-key hashing.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const buildCommonKeyPrefix = (fields: TtsCacheCommonFields, schemaVersion: number) => (
  `tts:v${schemaVersion}:${encodePart(fields.provider)}:${encodePart(fields.modelId)}:${encodePart(fields.audioEncoding)}:${encodePart(fields.sampleRateHz)}:${encodePart(fields.voiceId)}:${fields.expressive ? '1' : '0'}`
);

export const buildTtsBlockCacheKey = (input: TtsBlockCacheKeyInput) => {
  const schemaVersion = input.schemaVersion ?? TTS_CACHE_SCHEMA_VERSION;
  const prefix = buildCommonKeyPrefix(input, schemaVersion);
  return `${prefix}:${encodePart(input.blockId)}:${encodePart(input.blockRevision)}`;
};

export const buildTtsPreviewCacheKey = (input: TtsPreviewCacheKeyInput) => {
  const schemaVersion = input.schemaVersion ?? TTS_CACHE_SCHEMA_VERSION;
  const prefix = buildCommonKeyPrefix(input, schemaVersion);
  const normalizedText = normalizePreviewText(input.text);
  const normalizedTextHash = hashNormalizedText(normalizedText);
  return `${prefix}:${normalizedTextHash}`;
};
