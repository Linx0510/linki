const express = require('express');
const router = express.Router();
const queries = require('../db/queries');
const { authenticateToken, authorizeRole } = require('../middleware/auth');

// GET /api/admin/stats
router.get('/stats', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const stats = await queries.getAdminStats();
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/admin/submissions
router.get('/submissions', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const submissions = await queries.getAllSubmissions();
    res.json(submissions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/admin/submissions/:id/status
router.post('/submissions/:id/status', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const { status, comment } = req.body;
    const submission = await queries.updateSubmissionStatus(req.params.id, status, comment);
    res.json(submission);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Ошибка сервера' });
  }
});

module.exports = router;
