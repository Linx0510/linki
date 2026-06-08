const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildAiAssistantWidget = (locals = {}) => {
  const csrfToken = escapeHtml(locals.csrfToken || '');
  const userId = locals.currentUser?.id ? String(locals.currentUser.id) : 'guest';
  const userName = escapeHtml(locals.currentUser?.first_name || '');

  return `
    <div class="global-ai-assistant" data-ai-assistant data-csrf-token="${csrfToken}" data-user-id="${escapeHtml(userId)}" data-user-name="${userName}">
      <button class="global-ai-assistant__toggle" type="button" aria-expanded="false" aria-controls="global-ai-assistant-panel">
        <span class="global-ai-assistant__pulse" aria-hidden="true"></span>
        <span class="global-ai-assistant__toggle-text">ИИ</span>
      </button>
      <section class="global-ai-assistant__panel" id="global-ai-assistant-panel" aria-label="ИИ-помощник LineStok">
        <header class="global-ai-assistant__header">
          <div>
            <h2>ИИ-помощник</h2>
          </div>
          <button class="global-ai-assistant__close" type="button" aria-label="Свернуть ИИ-помощника">×</button>
        </header>
        <div class="global-ai-assistant__messages" data-ai-messages role="log" aria-live="polite"></div>
        <form class="global-ai-assistant__form" data-ai-form>
          <textarea name="message" rows="2" maxlength="2000" placeholder="Спросите про ТЗ, сделку или услугу…" required></textarea>
          <button type="submit">Отправить</button>
        </form>
      </section>
    </div>
    <link rel="stylesheet" href="/css/global-ai-assistant.css">
    <script src="/js/global-ai-assistant.js" defer></script>
  `;
};

const injectAiAssistantWidget = (html, locals) => {
  if (typeof html !== 'string' || !html.includes('</body>') || html.includes('data-ai-assistant')) {
    return html;
  }

  return html.replace('</body>', `${buildAiAssistantWidget(locals)}</body>`);
};

const attachAiAssistantWidget = (req, res, next) => {
  const originalRender = res.render.bind(res);

  res.render = (view, options, callback) => {
    const renderOptions = options && typeof options === 'object' ? options : {};
    const renderCallback = typeof options === 'function' ? options : callback;

    originalRender(view, renderOptions, (error, html) => {
      if (error) {
        if (renderCallback) {
          return renderCallback(error);
        }

        return next(error);
      }

      const injectedHtml = injectAiAssistantWidget(html, res.locals);
      if (renderCallback) {
        return renderCallback(null, injectedHtml);
      }

      return res.send(injectedHtml);
    });
  };

  next();
};

module.exports = {
  attachAiAssistantWidget,
};
