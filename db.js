import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const dbHelper = {
  pool,
  init: async () => {
    const client = await pool.connect();
    try {
      // Main users table
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
      await client.query(`ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS username TEXT`);
      
      // Give logs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS give_logs (
          id SERIAL PRIMARY KEY,
          sender_id TEXT,
          sender_name TEXT,
          receiver_id TEXT,
          receiver_name TEXT,
          amount BIGINT,
          server_id TEXT,
          server_name TEXT,
          channel_id TEXT,
          timestamp BIGINT
        )
      `);

      // CX logs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS cx_logs (
          id SERIAL PRIMARY KEY,
          userid TEXT,
          username TEXT,
          amount BIGINT,
          choice TEXT,
          result TEXT,
          win INTEGER,
          server_id TEXT,
          server_name TEXT,
          channel_id TEXT,
          timestamp BIGINT
        )
      `);

      // General activity logs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS activity_logs (
          id SERIAL PRIMARY KEY,
          userid TEXT,
          username TEXT,
          type TEXT,
          description TEXT,
          amount BIGINT DEFAULT 0,
          diamonds INTEGER DEFAULT 0,
          server_id TEXT,
          timestamp BIGINT
        )
      `);

      // Wealth tax history table
      await client.query(`
        CREATE TABLE IF NOT EXISTS wealth_tax_history (
          id SERIAL PRIMARY KEY,
          userid TEXT,
          username TEXT,
          tax_level INTEGER,
          amount_taxed BIGINT,
          timestamp BIGINT
        )
      `);

      console.log('✅ PostgreSQL Database initialized with logging tables.');
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

  // Logging methods
  logGive: async (data) => {
    await pool.query(
      `INSERT INTO give_logs (sender_id, sender_name, receiver_id, receiver_name, amount, server_id, server_name, channel_id, timestamp) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [data.senderId, data.senderName, data.receiverId, data.receiverName, data.amount, data.serverId, data.serverName, data.channelId, Date.now()]
    );
  },

  logCX: async (data) => {
    await pool.query(
      `INSERT INTO cx_logs (userid, username, amount, choice, result, win, server_id, server_name, channel_id, timestamp) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [data.userId, data.username, data.amount, data.choice, data.result, data.win ? 1 : 0, data.serverId, data.serverName, data.channelId, Date.now()]
    );
  },

  logActivity: async (data) => {
    await pool.query(
      `INSERT INTO activity_logs (userid, username, type, description, amount, diamonds, server_id, timestamp) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [data.userId, data.username, data.type, data.description, data.amount || 0, data.diamonds || 0, data.serverId, Date.now()]
    );
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
  },

  // Methods for Dashboard
  updateWealthTaxLevel: async (userId, newTaxLevel) => {
    await pool.query(
      'UPDATE economy_users SET wealth_tax_level = $1 WHERE userid = $2',
      [newTaxLevel, userId]
    );
  },

  logWealthTax: async (userId, username, taxLevel, amountTaxed) => {
    const res = await pool.query(
      'INSERT INTO wealth_tax_history (userid, username, tax_level, amount_taxed, timestamp) VALUES ($1, $2, $3, $4, $5)',
      [userId, username, taxLevel, amountTaxed, Date.now()]
    );
  },

  getWealthTaxLevel: async (userId) => {
    const res = await pool.query(
      'SELECT wealth_tax_level FROM economy_users WHERE userid = $1',
      [userId]
    );
    return res.rows.length > 0 ? parseInt(res.rows[0].wealth_tax_level || 0) : 0;
  },

  getStats: async () => {
    const usersCount = await pool.query('SELECT COUNT(*) FROM economy_users');
    const totalWallet = await pool.query('SELECT SUM(wallet) FROM economy_users');
    const totalBank = await pool.query('SELECT SUM(bank) FROM economy_users');
    const totalDiamonds = await pool.query('SELECT SUM(diamonds) FROM economy_users');
    const totalCX = await pool.query('SELECT COUNT(*) FROM cx_logs');
    
    return {
      totalUsers: parseInt(usersCount.rows[0].count),
      totalCash: parseInt(totalWallet.rows[0].sum || 0) + parseInt(totalBank.rows[0].sum || 0),
      totalDiamonds: parseInt(totalDiamonds.rows[0].sum || 0),
      totalGames: parseInt(totalCX.rows[0].count)
    };
  }
};

export default dbHelper;
