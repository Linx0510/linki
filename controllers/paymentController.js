const db = require('../config/database');

const PLATFORM_FEE_RATE = 0.03;

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

const getPlatformAdminAccount = async (client = db) => {
  const adminResult = await client.query(
    `SELECT id FROM users WHERE role_id = 1 ORDER BY id ASC LIMIT 1`
  );

  const admin = adminResult.rows[0];
  if (!admin) {
    return null;
  }

  await getOrCreateBalance(admin.id, client);
  return admin;
};

const ensureBalanceTables = async (queryable) => {
  await queryable.query(`
    CREATE TABLE IF NOT EXISTS user_balances (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
      held_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await queryable.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(20) NOT NULL CHECK (type IN ('topup', 'hold', 'release', 'withdraw', 'fee')),
      amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'canceled')),
      metadata JSONB,
      description TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);


  await queryable.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending'`);
  await queryable.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_confirmed BOOLEAN DEFAULT FALSE`);
  await queryable.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS executor_confirmed BOOLEAN DEFAULT FALSE`);
  await queryable.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(12, 2) DEFAULT 0`);
  await queryable.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS fee_recipient_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await queryable.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_fee_rate NUMERIC(5, 4) DEFAULT 0.03`);
  await queryable.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);


  await queryable.query(`
    INSERT INTO user_balances (user_id, balance, held_balance)
    SELECT id, 0, 0 FROM users
    ON CONFLICT (user_id) DO NOTHING
  `);
};

const getOrCreateBalance = async (userId, client = db) => {
  await ensureBalanceTables(client);
  const result = await client.query(
    `SELECT * FROM user_balances WHERE user_id = $1`,
    [userId]
  );
  if (result.rows.length === 0) {
    const insert = await client.query(
      `INSERT INTO user_balances (user_id, balance, held_balance) VALUES ($1, 0, 0) RETURNING *`,
      [userId]
    );
    return insert.rows[0];
  }
  return result.rows[0];
};

const createTopUp = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const userId = req.session.user.id;
  const amount = parseFloat(req.body.amount);

  if (!amount || amount < 100 || amount > 500000) {
    return res.status(400).json({ error: 'Укажите сумму от 100 до 500 000 ₽' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await ensureBalanceTables(client);

    const metadata = {
      mode: 'virtual_balance',
      note: 'Демо-пополнение: реальные деньги не списываются и не принимаются',
    };

    const paymentResult = await client.query(
      `INSERT INTO payments (user_id, type, amount, status, metadata, description)
       VALUES ($1, 'topup', $2, 'succeeded', $3, $4)
       RETURNING id, type, amount, status, description, created_at`,
      [userId, amount, JSON.stringify(metadata), `Виртуальное пополнение баланса на ${amount} ₽`]
    );

    const balanceResult = await client.query(
      `UPDATE user_balances
       SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2
       RETURNING balance, held_balance`,
      [amount, userId]
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      balance: Number(balanceResult.rows[0]?.balance || 0),
      heldBalance: Number(balanceResult.rows[0]?.held_balance || 0),
      transaction: paymentResult.rows[0],
      message: 'Баланс пополнен виртуальными средствами',
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create virtual topup error:', error);
    return res.status(500).json({ error: 'Ошибка при пополнении баланса' });
  } finally {
    client.release();
  }
};

const getBalance = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  try {
    const balance = await getOrCreateBalance(req.session.user.id);
    return res.json({
      balance: Number(balance.balance || 0),
      heldBalance: Number(balance.held_balance || 0),
    });
  } catch (error) {
    console.error('Get balance error:', error);
    return res.status(500).json({ error: 'Ошибка при загрузке баланса' });
  }
};

const getTransactions = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  try {
    const result = await db.query(
      `SELECT id, type, amount, status, description, created_at
       FROM payments
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.session.user.id]
    );
    return res.json({ transactions: result.rows });
  } catch (error) {
    console.error('Get transactions error:', error);
    return res.status(500).json({ error: 'Ошибка при загрузке истории' });
  }
};

module.exports = {
  ensureBalanceTables,
  getOrCreateBalance,
  getPlatformAdminAccount,
  PLATFORM_FEE_RATE,
  roundMoney,
  createTopUp,
  getBalance,
  getTransactions,
};
