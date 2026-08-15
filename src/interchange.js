import { createHash } from 'node:crypto';

export class InterchangeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'InterchangeError';
    this.code = code;
  }
}

export function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;

  const properties = Object.keys(value)
    .sort(compareUtf8)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
  return `{${properties.join(',')}}`;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function requireNonEmptyString(value, code, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InterchangeError(code, `${field} must be a non-empty string`);
  }
  return value;
}

export function validatePortablePath(value, field = 'path') {
  requireNonEmptyString(value, 'path.invalid', field);
  if (
    value.includes('\0')
    || value.includes('\\')
    || /^[A-Za-z]:/.test(value)
    || value.startsWith('/')
    || value.endsWith('/')
    || value.includes('//')
  ) {
    throw new InterchangeError('path.invalid', `${field} must be a portable relative path`);
  }

  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new InterchangeError('path.invalid', `${field} must not contain empty, dot, or parent segments`);
  }
  if (value.normalize('NFC') !== value) {
    throw new InterchangeError('path.invalid', `${field} must use Unicode NFC normalization`);
  }
  return value;
}
