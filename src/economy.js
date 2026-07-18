// src/economy.js — triple-mode economy (ES module)
// Priority: 1) PostgreSQL  2) JSON file  3) In-memory (never crashes)
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = path.join(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'economy.json');

// ─── In-memory fallback (always works, even on read-only filesystems) ─────────
const _memCache = {};

// ─── JSON helpers ─────────────────────────────────────────────────────────────
function jsonEnsure() {
  try {
    if (!fs.existsSync(DATA_DIR))  fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '{}');
    return true;
  } catch { return false; }
}

function jsonLoad() {
  try {
    jsonEnsure();
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch { return {}; }
}

function jsonSave(data) {
  try {
    jsonEnsure();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch { return false; }
}

// ─── PostgreSQL pool ──────────────────────────────────────────────────────────
let _pool       = null;
let _useDb      = false;  // only true after successful connection test
let _dbChecked  = false;

async function getPool() {
  // If already confirmed working, return it
  if (_pool && _useDb) return _pool;
  // If already tried and failed, skip
  if (_dbChecked && !_useDb) return null;
  // No DATABASE_URL → skip silently
  if (!process.env.DATABASE_URL) { _dbChecked = true; return null; }

  try {
    const pg   = await import('pg');
    const Pool = pg?.default?.Pool ?? pg?.Pool;
    if (!Pool) throw new Error('pg.Pool not found in module');

    _pool = new Pool({
      connectionString:       process.env.DATABASE_URL,
      ssl:                    { rejectUnauthorized: false },
      connectionTimeoutMillis: 4000,
      idleTimeoutMillis:       10000,
      max: 3,
    });
    await _pool.query('SELECT 1');  // connectivity test
    _useDb     = true;
    _dbChecked = true;
    console.log('✅ Economy: PostgreSQL connected');
    return _pool;
  } catch (err) {
    console.warn('⚠️  Economy: PostgreSQL unavailable —', err.message, '— using JSON/memory storage');
    _useDb     = false;
    _dbChecked = true;
    if (_pool) { try { await _pool.end(); } catch {} _pool = null; }
    return null;
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
export async function initDb() {
  // Seed in-memory cache from JSON (if it exists)
  const saved = jsonLoad();
  Object.assign(_memCache, saved);
  console.log(`📂 Economy cache loaded: ${Object.keys(_memCache).length} users from JSON`);

  const pool = await getPool();
  if (!pool) return;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        discord_id  TEXT    PRIMARY KEY,
        username    TEXT    NOT NULL DEFAULT 'Unknown',
        balance     BIGINT  NOT NULL DEFAULT 5000,
        last_work   BIGINT,
        joined_at   BIGINT  NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
      )
    `);
    // Safe migrations for older schemas
    const cols = ['last_work BIGINT', 'joined_at BIGINT'];
    for (const col of cols) {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col}`).catch(() => {});
    }
    console.log('✅ Economy: PostgreSQL table ready');
  } catch (err) {
    console.error('❌ Economy: DB table setup failed —', err.message);
    _useDb = false;
  }
}

// ─── Core storage: DB → JSON → memory ────────────────────────────────────────
async function runDb(pgFn) {
  const pool = await getPool();
  if (!pool) return null;
  try {
    return await pgFn(pool);
  } catch (err) {
    console.error('⚠️  Economy DB query failed:', err.message);
    return null;
  }
}

function memGet(userId) {
  if (!_memCache[userId]) {
    // Try loading from JSON first
    const data = jsonLoad();
    if (data[userId]) {
      _memCache[userId] = data[userId];
    } else {
      _memCache[userId] = { balance: 5000, username: 'Unknown', lastWork: null, joinedAt: Date.now() };
      // Persist
      data[userId] = _memCache[userId];
      jsonSave(data);
    }
  }
  return _memCache[userId];
}

function memSave(userId) {
  const data = jsonLoad();
  data[userId] = _memCache[userId];
  jsonSave(data);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Get or create a user. New users start with $5,000. */
export async function getUser(userId, username) {
  const uname = (username || 'Unknown').slice(0, 100);

  const dbRow = await runDb(async (pool) => {
    const { rows } = await pool.query(
      `INSERT INTO users (discord_id, username)
       VALUES ($1, $2)
       ON CONFLICT (discord_id) DO UPDATE
         SET username = CASE WHEN $2 <> '' THEN $2 ELSE users.username END
       RETURNING *`,
      [userId, uname],
    );
    return { ...rows[0], balance: Number(rows[0].balance) };
  });

  if (dbRow) return dbRow;

  // JSON / memory path
  const user = memGet(userId);
  if (uname && uname !== 'Unknown') user.username = uname;
  return { discord_id: userId, ...user };
}

export async function getBalance(userId, username) {
  try {
    const user = await getUser(userId, username || 'Unknown');
    const bal  = Number(user?.balance ?? 5000);
    return isNaN(bal) ? 5000 : bal;
  } catch (err) {
    console.error('getBalance error:', err.message);
    return 5000;
  }
}

/** Add amount to balance. Creates user if new (starts at 5000 + amount). */
export async function addBalance(userId, amount, username) {
  const uname = (username || 'Unknown').slice(0, 100);
  const amt   = Number(amount) || 0;

  const dbBal = await runDb(async (pool) => {
    const { rows } = await pool.query(
      `INSERT INTO users (discord_id, username, balance)
       VALUES ($1, $2, 5000 + $3::BIGINT)
       ON CONFLICT (discord_id) DO UPDATE
         SET balance  = users.balance + $3::BIGINT,
             username = CASE WHEN $2 <> '' THEN $2 ELSE users.username END
       RETURNING balance`,
      [userId, uname, amt],
    );
    return Number(rows[0].balance);
  });

  if (dbBal !== null) return dbBal;

  // JSON / memory path
  const user = memGet(userId);
  user.balance = (Number(user.balance) || 5000) + amt;
  if (uname && uname !== 'Unknown') user.username = uname;
  memSave(userId);
  return user.balance;
}

export async function setBalance(userId, amount) {
  const amt = Number(amount) || 0;

  const dbBal = await runDb(async (pool) => {
    const { rows } = await pool.query(
      `UPDATE users SET balance = $2::BIGINT WHERE discord_id = $1 RETURNING balance`,
      [userId, amt],
    );
    return rows.length ? Number(rows[0].balance) : amt;
  });

  if (dbBal !== null) return dbBal;

  const user = memGet(userId);
  user.balance = amt;
  memSave(userId);
  return amt;
}

/**
 * Deduct amount atomically.
 * Returns { success: true, balance } or { success: false, reason, balance? }.
 */
export async function deductBalance(userId, amount) {
  const amt = Number(amount) || 0;

  const dbResult = await runDb(async (pool) => {
    const { rows } = await pool.query(
      `UPDATE users SET balance = balance - $2::BIGINT
       WHERE discord_id = $1 AND balance >= $2::BIGINT
       RETURNING balance`,
      [userId, amt],
    );
    if (rows.length) return { success: true, balance: Number(rows[0].balance) };
    const cur = await pool.query('SELECT balance FROM users WHERE discord_id = $1', [userId]);
    if (!cur.rows.length) return { success: false, reason: 'no_account' };
    return { success: false, reason: 'insufficient', balance: Number(cur.rows[0].balance) };
  });

  if (dbResult !== null) return dbResult;

  // JSON / memory path
  const user = memGet(userId);
  const bal  = Number(user.balance) || 0;
  if (bal < amt) return { success: false, reason: 'insufficient', balance: bal };
  user.balance = bal - amt;
  memSave(userId);
  return { success: true, balance: user.balance };
}

export async function getLastWork(userId) {
  const dbVal = await runDb(async (pool) => {
    const { rows } = await pool.query(
      'SELECT last_work FROM users WHERE discord_id = $1',
      [userId],
    );
    return rows.length && rows[0].last_work ? Number(rows[0].last_work) : null;
  });

  if (dbVal !== undefined && dbVal !== null) return dbVal;
  if (_useDb) return null;  // user exists in DB with null last_work

  // JSON / memory path
  const user = memGet(userId);
  return user.lastWork || null;
}

export async function setLastWork(userId) {
  const now = Date.now();

  await runDb(async (pool) => {
    await pool.query(
      'UPDATE users SET last_work = $2 WHERE discord_id = $1',
      [userId, now],
    );
    return true;
  });

  // Always update memory too (so JSON stays in sync even with DB)
  if (_memCache[userId]) {
    _memCache[userId].lastWork = now;
    memSave(userId);
  }
}

/** Returns all users ordered by balance descending. */
export async function getAllUsers() {
  const dbRows = await runDb(async (pool) => {
    const { rows } = await pool.query('SELECT * FROM users ORDER BY balance DESC');
    return rows.map(r => ({ ...r, balance: Number(r.balance) }));
  });

  if (dbRows !== null) return dbRows;

  // JSON / memory path
  const data = jsonLoad();
  return Object.entries(data)
    .map(([id, u]) => ({ discord_id: id, ...u, balance: Number(u.balance) || 0 }))
    .sort((a, b) => b.balance - a.balance);
}

/** Diagnostic info — used by !ecodebug */
export function getEcoStatus() {
  return {
    dbEnabled: _useDb,
    dbChecked: _dbChecked,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    memUsers: Object.keys(_memCache).length,
    dataFile: DATA_FILE,
    fileExists: fs.existsSync(DATA_FILE),
    fileWritable: (() => { try { fs.accessSync(DATA_DIR, fs.constants.W_OK); return true; } catch { return false; } })(),
  };
}
