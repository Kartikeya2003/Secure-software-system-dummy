/**
 * Unit tests for the crypto utilities (crypto.js).
 *
 * Tests cover:
 * 1. AES-256-GCM encrypt/decrypt round trip — ensures data survives encryption
 * 2. GCM tamper detection — modified ciphertext causes decryption to fail
 * 3. HMAC integrity — verifyVoteHmac detects when vote metadata is changed
 * 4. TOTP secret encryption — ensures encrypted secrets decrypt correctly
 *
 * These tests use random keys (generated fresh each run) so they
 * don't depend on any external configuration or .env file.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// Generate random 32-byte keys for testing (not the real production keys)
process.env.VOTE_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
process.env.VOTE_HMAC_KEY = crypto.randomBytes(32).toString('base64');
process.env.TOTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

const { encrypt, decrypt, voteHmac, verifyVoteHmac, encryptTotp, decryptTotp } = require('../src/utils/crypto');

// Test 1: Basic encrypt-then-decrypt round trip
// The decrypted result should be identical to the original input
test('encrypt then decrypt a sample ballot', () => {
  const payload = { preferences: ['DEMO_A', 'DEMO_B', 'DEMO_C'] };
  const record = encrypt(payload, 'DEMO_HOUSE:DEMO');
  assert.deepEqual(decrypt(record, 'DEMO_HOUSE:DEMO'), payload);
});

// Test 2: GCM authentication catches tampered data
// Modifying the ciphertext should cause decryption to throw an error
// because GCM's authentication tag will not match
test('AES-GCM rejects tampered ciphertext', () => {
  const record = encrypt({ preferences: ['DEMO_A'] }, 'DEMO_HOUSE:DEMO');
  record.ciphertext = Buffer.from('tampered').toString('base64');
  assert.throws(() => decrypt(record, 'DEMO_HOUSE:DEMO'));
});

// Test 3: HMAC integrity hash detects metadata changes
// A valid record should pass verification, but changing the electorate
// (without recomputing the HMAC) should fail verification
test('HMAC detects tampered encrypted vote', () => {
  const record = {
    chamber: 'DEMO_HOUSE',
    electorate: 'DEMO',
    ...encrypt({ preferences: ['DEMO_A'] }, 'DEMO_HOUSE:DEMO')
  };
  record.integrity_hash = voteHmac(record);

  // Valid record passes
  assert.equal(verifyVoteHmac(record), true);

  // Tampered electorate fails (hash was computed with 'DEMO', not 'OTHER')
  assert.equal(verifyVoteHmac({ ...record, electorate: 'OTHER' }), false);
});

// Test 4: TOTP secret encryption round trip
// Encrypt a known Base32 secret, then decrypt — should get the same string back
test('TOTP secret encryption round trip', () => {
  assert.equal(decryptTotp(encryptTotp('JBSWY3DPEHPK3PXP')), 'JBSWY3DPEHPK3PXP');
});
