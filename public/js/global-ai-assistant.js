(() => {
  const root = document.querySelector('[data-ai-assistant]');
  if (!root) {
    return;
  }

  const toggle = root.querySelector('.global-ai-assistant__toggle');
  const closeButton = root.querySelector('.global-ai-assistant__close');
  const panel = root.querySelector('.global-ai-assistant__panel');
  const form = root.querySelector('[data-ai-form]');
  const textarea = form?.querySelector('textarea[name="message"]');
  const messagesContainer = root.querySelector('[data-ai-messages]');
  const csrfToken = root.dataset.csrfToken || '';
  const userId = root.dataset.userId || 'guest';
  const storageKey = `linestok-global-ai-assistant-${userId}`;
  const stateKey = `linestok-global-ai-assistant-open-${userId}`;
  const maxStoredMessages = 20;

  const welcomeMessage = {
    role: 'assistant',
    content: 'Здравствуйте! Я помогу составить ТЗ, подготовить сообщение, разобраться со сделкой, услугой или портфолио на Линити. Что нужно сделать?',
  };

  const readStoredMessages = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter((message) => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
        .slice(-maxStoredMessages);
    } catch (error) {
      return [];
    }
  };

  let messages = readStoredMessages();

  const saveMessages = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-maxStoredMessages)));
    } catch (error) {

    }
  };

  const setOpen = (isOpen) => {
    root.classList.toggle('global-ai-assistant--open', isOpen);
    toggle?.setAttribute('aria-expanded', String(isOpen));
    try {
      localStorage.setItem(stateKey, isOpen ? '1' : '0');
    } catch (error) {

    }

    if (isOpen) {
      requestAnimationFrame(() => textarea?.focus());
    }
  };

  const scrollMessagesToBottom = () => {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  };

  const createMessageElement = (message) => {
    const item = document.createElement('article');
    item.className = `global-ai-assistant__message global-ai-assistant__message--${message.role}`;

    const label = document.createElement('span');
    label.textContent = message.role === 'user' ? 'Вы' : 'ИИ';

    const text = document.createElement('p');
    text.textContent = message.content;

    item.append(label, text);
    return item;
  };

  const renderMessages = () => {
    if (!messagesContainer) {
      return;
    }

    messagesContainer.innerHTML = '';
    [welcomeMessage, ...messages].forEach((message) => {
      messagesContainer.append(createMessageElement(message));
    });
    scrollMessagesToBottom();
  };

  const setPending = (isPending) => {
    root.classList.toggle('global-ai-assistant--pending', isPending);
    const submitButton = form?.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = isPending;
      submitButton.textContent = isPending ? 'Думаю…' : 'Отправить';
    }

    if (textarea) {
      textarea.disabled = isPending;
    }
  };

  const requestAssistantReply = async (message) => {
    const response = await fetch('/api/ai-assistant/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({
        message,
        history: messages.slice(-10),
      }),
    });

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : { error: await response.text() };

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Не удалось получить ответ ИИ-помощника');
    }

    return data.reply;
  };

  toggle?.addEventListener('click', () => setOpen(!root.classList.contains('global-ai-assistant--open')));
  closeButton?.addEventListener('click', () => setOpen(false));

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = textarea?.value.trim();

    if (!message) {
      return;
    }

    messages.push({ role: 'user', content: message });
    textarea.value = '';
    renderMessages();
    saveMessages();
    setPending(true);

    try {
      const reply = await requestAssistantReply(message);
      messages.push({ role: 'assistant', content: reply });
    } catch (error) {
      messages.push({
        role: 'assistant',
        content: 'Не получилось связаться с помощником. Проверьте интернет и попробуйте ещё раз.',
      });
    } finally {
      setPending(false);
      renderMessages();
      saveMessages();
    }
  });

  textarea?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form?.requestSubmit();
    }
  });

  renderMessages();

  let shouldRestoreOpenState = false;
  try {
    shouldRestoreOpenState = localStorage.getItem(stateKey) === '1';
  } catch (error) {
    shouldRestoreOpenState = false;
  }

  setOpen(shouldRestoreOpenState);
})();
