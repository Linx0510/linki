const express = require('express');
const router = express.Router();
const queries = require('../db/queries');
const { authenticateToken } = require('../middleware/auth');

router.get('/list', authenticateToken, async (req, res) => {
  try {
    res.json(await queries.getUserChats(req.user.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/history/:partnerId', authenticateToken, async (req, res) => {
  try {
    const partnerId = parseInt(req.params.partnerId);
    if (isNaN(partnerId)) return res.status(400).json({ error: 'Некорректный ID собеседника' });
    res.json(await queries.getChatHistory(req.user.id, partnerId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/send', authenticateToken, async (req, res) => {
  try {
    const { receiverId, content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    if (!receiverId || isNaN(parseInt(receiverId))) return res.status(400).json({ error: 'Некорректный ID получателя' });
    const msg = await queries.sendMessage(req.user.id, parseInt(receiverId), content.trim());
    res.status(201).json(msg);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
