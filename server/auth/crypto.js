import crypto from 'node:crypto';

export const normalizeEmail = (email) => (
  typeof email === 'string' ? email.trim().toLowerCase() : ''
);

export const isValidEmail = (email) => (
  typeof email === 'string' &&
  email.length <= 320 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
);

export const createNumericCode = () => {
  const value = crypto.randomInt(0, 1000000);
  return String(value).padStart(6, '0');
};

export const createOpaqueToken = () => crypto.randomBytes(32).toString('base64url');

export const sha256Hex = (value) => crypto.createHash('sha256').update(value).digest('hex');

export const hashCode = ({ challengeId, code, secret }) => (
  sha256Hex(`${challengeId}:${code}:${secret}`)
);

export const safeEqual = (left, right) => {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};
