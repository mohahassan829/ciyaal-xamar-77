import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const dbHelper = {
  init: async () => {
    const client = await pool.connect();
    try {
      // Use lowercase for all column names to avoid Postgres case sensitivity issues
      await client.query(`
        CREATE TABLE IF NOT EXISTS economy_users (
          userid TEXT PRIMARY KEY,
          username TEXT,
          wallet BIGINT DEFAULT 0,
          bank BIGINT DEFAULT 500,
          diamonds INTEGER DEFAULT 0,
          shielduntil BIGINT DEFAULT 0,
          jailuntil BIGINT DEFAULT 0,
          lastwork BIGINT DEFAULT 0,
          lastdaily BIGINT DEFAULT 0,
          lasttax BIGINT DEFAULT 0,
          hasplayedcx INTEGER DEFAULT 0
        )
      `);
      
      // Explicitly add username column if it doesn't exist (for existing tables)
      await client.query(`ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS username TEXT`);
      
      console.log('✅ PostgreSQL Database initialized and username column verified.');
    } catch (err) {
      console.error('❌ Database Init Error:', err);
    } finally {
      client.release();
    }
  },

  getUser: async (userId, username = null) => {
    const res = await pool.query('SELECT * FROM economy_users WHERE userid = $1', [userId]);
    let user = res.rows[0];
    
    if (!user) {
      await pool.query(
        'INSERT INTO economy_users (userid, username, lasttax, bank) VALUES ($1, $2, $3, $4)', 
        [userId, username, Date.now(), 500]
      );
      const newRes = await pool.query('SELECT * FROM economy_users WHERE userid = $1', [userId]);
      user = newRes.rows[0];
    } else if (username && user.username !== username) {
      await pool.query('UPDATE economy_users SET username = $2 WHERE userid = $1', [userId, username]);
      user.username = username;
    }

    return {
      userId: user.userid,
      username: user.username,
      wallet: parseInt(user.wallet || 0),
      bank: parseInt(user.bank || 0),
      diamonds: parseInt(user.diamonds || 0),
      shieldUntil: parseInt(user.shielduntil || 0),
      jailUntil: parseInt(user.jailuntil || 0),
      lastWork: parseInt(user.lastwork || 0),
      lastDaily: parseInt(user.lastdaily || 0),
      lastTax: parseInt(user.lasttax || 0),
      hasPlayedCX: user.hasplayedcx
    };
  },

  updateUser: async (userId, data) => {
    const keys = Object.keys(data);
    const values = Object.values(data);
    // Map keys to lowercase to match DB columns
    const setClause = keys.map((key, i) => `${key.toLowerCase()} = $${i + 2}`).join(', ');
    await pool.query(`UPDATE economy_users SET ${setClause} WHERE userid = $1`, [userId, ...values]);
  },

  addWallet: async (userId, amount) => {
    const user = await dbHelper.getUser(userId);
    await dbHelper.updateUser(userId, { wallet: user.wallet + amount });
  },

  removeWallet: async (userId, amount) => {
    const user = await dbHelper.getUser(userId);
    await dbHelper.updateUser(userId, { wallet: Math.max(0, user.wallet - amount) });
  },

  addBank: async (userId, amount) => {
    const user = await dbHelper.getUser(userId);
    await dbHelper.updateUser(userId, { bank: user.bank + amount });
  },

  removeBank: async (userId, amount) => {
    const user = await dbHelper.getUser(userId);
    await dbHelper.updateUser(userId, { bank: Math.max(0, user.bank - amount) });
  },

  addDiamonds: async (userId, amount) => {
    const user = await dbHelper.getUser(userId);
    await dbHelper.updateUser(userId, { diamonds: user.diamonds + amount });
  },

  removeDiamonds: async (userId, amount) => {
    const user = await dbHelper.getUser(userId);
    await dbHelper.updateUser(userId, { diamonds: Math.max(0, user.diamonds - amount) });
  },

  getTopRich: async (limit = 10) => {
    const res = await pool.query(
      'SELECT userid, username, (wallet + bank) as total FROM economy_users ORDER BY total DESC LIMIT $1', 
      [limit]
    );
    return res.rows.map(row => ({
        userId: row.userid,
        username: row.username,
        total: parseInt(row.total)
    }));
  },

  getAllUsers: async () => {
    const res = await pool.query('SELECT * FROM economy_users');
    return res.rows.map(user => ({
      userId: user.userid,
      username: user.username,
      wallet: parseInt(user.wallet || 0),
      bank: parseInt(user.bank || 0),
      hasPlayedCX: user.hasplayedcx,
      lastTax: parseInt(user.lasttax || 0)
    }));
  }
};

export default dbHelper;
