import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const WINNERS = [
  { id: '1341089818901348465', username: 'ManualWinner1' },
  { id: '1285263378587062345', username: 'ManualWinner2' }
];

async function addWinners() {
  console.log('🏆 Adding manual winners to Number Box...');
  const client = await pool.connect();
  try {
    // 1. Get active game
    const gameRes = await client.query('SELECT * FROM nb_games WHERE is_active = 1 LIMIT 1');
    if (gameRes.rows.length === 0) {
      console.log('❌ No active NB game found.');
      return;
    }
    const game = gameRes.rows[0];

    for (const winner of WINNERS) {
      // Check if already in participants
      const pRes = await client.query('SELECT * FROM nb_participants WHERE game_id = $1 AND user_id = $2', [game.id, winner.id]);
      
      if (pRes.rows.length > 0) {
        // Update to winner
        await client.query('UPDATE nb_participants SET is_winner = 1 WHERE game_id = $1 AND user_id = $2', [game.id, winner.id]);
        console.log(`✅ Updated existing participant ${winner.id} to winner.`);
      } else {
        // Insert as winner
        await client.query(
          'INSERT INTO nb_participants (game_id, user_id, username, is_winner, timestamp) VALUES ($1, $2, $3, 1, $4)',
          [game.id, winner.id, winner.username, Date.now()]
        );
        console.log(`✅ Added new winner ${winner.id}.`);
      }
      
      // Add prize money
      await client.query('UPDATE economy_users SET wallet = wallet + 100000 WHERE userid = $1', [winner.id]);
    }

    // 2. Update winners count in game
    const finalWinnersRes = await client.query('SELECT COUNT(*) FROM nb_participants WHERE game_id = $1 AND is_winner = 1', [game.id]);
    const count = parseInt(finalWinnersRes.rows[0].count);
    
    await client.query('UPDATE nb_games SET winners_count = $1 WHERE id = $2', [count, game.id]);
    console.log(`✅ Updated game winners count to ${count}.`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

addWinners();
