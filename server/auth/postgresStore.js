import pg from 'pg';
import { authError } from './errors.js';

const mapUser = (row) => row ? ({
  id: row.id,
  email: row.email,
  normalizedEmail: row.normalized_email,
  status: row.status,
  sessionVersion: row.session_version,
  createdAt: row.created_at,
  updatedAt: row.updated_at
}) : null;

const mapChallenge = (row) => row ? ({
  id: row.id,
  userId: row.user_id,
  normalizedEmail: row.normalized_email,
  codeHash: row.code_hash,
  expiresAt: new Date(row.expires_at).getTime(),
  consumedAt: row.consumed_at ? new Date(row.consumed_at).getTime() : null,
  attemptCount: row.attempt_count,
  maxAttempts: row.max_attempts,
  createdAt: new Date(row.created_at).getTime()
}) : null;

export const createPostgresAuthStore = ({ connectionString }) => {
  const pool = new pg.Pool({ connectionString });

  return {
    async findEligibleUserForLogin({ email, normalizedEmail, now }) {
      const existing = await pool.query(
        'select * from users where normalized_email = $1 limit 1',
        [normalizedEmail]
      );
      const existingUser = mapUser(existing.rows[0]);
      if (existingUser?.status === 'disabled') {
        throw authError(403, 'USER_DISABLED', 'This account is disabled.');
      }
      if (existingUser?.status === 'active') {
        return existingUser;
      }

      const invite = await pool.query(
        `select *
         from invites
         where normalized_email = $1
           and accepted_at is null
           and revoked_at is null
           and expires_at > to_timestamp($2 / 1000.0)
         order by created_at desc
         limit 1`,
        [normalizedEmail, now]
      );
      if (invite.rowCount === 0) {
        throw authError(403, 'INVITE_REQUIRED', 'This email is not on the beta invite list.');
      }

      if (existingUser) {
        return existingUser;
      }

      const created = await pool.query(
        `insert into users (email, normalized_email, status)
         values ($1, $2, 'invited')
         on conflict (normalized_email) do update set updated_at = now()
         returning *`,
        [email, normalizedEmail]
      );
      return mapUser(created.rows[0]);
    },

    async createChallenge(challenge) {
      const created = await pool.query(
        `insert into auth_challenges
          (id, user_id, normalized_email, code_hash, expires_at, max_attempts, attempt_count, created_at)
         values ($1, $2, $3, $4, to_timestamp($5 / 1000.0), $6, 0, to_timestamp($7 / 1000.0))
         returning *`,
        [
          challenge.id,
          challenge.userId,
          challenge.normalizedEmail,
          challenge.codeHash,
          challenge.expiresAt,
          challenge.maxAttempts,
          challenge.createdAt
        ]
      );
      return mapChallenge(created.rows[0]);
    },

    async findLatestChallengeForEmail(normalizedEmail) {
      const result = await pool.query(
        `select *
         from auth_challenges
         where normalized_email = $1
         order by created_at desc
         limit 1`,
        [normalizedEmail]
      );
      return mapChallenge(result.rows[0]);
    },

    async incrementChallengeAttempt(id) {
      const result = await pool.query(
        `update auth_challenges
         set attempt_count = attempt_count + 1
         where id = $1
         returning *`,
        [id]
      );
      return mapChallenge(result.rows[0]);
    },

    async consumeChallengeAndActivate({ id, userId, normalizedEmail, now }) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const userBeforeConsume = await client.query(
          'select * from users where id = $1 limit 1',
          [userId]
        );
        const existingUser = mapUser(userBeforeConsume.rows[0]);
        if (existingUser?.status === 'invited') {
          const invite = await client.query(
            `select id
             from invites
             where normalized_email = $1
               and accepted_at is null
               and revoked_at is null
               and expires_at > to_timestamp($2 / 1000.0)
             limit 1`,
            [normalizedEmail, now]
          );
          if (invite.rowCount === 0) {
            await client.query('rollback');
            throw authError(403, 'INVITE_REQUIRED', 'This email is not on the beta invite list.');
          }
        }
        const consumed = await client.query(
          `update auth_challenges
           set consumed_at = to_timestamp($2 / 1000.0)
           where id = $1 and consumed_at is null
           returning *`,
          [id, now]
        );
        if (consumed.rowCount === 0) {
          await client.query('rollback');
          return null;
        }

        const userResult = await client.query(
          `update users
           set status = case when status = 'invited' then 'active' else status end,
               updated_at = now()
           where id = $1
           returning *`,
          [userId]
        );
        await client.query(
          `update invites
           set accepted_at = coalesce(accepted_at, to_timestamp($2 / 1000.0)),
               updated_at = now()
           where normalized_email = $1 and accepted_at is null and revoked_at is null`,
          [normalizedEmail, now]
        );
        await client.query('commit');
        return mapUser(userResult.rows[0]);
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    },

    async getUserById(userId) {
      const result = await pool.query('select * from users where id = $1 limit 1', [userId]);
      return mapUser(result.rows[0]);
    },

    async close() {
      await pool.end();
    }
  };
};
