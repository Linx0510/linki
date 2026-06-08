const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const queries = require('../db/queries');

const router = express.Router();

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat:free';
const MAX_HISTORY = 20;
const MAX_MESSAGE_LENGTH = 2000;

if (!API_KEY) {
  console.warn('WARN: OPENROUTER_API_KEY is not set. AI chat will return errors.');
}

function buildSystemPrompt(user, quests, streak) {
  const questContext = quests && quests.length > 0
    ? quests.map(q => `- "${q.name}" (день ${q.current_day || 0} из ${q.duration_days || '?'})`).join('\n')
    : 'нет активных квестов';

  return `Ты — AI-помощник платформы AKTIV (Ludo). Это геймифицированная платформа для саморазвития, где пользователи проходят квесты от экспертов, выполняют ежедневные задания, зарабатывают XP, повышают уровень и поддерживают streak (серию дней).

Твоя роль:
- Отвечай на вопросы о платформе AKTIV (квесты, XP, уровни, энергия, streak, достижения, эксперты).
- Мотивируй пользователя, помогай ему не сорваться с квеста, давай практические советы по продуктивности, здоровью, фитнесу, обучению.
- Если пользователь просит сгенерировать план, идею для квеста или задание — помогай креативно, но не выдумывай функционал, которого нет на платформе.
- Если вопрос совсем не по теме (политика, вредные инструкции, нелегальные действия), вежливо откажи и переведи разговор обратно к саморазвитию.
- Будь дружелюбным, энергичным, поддерживающим. Обращайся на "ты". Используй эмодзи умеренно.

Текущий пользователь:
- Имя: ${user?.username || 'игрок'}
- Уровень: ${user?.level || 1}
- XP: ${user?.xp || 0}
- Энергия: ${user?.energy || 100}/100
- Streak: ${streak || 0} дней
- Активные квесты:\n${questContext}`;
}

router.post('/chat', authenticateToken, async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(503).json({ error: 'AI-сервис временно недоступен. Отсутствует API-ключ.' });
    }

    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Передайте массив messages' });
    }

    // Ограничиваем длину истории и сообщений
    const trimmedMessages = messages.slice(-MAX_HISTORY).map(m => ({
      role: m.role === 'assistant' || m.role === 'user' ? m.role : 'user',
      content: String(m.content || '').slice(0, MAX_MESSAGE_LENGTH)
    }));

    // Получаем контекст пользователя из БД
    const userId = req.user.id;
    let userContext = null;
    let userQuests = [];
    let streak = 0;
    try {
      userContext = await queries.getUserById(userId);
      userQuests = await queries.getUserActiveQuests(userId);
      streak = await queries.getUserStreak(userId);
    } catch (dbErr) {
      console.error('AI context DB error:', dbErr.message);
      // продолжаем без контекста, не критично
    }

    const systemPrompt = buildSystemPrompt(userContext, userQuests, streak);

    const payload = {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...trimmedMessages
      ],
      temperature: 0.8,
      max_tokens: 1024
    };

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'HTTP-Referer': req.headers.origin || 'http://localhost:3000',
        'X-Title': 'AKTIV AI Assistant'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter error:', response.status, errorText);
      return res.status(502).json({ error: 'Ошибка при обращении к AI-сервису. Попробуйте позже.' });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return res.status(502).json({ error: 'AI не вернул ответ. Попробуйте ещё раз.' });
    }

    res.json({ reply });
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: 'Ошибка сервера при обработке запроса к AI' });
  }
});

module.exports = router;
