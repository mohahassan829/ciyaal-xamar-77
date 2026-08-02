import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

let db;

const dbHelper = {
  init: async () => {
    db = await open({
      filename: 'economy.db',
      driver: sqlite3.Database
    });

    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        userId TEXT PRIMARY KEY,
        wallet INTEGER DEFAULT 0,
        bank INTEGER DEFAULT 500,
        diamonds INTEGER DEFAULT 0,
        shieldUntil INTEGER DEFAULT 0,
        jailUntil INTEGER DEFAULT 0,
        lastWork INTEGER DEFAULT 0,
        lastDaily INTEGER DEFAULT 0,
        lastTax INTEGER DEFAULT 0,
        hasPlayedCX INTEGER DEFAULT 0
      )
    `);
  },

  getUser: async (userId) => {
    let user = await db.get('SELECT * FROM users WHERE userId = ?', userId);
    if (!user) {
      await db.run('INSERT INTO users (userId, lastTax, bank) VALUES (?, ?, ?)', userId, Date.now(), 500);
      user = await db.get('SELECT * FROM users WHERE userId = ?', userId);
    }
    return user;
  },

  updateUser: async (userId, data) => {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');
    await db.run(`UPDATE users SET ${setClause} WHERE userId = ?`, ...values, userId);
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
    return await db.all('SELECT userId, (wallet + bank) as total FROM users ORDER BY total DESC LIMIT ?', limit);
  },

  getAllUsers: async () => {
    return await db.all('SELECT * FROM users');
  }
};

export default dbHelper;
