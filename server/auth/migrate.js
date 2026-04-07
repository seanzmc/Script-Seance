import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run auth migrations.');
}

const schemaPath = path.join(__dirname, 'schema.sql');
const sql = await fs.readFile(schemaPath, 'utf8');
const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  await pool.query(sql);
  console.log('[auth:migrate] schema applied');
} finally {
  await pool.end();
}
