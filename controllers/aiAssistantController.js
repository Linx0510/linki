const TEXTAREA_MAX_LENGTH = 2000;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENROUTER_API_URL = 'https://api.openrouter.ai/v1/chat/completions';

const SYSTEM_PROMPT = `Ты — ИИ-помощник Линити внутри чата маркетплейса фриланс-услуг.
Отвечай на русском языке, дружелюбно и по делу. Помогай пользователям:
- сформулировать техническое задание;
- оценить этапы проекта и подготовку сделки;
- написать сообщение исполнителю или заказчику;
- разобраться с заказами, услугами, портфолио, балансом и безопасной коммуникацией.
Не обещай юридические, финансовые или медицинские гарантии. Если вопрос требует действий на сайте, предложи понятные шаги.`;

const normalizeMessages = (messages) => {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
    .map((item) => ({
      role: item.role,
      content: String(item.content || '').slice(0, TEXTAREA_MAX_LENGTH),
    }))
    .filter((item) => item.content.trim())
    .slice(-10);
};

const buildLocalReply = (message) => {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('тз') || lowerMessage.includes('техническ')) {
    return 'Помогу собрать ТЗ. Опишите цель проекта, целевую аудиторию, список функций, сроки, бюджет и 2–3 примера результата, который вам нравится. Могу сразу превратить ваш черновик в структурированное ТЗ.';
  }

  if (lowerMessage.includes('сделк') || lowerMessage.includes('заказ') || lowerMessage.includes('оплат')) {
    return 'Для безопасной работы фиксируйте договорённости в чате: результат, этапы, сроки, стоимость и критерии приёмки. Если проект большой, разбейте его на этапы и согласуйте каждый этап отдельно.';
  }

  if (lowerMessage.includes('исполнител') || lowerMessage.includes('фриланс')) {
    return 'При выборе исполнителя посмотрите портфолио, отзывы, похожие работы и скорость ответа. Напишите короткое сообщение: задача, сроки, бюджет и вопрос о релевантном опыте.';
  }

  if (lowerMessage.includes('цен') || lowerMessage.includes('стоим') || lowerMessage.includes('бюджет')) {
    return 'Чтобы оценить бюджет, разделите задачу на блоки: дизайн, разработка, правки, тестирование и поддержка. Укажите обязательные функции и желательные опции — так исполнитель сможет дать более точную цену.';
  }

  return 'Я помогу с задачами на Линити: составить ТЗ, подготовить сообщение, продумать этапы сделки или улучшить описание услуги. Напишите, что нужно сделать, и я предложу конкретный вариант.';
};

const getOpenAiReply = async (message, history) => {
  // Support OpenRouter via OPENROUTER_API_KEY or fallback to OPENAI_API_KEY
  const explicitOpenRouterKey = process.env.OPENROUTER_API_KEY;
  const anyKey = process.env.OPENAI_API_KEY || explicitOpenRouterKey;
  if (!anyKey) return null;

  // Treat explicit OPENROUTER_API_KEY as OpenRouter; also treat keys starting with 'sk-or-' as OpenRouter keys
  const useOpenRouter = Boolean(explicitOpenRouterKey) || (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-or-'));
  const openrouterKey = useOpenRouter ? (explicitOpenRouterKey || process.env.OPENAI_API_KEY) : process.env.OPENAI_API_KEY;
  const apiUrl = useOpenRouter ? OPENROUTER_API_URL : OPENAI_API_URL;
  const model = useOpenRouter ? (process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini') : (process.env.OPENAI_MODEL || 'gpt-4o-mini');

  const buildBody = () => JSON.stringify({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: message },
    ],
    temperature: 0.4,
    max_tokens: 700,
  });

  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = 30000; // 30s overall timeout per attempt
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openrouterKey}`,
        },
        body: buildBody(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI request failed: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content?.trim() || data?.output?.[0]?.content || null;
    } catch (err) {
      lastError = err;
      console.error(`AI request attempt ${attempt} to ${apiUrl} failed:`, err.message || err);
      // exponential backoff
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  // If OpenRouter attempt(s) failed and we used OpenRouter, try OpenAI endpoint if a separate OpenAI key exists
  if (useOpenRouter && process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith('sk-or-')) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const altResponse = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: buildBody(),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!altResponse.ok) {
        const txt = await altResponse.text();
        throw new Error(`OpenAI fallback failed: ${altResponse.status} ${txt}`);
      }
      const data = await altResponse.json();
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (altErr) {
      console.error('OpenAI fallback attempt failed:', altErr.message || altErr);
      lastError = altErr;
    }
  }

  throw lastError || new Error('All AI provider attempts failed');
};

const sendAssistantMessage = async (req, res) => {
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  const history = normalizeMessages(req.body.history);

  if (!message) {
    return res.status(400).json({ error: 'Сообщение не может быть пустым' });
  }

  if (message.length > TEXTAREA_MAX_LENGTH) {
    return res.status(400).json({ error: `Сообщение не должно превышать ${TEXTAREA_MAX_LENGTH} символов` });
  }

  try {
    const aiReply = await getOpenAiReply(message, history);
    return res.json({
      success: true,
      reply: aiReply || buildLocalReply(message),
      poweredByAi: Boolean(aiReply),
    });
  } catch (error) {
    console.error('AI assistant error:', error);
    return res.json({
      success: true,
      reply: `${buildLocalReply(message)}\n\nСейчас отвечаю в базовом режиме: внешний ИИ-сервис временно недоступен.`,
      poweredByAi: false,
    });
  }
};

module.exports = {
  sendAssistantMessage,
};
