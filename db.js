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
          hasplayedcx INTEGER DEFAULT 0,
          hasclaimeddrop INTEGER DEFAULT 0,
          wealth_tax_level INTEGER DEFAULT 0,
          nb_extra_slots INTEGER DEFAULT 0,
          nb_blocked INTEGER DEFAULT 0
        )
      `);
      await client.query(`ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS username TEXT`);
      await client.query(`ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS wealth_tax_level INTEGER DEFAULT 0`);
      await client.query(`ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS hasclaimeddrop INTEGER DEFAULT 0`);
      await client.query(`ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS nb_extra_slots INTEGER DEFAULT 0`);
      await client.query(`ALTER TABLE economy_users ADD COLUMN IF NOT EXISTS nb_blocked INTEGER DEFAULT 0`);
      await client.query(`ALTER TABLE nb_games ADD COLUMN IF NOT EXISTS is_blocked INTEGER DEFAULT 0`);
      
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

      // Number Box (NB) Games table
      await client.query(`
        CREATE TABLE IF NOT EXISTS nb_games (
          id SERIAL PRIMARY KEY,
          guild_id TEXT,
          winning_number INTEGER,
          winners_count INTEGER DEFAULT 0,
          max_winners INTEGER DEFAULT 5,
          prize BIGINT DEFAULT 100000,
          expires_at BIGINT,
          is_active INTEGER DEFAULT 1,
          is_blocked INTEGER DEFAULT 0,
          message_id TEXT
        )
      `);

      // Number Box Participants table
      await client.query(`
        CREATE TABLE IF NOT EXISTS nb_participants (
          id SERIAL PRIMARY KEY,
          game_id INTEGER,
          user_id TEXT,
          username TEXT,
          is_winner INTEGER DEFAULT 0,
          timestamp BIGINT
        )
      `);

      console.log('✅ PostgreSQL Database initialized with logging tables and NB tables.');
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
      hasPlayedCX: user.hasplayedcx,
      hasClaimedDrop: user.hasclaimeddrop,
      nb_extra_slots: parseInt(user.nb_extra_slots || 0),
      nb_blocked: parseInt(user.nb_blocked || 0)
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
      hasClaimedDrop: user.hasclaimeddrop,
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
    await pool.query(
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
  },

  // Number Box Methods
  getActiveNBGame: async (guildId) => {
    const res = await pool.query(
      'SELECT * FROM nb_games WHERE guild_id = $1 AND is_active = 1 AND expires_at > $2',
      [guildId, Date.now()]
    );
    return res.rows[0] || null;
  },

  createNBGame: async (guildId, winningNumber, messageId) => {
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000);
    const res = await pool.query(
      'INSERT INTO nb_games (guild_id, winning_number, expires_at, message_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [guildId, winningNumber, expiresAt, messageId]
    );
    return res.rows[0];
  },

  updateNBGame: async (gameId, data) => {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key, i) => `${key.toLowerCase()} = $${i + 2}`).join(', ');
    await pool.query(`UPDATE nb_games SET ${setClause} WHERE id = $1`, [gameId, ...values]);
  },

  getNBParticipants: async (gameId) => {
    const res = await pool.query('SELECT * FROM nb_participants WHERE game_id = $1', [gameId]);
    return res.rows;
  },

  checkNBParticipant: async (gameId, userId) => {
    const res = await pool.query('SELECT * FROM nb_participants WHERE game_id = $1 AND user_id = $2', [gameId, userId]);
    return res.rows[0] || null;
  },

  addNBParticipant: async (gameId, userId, username, isWinner) => {
    await pool.query(
      'INSERT INTO nb_participants (game_id, user_id, username, is_winner, timestamp) VALUES ($1, $2, $3, $4, $5)',
      [gameId, userId, username, isWinner ? 1 : 0, Date.now()]
    );
  },

  openNBAll: async (gameId) => {
    // Give one extra slot to everyone who hasn't won in THIS game
    await pool.query(`
      UPDATE economy_users 
      SET nb_extra_slots = nb_extra_slots + 1 
      WHERE userid NOT IN (SELECT user_id FROM nb_participants WHERE game_id = $1 AND is_winner = 1)
    `, [gameId]);
  },

  openNBUser: async (userId) => {
    await pool.query('UPDATE economy_users SET nb_extra_slots = nb_extra_slots + 1, nb_blocked = 0 WHERE userid = $1', [userId]);
  },

  closeNBAll: async (gameId) => {
    await pool.query('UPDATE nb_games SET is_blocked = 1 WHERE id = $1', [gameId]);
  },

  uncloseNBAll: async (gameId) => {
    await pool.query('UPDATE nb_games SET is_blocked = 0 WHERE id = $1', [gameId]);
  },

  closeNBUser: async (userId) => {
    await pool.query('UPDATE economy_users SET nb_blocked = 1 WHERE userid = $1', [userId]);
  },

  checkIfWinner: async (userId) => {
    const res = await pool.query('SELECT 1 FROM nb_participants WHERE user_id = $1 AND is_winner = 1 LIMIT 1', [userId]);
    return res.rows.length > 0;
  },

  decrementNBExtraSlots: async (userId) => {
    await pool.query('UPDATE economy_users SET nb_extra_slots = GREATEST(0, nb_extra_slots - 1) WHERE userid = $1', [userId]);
  }
};

export default dbHelper;
