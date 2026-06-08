const express = require('express');
const router = express.Router();
const queries = require('../db/queries');
const { authenticateToken } = require('../middleware/auth');

// GET /api/quests — список квестов (с фильтром по типу)
router.get('/', async (req, res) => {
  try {
    const type = req.query.type; // 'expert' | 'community' | undefined
    const quests = await queries.getAllQuests({ type });
    res.json(quests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/quests/:id — детали квеста
router.get('/:id', async (req, res) => {
  try {
    const quest = await queries.getQuestById(req.params.id);
    if (!quest) return res.status(404).json({ error: 'Квест не найден' });
    res.json(quest);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/quests — создать квест (только авторизованные)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { questData, tasks, questType } = req.body;
    if (!questData || !questData.name || !questData.description) {
      return res.status(400).json({ error: 'Название и описание обязательны' });
    }
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: 'Добавьте хотя бы одно задание' });
    }
    questData.questType = questType || questData.questType || 'expert';
    // Community-квесты могут создавать все, expert-квесты — только эксперты/админы
    if (questData.questType === 'expert' && req.user.role !== 'expert' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Только эксперты могут создавать эксперт-квесты' });
    }
    const questId = await queries.createFullQuest(req.user.id, questData, tasks);
    res.json({ success: true, questId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Ошибка создания квеста' });
  }
});

// POST /api/quests/join — присоединиться к квесту
router.post('/join', authenticateToken, async (req, res) => {
  try {
    const { questId, price } = req.body;
    const userId = req.user.id;
    await queries.joinQuest(userId, questId);
    res.json({ success: true, message: 'Вы записались на квест' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Ошибка записи на квест' });
  }
});

module.exports = router;
