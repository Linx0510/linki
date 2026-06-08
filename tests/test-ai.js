require('dotenv').config();

const fetch = global.fetch || require('node-fetch');

(async () => {
  try {
    const explicitOpenRouterKey = process.env.OPENROUTER_API_KEY;
    const anyKey = process.env.OPENAI_API_KEY || explicitOpenRouterKey;
    if (!anyKey) {
      console.error('No API key found in OPENROUTER_API_KEY or OPENAI_API_KEY');
      process.exit(2);
    }

    const useOpenRouter = Boolean(explicitOpenRouterKey) || (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-or-'));
    const apiUrl = useOpenRouter ? 'https://api.openrouter.ai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
    const model = useOpenRouter ? (process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini') : (process.env.OPENAI_MODEL || 'gpt-4o-mini');

    const message = process.argv[2] || 'Привет, как тебя зовут?';

    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anyKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'Тестовый ИИ-помощник.' },
          { role: 'user', content: message }
        ],
        temperature: 0.2,
        max_tokens: 200
      })
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error('API error:', resp.status, txt);
      process.exit(3);
    }

    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content || data?.output?.[0]?.content || JSON.stringify(data);
    console.log('AI reply:');
    console.log(reply);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(4);
  }
})();
