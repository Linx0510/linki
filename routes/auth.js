const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const queries = require('../db/queries');

function generateToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, username: user.username, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// GET — serve static HTML pages
router.get('/login', (req, res) => {
  res.sendFile('auth.html', { root: require('path').dirname(require.main.filename) });
});

router.get('/register', (req, res) => {
  res.sendFile('auth.html', { root: require('path').dirname(require.main.filename) });
});

// POST /api/auth/login — JWT authentication
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }
    const user = await queries.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Неверные учетные данные' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Неверные учетные данные' });
    }
    const token = generateToken(user);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, level: user.level, xp: user.xp } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/auth/register — JWT registration
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Неверный формат email' });
    }
    const existing = await queries.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Пользователь уже существует' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await queries.createUser(username, email, passwordHash);
    const token = generateToken(newUser);
    res.status(201).json({ token, user: { id: newUser.id, username: newUser.username, role: newUser.role, level: newUser.level, xp: newUser.xp } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.json({ message: 'Выход выполнен' });
});

module.exports = router;
