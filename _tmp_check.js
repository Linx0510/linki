const pool = require('./db/pool');

async function main() {
  try {
    const { rows: users } = await pool.query("SELECT id, username, email FROM users ORDER BY id DESC LIMIT 5");
    console.log('Recent users:');
    users.forEach(u => console.log(u.id, u.username, u.email));
    
    for (const u of users) {
      const { rows } = await pool.query(
        `SELECT uq.quest_id, uq.status, q.name, q.description, q.duration_days, q.reward_xp
         FROM user_quests uq
         JOIN quests q ON uq.quest_id = q.id
         WHERE uq.user_id = $1`,
        [u.id]
      );
      console.log('\nUser', u.id, 'has', rows.length, 'quests');
      rows.forEach(r => {
        console.log('  ', r.quest_id, r.status, '|', r.name, '|', (r.description||'').substring(0,30));
      });
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
  pool.end();
}

main();
