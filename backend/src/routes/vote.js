/**
 * Voting routes — ballot retrieval and vote casting.
 *
 * GET /ballot — Returns the list of candidates for the voter's electorate
 * POST /cast  — Encrypts and queues a ranked preference ballot
 *
 * Security measures applied:
 * - SR-02: Eligibility check (must be enrolled voter, not yet voted)
 * - SR-04: AES-256-GCM encryption of vote data
 * - SR-05: HMAC-SHA256 integrity hash on encrypted record
 * - SR-06: RBAC permission check (only voters with 'cast_vote' permission)
 * - SR-08: Vote goes to queue table first (no voter ID stored with vote)
 *
 * The vote is encrypted client-side-blind: the server encrypts the
 * preference data so it can only be read with the VOTE_ENCRYPTION_KEY.
 * The AAD (Additional Authenticated Data) ties the ciphertext to
 * a specific chamber and electorate, preventing cross-electorate replay.
 */

const express = require('express');
const { pool } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { encrypt, voteHmac } = require('../utils/crypto');

const router = express.Router();

/**
 * GET /api/vote/ballot — Retrieve the ballot for the current voter.
 *
 * Returns the candidate list for the demo electorate.
 * Requires 'read_ballot' permission (all roles have this).
 * Also tells the frontend whether this voter has already cast their vote.
 */
router.get('/ballot', requireAuth, requirePermission('read_ballot'), async (req, res, next) => {
  try {
    // Fetch candidates for the demo chamber and electorate, sorted by ID
    const { rows } = await pool.query(
      "SELECT id, name FROM candidates WHERE chamber = 'DEMO_HOUSE' AND electorate = 'DEMO' ORDER BY id"
    );
    res.json({
      chamber: 'DEMO_HOUSE',
      electorate: 'DEMO',
      candidates: rows,
      alreadyVoted: req.user.has_voted  // Frontend uses this to disable the form
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/vote/cast — Submit an encrypted ballot.
 *
 * Expects JSON body: { preferences: ["candidate_id_1", "candidate_id_2", ...] }
 * The preferences array must rank ALL candidates exactly once (full preferential).
 *
 * Process:
 * 1. Validate that all candidates are ranked exactly once
 * 2. Re-check eligibility with FOR UPDATE lock (prevents double-voting race condition)
 * 3. Encrypt the preference data with AES-256-GCM
 * 4. Compute HMAC integrity hash over the encrypted record
 * 5. Insert into vote_queue (NOT votes — the shuffle step moves them later)
 * 6. Mark the voter as has_voted = true
 *
 * Note: The vote_queue table has NO voter_id column — once inserted,
 * there is no link between the vote and who cast it (SR-08).
 */
router.post('/cast', requireAuth, requirePermission('cast_vote'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { preferences } = req.body || {};

    // Get the list of valid candidate IDs for this electorate
    const candidates = await client.query(
      "SELECT id FROM candidates WHERE chamber = 'DEMO_HOUSE' AND electorate = 'DEMO'"
    );
    const allowed = candidates.rows.map(x => x.id);

    // Validate: must be an array, correct length, all strings, no duplicates,
    // and every entry must be a valid candidate ID
    if (!Array.isArray(preferences) ||
        preferences.length !== allowed.length ||
        !preferences.every(x => typeof x === 'string') ||
        new Set(preferences).size !== allowed.length ||
        preferences.some(x => !allowed.includes(x))) {
      return res.status(400).json({ error: 'Rank all available candidates once' });
    }

    await client.query('BEGIN');

    // Re-check eligibility with row lock (FOR UPDATE) to prevent race conditions
    // where two simultaneous requests could both pass the check
    const voters = await client.query(
      'SELECT status, has_voted, role FROM voters WHERE id = $1 FOR UPDATE',
      [req.user.id]
    );

    // Must be an enrolled voter who hasn't voted yet
    if (!voters.rowCount ||
        voters.rows[0].role !== 'voter' ||
        voters.rows[0].status !== 'enrolled' ||
        voters.rows[0].has_voted) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not eligible or vote already cast' });
    }

    // Encrypt the vote with AES-256-GCM (SR-04)
    // AAD = "DEMO_HOUSE:DEMO" binds ciphertext to this chamber/electorate
    const chamber = 'DEMO_HOUSE', electorate = 'DEMO';
    const encrypted = encrypt({ preferences }, `${chamber}:${electorate}`);

    // Build the vote record and compute its integrity hash (SR-05)
    const record = { chamber, electorate, ...encrypted };
    record.integrity_hash = voteHmac(record);

    // Insert into vote_queue — note: NO voter_id column (SR-08 separation)
    await client.query(
      `INSERT INTO vote_queue(chamber, electorate, iv, ciphertext, auth_tag, integrity_hash)
       VALUES($1, $2, $3, $4, $5, $6)`,
      [record.chamber, record.electorate, record.iv,
       record.ciphertext, record.auth_tag, record.integrity_hash]
    );

    // Mark voter as having voted (prevents double voting)
    await client.query('UPDATE voters SET has_voted = TRUE WHERE id = $1', [req.user.id]);

    await client.query('COMMIT');
    return res.status(201).json({ ok: true, message: 'Encrypted ballot safely queued (demonstration only)' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {}); // Ignore rollback errors
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
