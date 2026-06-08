const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ error: 'Имя обязательно' });
    if (!email || !EMAIL_REGEX.test(email)) return res.status(400).json({ error: 'Некорректный email' });
    if (!message || message.trim().length < 10) {
      return res.status(400).json({ error: 'Сообщение должно содержать минимум 10 символов' });
    }

    const { rows } = await pool.query(
      `INSERT INTO support_tickets (name, email, subject, message)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [name.trim(), email.trim(), (subject || '').trim(), message.trim()]
    );

    res.status(201).json({
      success: true,
      message: 'Ваше обращение принято. Мы ответим в течение 24 часов.',
      ticketId: rows[0].id
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.get('/', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, subject, status, created_at FROM support_tickets ORDER BY created_at DESC LIMIT 100'
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Ошибка сервера' }); }
});

module.exports = router;
