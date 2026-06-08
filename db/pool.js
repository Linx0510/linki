require('dotenv').config();
const { Pool } = require('pg');

let pool;

if (process.env.DATABASE_URL) {
  // Vercel / cloud: use connection string with SSL (required by Neon, Supabase, etc.)
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5, // Serverless: keep connections minimal
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  });
} else {
  // Local dev: use individual env vars
  pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
}

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
