import pg from 'pg';
const { Pool } = pg;

// Railway automatically provides DATABASE_URL in the environment
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
      await client.query(`
        CREATE TABLE IF NOT EXISTS economy_users (
          userId TEXT PRIMARY KEY,
          username TEXT,
          wallet BIGINT DEFAULT 0,
          bank BIGINT DEFAULT 500,
          diamonds INTEGER DEFAULT 0,
          shieldUntil BIGINT DEFAULT 0,
          jailUntil BIGINT DEFAULT 0,
          lastWork BIGINT DEFAULT 0,
          lastDaily BIGINT DEFAULT 0,
          lastTax BIGINT DEFAULT 0,
          hasPlayedCX INTEGER DEFAULT 0
        )
      `);
      // Ensure username column exists if table was created before
      await client.query(`ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS username TEXT`);
      console.log('✅ PostgreSQL Database initialized successfully.');
    } finally {
      client.release();
    }
  },

  getUser: async (userId, username = null) => {
    const res = await pool.query('SELECT * FROM economy_users WHERE userId = $1', [userId]);
    let user = res.rows[0];
    if (!user) {
      await pool.query('INSERT INTO economy_users (userId, username, lastTax, bank) VALUES ($1, $2, $3, $4)', [userId, username, Date.now(), 500]);
      const newRes = await pool.query('SELECT * FROM economy_users WHERE userId = $1', [userId]);
      user = newRes.rows[0];
    } else if (username && user.username !== username) {
      await pool.query('UPDATE economy_users SET username = $2 WHERE userId = $1', [userId, username]);
      user.username = username;
    }
    // Convert string BIGINTs to numbers
    return {
      ...user,
      wallet: parseInt(user.wallet),
      bank: parseInt(user.bank),
      shieldUntil: parseInt(user.shielduntil),
      jailUntil: parseInt(user.jailuntil),
      lastWork: parseInt(user.lastwork),
      lastDaily: parseInt(user.lastdaily),
      lastTax: parseInt(user.lasttax)
    };
  },

  updateUser: async (userId, data) => {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key, i) => `${key.toLowerCase()} = $${i + 2}`).join(', ');
    await pool.query(`UPDATE economy_users SET ${setClause} WHERE userId = $1`, [userId, ...values]);
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
    const res = await pool.query('SELECT userId, (wallet + bank) as total FROM economy_users ORDER BY total DESC LIMIT $1', [limit]);
    return res.rows.map(row => ({
        userId: row.userid,
        total: parseInt(row.total)
    }));
  },

  getAllUsers: async () => {
    const res = await pool.query('SELECT * FROM economy_users');
    return res.rows.map(user => ({
      ...user,
      userId: user.userid,
      wallet: parseInt(user.wallet),
      bank: parseInt(user.bank),
      hasPlayedCX: user.hasplayedcx,
      lastTax: parseInt(user.lasttax)
    }));
  }
};

export default dbHelper;
