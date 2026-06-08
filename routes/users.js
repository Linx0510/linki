const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const queries = require('../db/queries');
const pool = require('../db/pool');
const { authenticateToken } = require('../middleware/auth');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_REGEX = /^https?:\/\/.{3,}/;

// Public profile — only safe fields (no email, no password_hash)
router.get('/:id', async (req, res) => {
  try {
    const user = await queries.getUserPublicProfile(req.params.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    const [skills, achievements] = await Promise.all([
      queries.getUserSkills(req.params.id),
      queries.getUserAchievements(req.params.id)
    ]);
    res.json({ ...user, skills, achievements });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Own full profile — authenticated, syncs energy
router.get('/me/profile', authenticateToken, async (req, res) => {
  try {
    await queries.syncUserEnergy(req.user.id);
    const user = await queries.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    const [skills, achievements] = await Promise.all([
      queries.getUserSkills(req.user.id),
      queries.getUserAchievements(req.user.id)
    ]);
    res.json({ ...user, skills, achievements });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.id != req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    const { username, email } = req.body;
    if (!username || !username.trim()) return res.status(400).json({ error: 'Имя пользователя обязательно' });
    if (!email || !EMAIL_REGEX.test(email)) return res.status(400).json({ error: 'Некорректный email' });
    res.json(await queries.updateUserProfile(req.params.id, username.trim(), email.trim().toLowerCase()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/:id/avatar', authenticateToken, async (req, res) => {
  try {
    if (req.user.id != req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    const { avatarUrl } = req.body;
    if (!avatarUrl || !URL_REGEX.test(avatarUrl)) {
      return res.status(400).json({ error: 'Некорректный URL аватара' });
    }
    // Limit URL length to prevent abuse
    if (avatarUrl.length > 2048) {
      return res.status(400).json({ error: 'URL слишком длинный' });
    }
    res.json(await queries.updateUserAvatar(req.params.id, avatarUrl));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/:id/password', authenticateToken, async (req, res) => {
  try {
    if (req.user.id != req.params.id) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Текущий и новый пароль обязательны' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Новый пароль должен содержать минимум 6 символов' });
    }
    if (newPassword.length > 128) {
      return res.status(400).json({ error: 'Пароль слишком длинный' });
    }
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Пользователь не найден' });

    const isMatch = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!isMatch) return res.status(401).json({ error: 'Текущий пароль неверен' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.params.id]);
    res.json({ success: true, message: 'Пароль успешно изменён' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Notifications — private to owner only
router.get('/:id/notifications', authenticateToken, async (req, res) => {
  try {
    if (req.user.id != req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    const [list, rawCount] = await Promise.all([
      queries.getUserNotifications(req.params.id),
      queries.getUnreadCount(req.params.id)
    ]);
    res.json({ list, unreadCount: parseInt(rawCount) || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/:id/notifications/read', authenticateToken, async (req, res) => {
  try {
    if (req.user.id != req.params.id) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/:id/sessions', authenticateToken, async (req, res) => {
  try {
    if (req.user.id != req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    res.json(await queries.getUserSessions(req.params.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Quests — private to owner
router.get('/:id/quests', authenticateToken, async (req, res) => {
  try {
    if (req.user.id != req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    const { rows } = await pool.query(
      `SELECT uq.*, q.name, q.reward_xp, q.duration_days, q.category, q.quest_type, u.username as expert_name
       FROM user_quests uq
       JOIN quests q ON uq.quest_id = q.id
       LEFT JOIN users u ON q.expert_id = u.id
       WHERE uq.user_id = $1
       ORDER BY uq.joined_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// XP history — private to owner
router.get('/:id/xp-history', authenticateToken, async (req, res) => {
  try {
    if (req.user.id != req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    const { rows } = await pool.query(
      `SELECT SUM(amount) as daily_xp, created_at::date as date
       FROM user_xp_history
       WHERE user_id = $1 AND created_at > CURRENT_DATE - INTERVAL '120 days'
       GROUP BY created_at::date
       ORDER BY date ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Streak is a social metric — publicly visible on profile
router.get('/:id/streak', async (req, res) => {
  try {
    res.json({ streak: await queries.getUserStreak(req.params.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
