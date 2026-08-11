import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function resetNB() {
  console.log('🔄 Resetting Number Box games...');
  try {
    const res = await pool.query('UPDATE nb_games SET is_active = 0 WHERE is_active = 1');
    console.log(`✅ Reset ${res.rowCount} active games. Next !nb will start a fresh 24h game for everyone.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error resetting NB:', err);
    process.exit(1);
  }
}

resetNB();
