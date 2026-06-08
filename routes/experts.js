const express = require('express');
const router = express.Router();
const queries = require('../db/queries');
const { authenticateToken } = require('../middleware/auth');

router.get('/', async (req, res) => {
  try { res.json(await queries.getVerifiedExperts()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/profile/:id', async (req, res) => {
  try {
    const expert = await queries.getExpertFullProfile(req.params.id);
    if (!expert) return res.status(404).json({ error: 'Эксперт не найден' });
    res.json(expert);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.get('/:id/availability', async (req, res) => {
  try { res.json(await queries.getExpertAvailability(req.params.id)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/reviews', async (req, res) => {
  try { res.json(await queries.getExpertReviews(req.params.id)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/review/:reviewId/reply', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'expert' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Только эксперты могут отвечать на отзывы' });
    }
    const { reply_text } = req.body;
    if (!reply_text || !reply_text.trim()) {
      return res.status(400).json({ error: 'Текст ответа обязателен' });
    }
    const review = await queries.replyToReview(req.params.reviewId, req.user.id, reply_text.trim());
    if (!review) return res.status(404).json({ error: 'Отзыв не найден' });
    res.json({ success: true, review });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.get('/:id/quests', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id != req.params.id) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    res.json(await queries.getExpertQuests(req.params.id));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.get('/:id/clients', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id != req.params.id) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    res.json(await queries.getExpertClients(req.params.id));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.get('/:id/finances', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id != req.params.id) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    res.json(await queries.getExpertFinances(req.params.id));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id != req.params.id) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    res.json(await queries.updateExpertProfile(req.params.id, req.body));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.post('/book', authenticateToken, async (req, res) => {
  try {
    const { expertId, scheduledAt, duration, price } = req.body;
    const userId = req.user.id;
    if (!expertId || !scheduledAt) {
      return res.status(400).json({ error: 'expertId и scheduledAt обязательны' });
    }
    await queries.createTransaction(userId, price || 0, 'session_booking', expertId);
    const roomId = `aktiv-${expertId}-${Date.now()}`;
    const meetingLink = `https://meet.aktiv-platform.ru/room/${roomId}`;
    const session = await queries.bookSession(expertId, userId, scheduledAt, duration || 60, price || 0, meetingLink);
    await queries.createNotification(userId, 'system', 'Сессия забронирована', `Вы записаны к эксперту на ${new Date(scheduledAt).toLocaleString('ru-RU')}`);
    res.json({ success: true, session });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.get('/:id/submissions', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id != req.params.id) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    res.json(await queries.getExpertSubmissions(req.params.id));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Ошибка сервера' }); }
});

router.get('/:id/transactions', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.id != req.params.id) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    res.json(await queries.getExpertTransactions(req.params.id));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Ошибка сервера' }); }
});

module.exports = router;
