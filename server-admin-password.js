const crypto = require('crypto');

const ADMIN_PASSWORD_HASH_VERSION = 'scrypt-v1';
const DEFAULT_SCRYPT_COST = Object.freeze({
  logN: 14,
  r: 8,
  p: 1,
  keyLength: 32
});
const MAX_SCRYPT_LOG_N = 16;
const MAX_SCRYPT_R = 16;
const MAX_SCRYPT_P = 4;

function base64UrlEncode(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || ''), 'base64url');
}

function parseAdminPasswordHash(encodedHash) {
  const parts = String(encodedHash || '').trim().split('$');
  if (parts.length !== 6 || parts[0] !== ADMIN_PASSWORD_HASH_VERSION) return null;
  const logN = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (
    !Number.isInteger(logN) || logN < 12 || logN > MAX_SCRYPT_LOG_N
    || !Number.isInteger(r) || r < 1 || r > MAX_SCRYPT_R
    || !Number.isInteger(p) || p < 1 || p > MAX_SCRYPT_P
  ) return null;
  const salt = base64UrlDecode(parts[4]);
  const digest = base64UrlDecode(parts[5]);
  if (salt.length !== 16 || digest.length !== 32) return null;
  return {
    logN,
    cost: 2 ** logN,
    r,
    p,
    keyLength: digest.length,
    salt,
    digest
  };
}

function deriveAdminPasswordDigest(password, salt, options) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      String(password || ''),
      salt,
      options.keyLength,
      {
        N: options.cost,
        r: options.r,
        p: options.p,
        maxmem: 128 * options.cost * options.r * (options.p + 1)
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      }
    );
  });
}

async function createAdminPasswordHash(password, {
  logN = DEFAULT_SCRYPT_COST.logN,
  r = DEFAULT_SCRYPT_COST.r,
  p = DEFAULT_SCRYPT_COST.p,
  keyLength = DEFAULT_SCRYPT_COST.keyLength,
  salt = crypto.randomBytes(16)
} = {}) {
  const normalizedPassword = String(password || '');
  if (normalizedPassword.length < 12) {
    throw new Error('Admin password must contain at least 12 characters.');
  }
  const parsedOptions = {
    logN: Number(logN),
    cost: 2 ** Number(logN),
    r: Number(r),
    p: Number(p),
    keyLength: Number(keyLength),
    salt: Buffer.from(salt)
  };
  if (
    !Number.isInteger(parsedOptions.logN) || parsedOptions.logN < 12 || parsedOptions.logN > MAX_SCRYPT_LOG_N
    || !Number.isInteger(parsedOptions.r) || parsedOptions.r < 1 || parsedOptions.r > MAX_SCRYPT_R
    || !Number.isInteger(parsedOptions.p) || parsedOptions.p < 1 || parsedOptions.p > MAX_SCRYPT_P
    || parsedOptions.keyLength !== 32
    || parsedOptions.salt.length !== 16
  ) {
    throw new Error('Invalid scrypt password-hash parameters.');
  }
  const digest = await deriveAdminPasswordDigest(normalizedPassword, parsedOptions.salt, parsedOptions);
  return [
    ADMIN_PASSWORD_HASH_VERSION,
    parsedOptions.logN,
    parsedOptions.r,
    parsedOptions.p,
    base64UrlEncode(parsedOptions.salt),
    base64UrlEncode(digest)
  ].join('$');
}

async function verifyAdminPassword(password, encodedHash) {
  const parsed = parseAdminPasswordHash(encodedHash);
  if (!parsed) return false;
  try {
    const actual = await deriveAdminPasswordDigest(password, parsed.salt, parsed);
    return actual.length === parsed.digest.length && crypto.timingSafeEqual(actual, parsed.digest);
  } catch {
    return false;
  }
}

module.exports = Object.freeze({
  ADMIN_PASSWORD_HASH_VERSION,
  DEFAULT_SCRYPT_COST,
  createAdminPasswordHash,
  parseAdminPasswordHash,
  verifyAdminPassword
});
