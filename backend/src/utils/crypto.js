/**
 * Encryption and integrity utilities for the EVP system.
 *
 * Uses AES-256-GCM for vote encryption (SR-04) and
 * HMAC-SHA256 for vote integrity verification (SR-05).
 * Also handles TOTP secret encryption at rest.
 */

const crypto = require('node:crypto');

/**
 * Load a 32-byte encryption key from an environment variable.
 * Keys are stored as base64 strings and decoded here.
 * Throws if the key is missing or wrong length.
 */
function key(name) {
  const raw = process.env[name];
  if (!raw || Buffer.from(raw, 'base64').length !== 32) {
    throw new Error(`${name} must be 32 bytes base64`);
  }
  return Buffer.from(raw, 'base64');
}

/**
 * Encrypt a vote payload using AES-256-GCM (SR-04).
 *
 * Each call generates a fresh 12-byte IV so identical votes
 * produce different ciphertexts. The AAD (additional authenticated
 * data) binds the ciphertext to its chamber and electorate,
 * preventing cross-electorate replay attacks.
 *
 * Returns { iv, ciphertext, auth_tag } all base64 encoded.
 */
function encrypt(value, aad = '') {
  // 96-bit IV is the recommended size for GCM mode
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key('VOTE_ENCRYPTION_KEY'), iv);

  // AAD ties ciphertext to a specific chamber/electorate
  cipher.setAAD(Buffer.from(aad));

  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final()
  ]);

  return {
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    auth_tag: cipher.getAuthTag().toString('base64')
  };
}

/**
 * Decrypt a vote record back to its original payload.
 * Throws if the ciphertext or AAD has been tampered with
 * because GCM authentication will fail automatically.
 */
function decrypt(record, aad = '') {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key('VOTE_ENCRYPTION_KEY'),
    Buffer.from(record.iv, 'base64')
  );
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(record.auth_tag, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final()
  ]);

  return JSON.parse(plaintext.toString('utf8'));
}

/**
 * Generate an HMAC-SHA256 integrity hash for a vote record (SR-05).
 *
 * Covers chamber, electorate, IV, ciphertext and auth_tag
 * in a fixed order. This lets us detect any post-storage
 * tampering of encrypted votes in the database.
 */
function voteHmac(record) {
  // Version prefix allows future schema changes without breaking old votes
  const payload = [
    'v1',
    record.chamber,
    record.electorate,
    record.iv,
    record.ciphertext,
    record.auth_tag
  ].map(String);

  return crypto.createHmac('sha256', key('VOTE_HMAC_KEY'))
    .update(JSON.stringify(payload))
    .digest('hex');
}

/**
 * Verify the integrity hash of a stored vote.
 * Uses timing-safe comparison to prevent timing side-channel attacks.
 */
function verifyVoteHmac(record) {
  const expected = Buffer.from(voteHmac(record), 'hex');
  const actual = Buffer.from(record.integrity_hash || '', 'hex');

  // Both length check and timing-safe comparison needed
  return actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected);
}

/**
 * Encrypt a TOTP secret before storing it in the database.
 * Ensures authenticator secrets are protected at rest.
 * Format: base64(iv).base64(authTag).base64(encrypted)
 */
function encryptTotp(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key('TOTP_ENCRYPTION_KEY'), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);

  // Store as dot-separated base64 string for easy DB storage
  return [iv, cipher.getAuthTag(), encrypted]
    .map(x => x.toString('base64'))
    .join('.');
}

/**
 * Decrypt a stored TOTP secret back to its base32 form
 * so it can be used for code verification during login.
 */
function decryptTotp(encoded) {
  const [iv, tag, data] = encoded.split('.').map(x => Buffer.from(x, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key('TOTP_ENCRYPTION_KEY'), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt, voteHmac, verifyVoteHmac, encryptTotp, decryptTotp };
