/**
 * Durable ballot shuffle queue (SR-08 — vote-voter separation).
 *
 * Votes first land in a temporary `vote_queue` table, then this
 * function moves them into the permanent `votes` table in a RANDOM
 * order. This breaks any timing correlation between when a voter
 * cast their ballot and where it appears in the final table.
 *
 * Important: the vote_queue never stores any voter ID, so even
 * before shuffling there is no direct link between a vote and
 * who cast it. The shuffle adds an extra layer of ordering privacy.
 *
 * This is an educational demonstration — a production system would
 * need a stronger unlinkability guarantee (e.g., mix networks).
 */

const { pool } = require('../config/database');

/**
 * Move all ballots from vote_queue into the votes table in random order.
 *
 * Runs inside a single database transaction so that if the process
 * crashes mid-flush, no votes are lost — the transaction rolls back
 * and the votes remain safely in the queue for the next attempt.
 *
 * Uses a PostgreSQL advisory lock (id 555323) to prevent two
 * simultaneous flush operations from running at the same time.
 *
 * @returns {{ flushed: number }} How many ballots were moved
 */
async function flushBallots() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Advisory lock ensures only one flush runs at a time.
    // Released automatically when the transaction ends.
    await client.query('SELECT pg_advisory_xact_lock(555323)');

    // SELECT ... ORDER BY random() shuffles the rows into a random order.
    // FOR UPDATE locks the rows so no other query can touch them mid-flush.
    const { rows } = await client.query(
      'SELECT * FROM vote_queue ORDER BY random() FOR UPDATE'
    );

    // Move each ballot from the queue to the permanent votes table
    for (const row of rows) {
      await client.query(
        `INSERT INTO votes(vote_id, chamber, electorate, iv, ciphertext, auth_tag, integrity_hash)
         VALUES($1, $2, $3, $4, $5, $6, $7)`,
        [row.vote_id, row.chamber, row.electorate, row.iv,
         row.ciphertext, row.auth_tag, row.integrity_hash]
      );
      // Remove from queue only after successful insert
      await client.query('DELETE FROM vote_queue WHERE vote_id = $1', [row.vote_id]);
    }

    await client.query('COMMIT');
    return { flushed: rows.length };
  } catch (err) {
    // If anything fails, roll back — votes stay safely in the queue
    await client.query('ROLLBACK');
    throw err;
  } finally {
    // Always release the DB connection back to the pool
    client.release();
  }
}

module.exports = { flushBallots };
