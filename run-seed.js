const pool = require('./db/pool');
const fs = require('fs');

async function seed() {
  try {
    const sql = fs.readFileSync('./seed.sql', 'utf8');
    await pool.query(sql);
    console.log('Seed data loaded successfully!');
  } catch (err) {
    console.error('Seed failed:', err);
  } finally {
    process.exit();
  }
}

seed();
