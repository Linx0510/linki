const db = require('../config/database');
const { getOrCreateBalance, ensureBalanceTables } = require('./paymentController');

const ensureWithdrawalTables = async (queryable) => {
  await ensureBalanceTables(queryable);
  await queryable.query(`
    CREATE TABLE IF NOT EXISTS withdrawal_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      payment_method VARCHAR(20) NOT NULL DEFAULT 'card' CHECK (payment_method IN ('card', 'sbp')),
      details TEXT NOT NULL DEFAULT '',
      bank_id VARCHAR(50),
      rejection_reason TEXT,
      payout_error TEXT,
      processed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP
    )
  `);
};

const createWithdrawal = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const userId = req.session.user.id;
  const amount = parseFloat(req.body.amount);
  const paymentMethod = req.body.paymentMethod || 'card';
  const details = typeof req.body.details === 'string' ? req.body.details.trim() : '';
  const bankId = typeof req.body.bankId === 'string' ? req.body.bankId.trim() : '';

  if (!amount || amount < 1000) {
    return res.status(400).json({ error: 'Минимальная сумма вывода — 1 000 ₽' });
  }
  if (amount > 500000) {
    return res.status(400).json({ error: 'Максимальная сумма вывода — 500 000 ₽' });
  }
  if (!details || details.length < 5) {
    return res.status(400).json({ error: 'Укажите реквизиты для вывода' });
  }
  if (!['card', 'sbp'].includes(paymentMethod)) {
    return res.status(400).json({ error: 'Неверный способ вывода' });
  }
  if (paymentMethod === 'sbp' && !bankId) {
    return res.status(400).json({ error: 'Выберите банк для СБП' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await ensureWithdrawalTables(client);

    const balance = await getOrCreateBalance(userId, client);
    if (Number(balance.balance) < amount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Недостаточно средств на балансе' });
    }

    await client.query(
      `UPDATE user_balances SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2`,
      [amount, userId]
    );

    await client.query(
      `INSERT INTO payments (user_id, type, amount, status, description)
       VALUES ($1, 'withdraw', $2, 'pending', $3)`,
      [userId, amount, `Демо-заявка на вывод ${amount} ₽`]
    );

    const result = await client.query(
      `INSERT INTO withdrawal_requests (user_id, amount, status, payment_method, details, bank_id)
       VALUES ($1, $2, 'pending', $3, $4, $5)
       RETURNING *`,
      [userId, amount, paymentMethod, details, bankId || null]
    );

    await client.query('COMMIT');
    return res.json({ success: true, request: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create withdrawal error:', error);
    return res.status(500).json({ error: 'Ошибка при создании заявки' });
  } finally {
    client.release();
  }
};

const getMyWithdrawals = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  try {
    await ensureWithdrawalTables(db);

    const result = await db.query(
      `SELECT id, amount, status, payment_method, details, bank_id, rejection_reason, payout_error, created_at, processed_at
       FROM withdrawal_requests
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.session.user.id]
    );
    return res.json({ withdrawals: result.rows });
  } catch (error) {
    console.error('Get withdrawals error:', error);
    return res.status(500).json({ error: 'Ошибка при загрузке заявок' });
  }
};

const getAllWithdrawals = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = await db.query(`SELECT role_id FROM users WHERE id = $1`, [req.session.user.id]);
  const isAdmin = user.rows[0]?.role_id === 1;
  if (!isAdmin) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  try {
    await ensureWithdrawalTables(db);

    const result = await db.query(
      `SELECT w.*, u.first_name, u.last_name, u.email
       FROM withdrawal_requests w
       JOIN users u ON w.user_id = u.id
       ORDER BY w.created_at DESC
       LIMIT 200`
    );
    return res.json({ withdrawals: result.rows });
  } catch (error) {
    console.error('Get all withdrawals error:', error);
    return res.status(500).json({ error: 'Ошибка при загрузке заявок' });
  }
};

const approveWithdrawal = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const adminId = req.session.user.id;
  const user = await db.query(`SELECT role_id FROM users WHERE id = $1`, [adminId]);
  const isAdmin = user.rows[0]?.role_id === 1;
  if (!isAdmin) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  const { id } = req.params;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await ensureWithdrawalTables(client);

    const request = await client.query(
      `SELECT * FROM withdrawal_requests WHERE id = $1 AND status = 'pending' FOR UPDATE`,
      [id]
    );
    if (request.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Заявка не найдена или уже обработана' });
    }

    const reqData = request.rows[0];

    await client.query(
      `UPDATE withdrawal_requests
       SET status = 'approved', processed_by = $1, processed_at = CURRENT_TIMESTAMP, payout_error = NULL
       WHERE id = $2`,
      [adminId, id]
    );

    await client.query(
      `UPDATE payments SET status = 'succeeded', updated_at = CURRENT_TIMESTAMP
       WHERE id = (
         SELECT id FROM payments
         WHERE user_id = $1 AND type = 'withdraw' AND status = 'pending'
           AND amount = $2 AND created_at >= (SELECT created_at FROM withdrawal_requests WHERE id = $3)
         ORDER BY created_at ASC
         LIMIT 1
       )`,
      [reqData.user_id, reqData.amount, id]
    );

    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Approve withdrawal error:', error);
    return res.status(500).json({ error: 'Ошибка при подтверждении' });
  } finally {
    client.release();
  }
};

const rejectWithdrawal = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const adminId = req.session.user.id;
  const user = await db.query(`SELECT role_id FROM users WHERE id = $1`, [adminId]);
  const isAdmin = user.rows[0]?.role_id === 1;
  if (!isAdmin) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  const { id } = req.params;
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');
    await ensureWithdrawalTables(client);

    const request = await client.query(
      `SELECT * FROM withdrawal_requests WHERE id = $1 AND status = 'pending' FOR UPDATE`,
      [id]
    );
    if (request.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Заявка не найдена или уже обработана' });
    }

    const reqData = request.rows[0];

    await client.query(
      `UPDATE user_balances SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2`,
      [reqData.amount, reqData.user_id]
    );

    await client.query(
      `UPDATE withdrawal_requests
       SET status = 'rejected', processed_by = $1, processed_at = CURRENT_TIMESTAMP, rejection_reason = $2
       WHERE id = $3`,
      [adminId, reason || null, id]
    );

    await client.query(
      `UPDATE payments SET status = 'canceled', updated_at = CURRENT_TIMESTAMP
       WHERE id = (
         SELECT id FROM payments
         WHERE user_id = $1 AND type = 'withdraw' AND status = 'pending'
           AND amount = $2 AND created_at >= $3
         ORDER BY created_at ASC
         LIMIT 1
       )`,
      [reqData.user_id, reqData.amount, reqData.created_at]
    );

    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Reject withdrawal error:', error);
    return res.status(500).json({ error: 'Ошибка при отклонении' });
  } finally {
    client.release();
  }
};

module.exports = {
  ensureWithdrawalTables,
  createWithdrawal,
  getMyWithdrawals,
  getAllWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
};
