import crypto from 'node:crypto';

const IS_PROD = process.env.NODE_ENV === 'production';
const MAX_PREVIEW_CHARS = 260;
const MAX_PREVIEW_ARRAY_ITEMS = 6;
const MAX_PREVIEW_OBJECT_KEYS = 12;
const STYLE_FINGERPRINT_RE = /^[a-f0-9]{8,64}$/i;
const REDACTION_PATTERNS = [
  { pattern: /sk-[a-zA-Z0-9]{12,}/g, replacement: '[REDACTED_OPENAI_KEY]' },
  { pattern: /AIza[0-9A-Za-z_-]{20,}/g, replacement: '[REDACTED_GOOGLE_KEY]' },
  { pattern: /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, replacement: 'Bearer [REDACTED_TOKEN]' },
  { pattern: /[A-Za-z0-9_\-.]+@[A-Za-z0-9\-.]+\.[A-Za-z]{2,}/g, replacement: '[REDACTED_EMAIL]' },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED_SSN]' }
];

const parseBooleanFlag = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const redactSecrets = (value) => {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return REDACTION_PATTERNS.reduce((next, { pattern, replacement }) => (
    next.replace(pattern, replacement)
  ), text);
};

const toPreviewText = (value, maxChars = MAX_PREVIEW_CHARS) => {
  if (value === null || value === undefined) return value;
  const redacted = redactSecrets(value);
  const compact = redacted.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars - 1)}…`;
};

const toPreviewValue = (value, depth = 0) => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return toPreviewText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= 3) return '[truncated]';
  if (Array.isArray(value)) {
    return value.slice(0, MAX_PREVIEW_ARRAY_ITEMS).map((item) => toPreviewValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).slice(0, MAX_PREVIEW_OBJECT_KEYS);
    return Object.fromEntries(
      entries.map(([key, entryValue]) => [key, toPreviewValue(entryValue, depth + 1)])
    );
  }
  return toPreviewText(String(value));
};

const normalizePromptContextRevision = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.floor(value));
};

const normalizeStyleFingerprint = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (!STYLE_FINGERPRINT_RE.test(normalized)) return null;
  return normalized.slice(0, 64);
};

export const createStyleFingerprint = (value) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return 'none';
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
};

export const resolvePromptTraceMeta = (payloadTrace) => {
  const trace = payloadTrace && typeof payloadTrace === 'object' ? payloadTrace : null;
  return {
    requestFlag: Boolean(trace?.enabled),
    promptContextRevision: normalizePromptContextRevision(trace?.promptContextRevision),
    styleFingerprint: normalizeStyleFingerprint(trace?.styleFingerprint)
  };
};

export const isPromptTraceEnabled = (requestFlag = false) => {
  if (IS_PROD) return false;
  const envEnabled = parseBooleanFlag(process.env.SS_DEBUG_PROMPTS);
  return envEnabled || Boolean(requestFlag);
};

export const emitPromptTrace = ({
  enabled,
  kind,
  provider,
  model,
  timeoutMs,
  maxOutputTokens,
  promptContextRevision,
  styleFingerprint,
  instructionPreview,
  contextPreview
}) => {
  if (!enabled || IS_PROD) return;
  console.info('[prompt-trace]', {
    kind,
    provider,
    model,
    timeoutMs: typeof timeoutMs === 'number' ? timeoutMs : null,
    max_output_tokens: typeof maxOutputTokens === 'number' ? maxOutputTokens : null,
    promptContextRevision: normalizePromptContextRevision(promptContextRevision),
    styleFingerprint: normalizeStyleFingerprint(styleFingerprint) || 'none',
    instructionPreview: toPreviewValue(instructionPreview),
    contextPreview: toPreviewValue(contextPreview)
  });
};
