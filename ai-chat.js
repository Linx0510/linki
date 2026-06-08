(function () {
  'use strict';

  const STORAGE_KEY = 'ludo_ai_chat_history';
  const MAX_HISTORY = 50;
  const API_URL = '/api/ai/chat';

  let chatWindow, messagesContainer, inputField, sendBtn, toggleBtn, quickPrompts;
  let isOpen = false;
  let isLoading = false;

  function getToken() {
    return localStorage.getItem('ludo_token');
  }

  function injectStyles() {
    if (document.getElementById('ludo-ai-chat-styles')) return;
    const style = document.createElement('style');
    style.id = 'ludo-ai-chat-styles';
    style.textContent = `
      :root {
        --ai-bg: #0a0a0f;
        --ai-panel: #12121a;
        --ai-border: rgba(232,168,216,0.15);
        --ai-pink: #e8a8d8;
        --ai-pink-dim: rgba(232,168,216,0.12);
        --ai-text: #f0f0f5;
        --ai-text-muted: #8888a0;
        --ai-user-bubble: linear-gradient(135deg, rgba(232,168,216,0.25), rgba(232,168,216,0.10));
        --ai-bot-bubble: rgba(255,255,255,0.04);
        --ai-radius: 16px;
        --ai-shadow: 0 12px 40px rgba(0,0,0,0.5);
      }

      #ludo-ai-toggle {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 60px;
        height: 60px;
        border-radius: 20px;
        background: linear-gradient(135deg, #e8a8d8, #b088d0);
        color: #0a0a0f;
        border: none;
        cursor: pointer;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 8px 24px rgba(232,168,216,0.35);
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
      #ludo-ai-toggle svg {
        width: 28px;
        height: 28px;
        stroke: #0a0a0f;
        stroke-width: 2.2;
        fill: none;
      }
      #ludo-ai-toggle:hover {
        transform: scale(1.1) rotate(5deg);
        box-shadow: 0 12px 32px rgba(232,168,216,0.5);
      }
      #ludo-ai-toggle.hidden { display: none; }

      #ludo-ai-window {
        position: fixed;
        bottom: 100px;
        right: 24px;
        width: 360px;
        max-width: calc(100vw - 48px);
        height: 520px;
        max-height: calc(100vh - 120px);
        background: var(--ai-panel);
        border: 1px solid var(--ai-border);
        border-radius: var(--ai-radius);
        box-shadow: var(--ai-shadow);
        z-index: 9998;
        display: none;
        flex-direction: column;
        overflow: hidden;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
        color: var(--ai-text);
        animation: aiFadeIn 0.25s ease;
      }
      #ludo-ai-window.open { display: flex; }

      @keyframes aiFadeIn {
        from { opacity: 0; transform: translateY(12px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }

      .ai-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        border-bottom: 1px solid var(--ai-border);
        background: rgba(232,168,216,0.06);
      }
      .ai-header-title {
        font-weight: 700;
        font-size: 15px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .ai-header-title span {
        display: inline-block;
        width: 8px;
        height: 8px;
        background: #7ee787;
        border-radius: 50%;
        box-shadow: 0 0 6px #7ee787;
      }
      .ai-header-actions {
        display: flex;
        gap: 6px;
      }
      .ai-header-btn {
        background: transparent;
        border: 1px solid var(--ai-border);
        color: var(--ai-text-muted);
        border-radius: 8px;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.15s;
      }
      .ai-header-btn:hover {
        color: var(--ai-text);
        border-color: var(--ai-pink);
      }

      .ai-messages {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        scrollbar-width: thin;
        scrollbar-color: rgba(232,168,216,0.2) transparent;
      }
      .ai-messages::-webkit-scrollbar { width: 6px; }
      .ai-messages::-webkit-scrollbar-thumb { background: rgba(232,168,216,0.2); border-radius: 3px; }

      .ai-bubble {
        max-width: 85%;
        padding: 10px 13px;
        border-radius: 14px;
        font-size: 13.5px;
        line-height: 1.5;
        word-wrap: break-word;
        white-space: pre-wrap;
        animation: aiPop 0.2s ease;
      }
      @keyframes aiPop {
        from { opacity: 0; transform: scale(0.92); }
        to   { opacity: 1; transform: scale(1); }
      }
      .ai-bubble.user {
        align-self: flex-end;
        background: var(--ai-user-bubble);
        color: var(--ai-text);
        border-bottom-right-radius: 4px;
      }
      .ai-bubble.assistant {
        align-self: flex-start;
        background: var(--ai-bot-bubble);
        color: var(--ai-text);
        border: 1px solid var(--ai-border);
        border-bottom-left-radius: 4px;
      }
      .ai-bubble.system {
        align-self: center;
        font-size: 12px;
        color: var(--ai-text-muted);
        background: transparent;
        padding: 4px;
      }

      .ai-typing {
        display: flex;
        gap: 4px;
        padding: 10px 13px;
        align-self: flex-start;
        background: var(--ai-bot-bubble);
        border: 1px solid var(--ai-border);
        border-radius: 14px;
        border-bottom-left-radius: 4px;
      }
      .ai-typing span {
        width: 6px;
        height: 6px;
        background: var(--ai-pink);
        border-radius: 50%;
        animation: aiBounce 1s infinite ease-in-out;
      }
      .ai-typing span:nth-child(2) { animation-delay: 0.15s; }
      .ai-typing span:nth-child(3) { animation-delay: 0.3s; }
      @keyframes aiBounce {
        0%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-6px); }
      }

      .ai-quick-prompts {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 0 12px 10px;
      }
      .ai-quick-btn {
        background: var(--ai-pink-dim);
        border: 1px solid var(--ai-border);
        color: var(--ai-pink);
        border-radius: 20px;
        padding: 5px 10px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .ai-quick-btn:hover {
        background: rgba(232,168,216,0.25);
        border-color: var(--ai-pink);
      }

      .ai-input-area {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px 12px;
        border-top: 1px solid var(--ai-border);
      }
      .ai-input {
        flex: 1;
        background: rgba(255,255,255,0.04);
        border: 1px solid var(--ai-border);
        border-radius: 12px;
        padding: 9px 12px;
        color: var(--ai-text);
        font-size: 13.5px;
        outline: none;
        resize: none;
        max-height: 90px;
        min-height: 20px;
        font-family: inherit;
      }
      .ai-input:focus { border-color: var(--ai-pink); }
      .ai-input::placeholder { color: var(--ai-text-muted); }
      .ai-send {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        background: linear-gradient(135deg, #e8a8d8, #b088d0);
        border: none;
        color: #0a0a0f;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        flex-shrink: 0;
      }
      .ai-send svg {
        width: 20px;
        height: 20px;
        stroke: #0a0a0f;
        fill: none;
      }
      .ai-send:hover:not(:disabled) { 
        transform: translateY(-2px) scale(1.05);
        box-shadow: 0 4px 12px rgba(232,168,216,0.3);
      }
      .ai-send:active { transform: translateY(0) scale(0.95); }
      .ai-send:disabled { opacity: 0.4; cursor: not-allowed; }

      @media (max-width: 480px) {
        #ludo-ai-window {
          right: 12px;
          bottom: 80px;
          width: calc(100vw - 24px);
          height: calc(100vh - 100px);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function createWidget() {
    // Toggle button
    toggleBtn = document.createElement('button');
    toggleBtn.id = 'ludo-ai-toggle';
    toggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>';
    toggleBtn.title = 'AI-помощник AKTIV';
    toggleBtn.addEventListener('click', toggleChat);
    document.body.appendChild(toggleBtn);

    // Chat window
    chatWindow = document.createElement('div');
    chatWindow.id = 'ludo-ai-window';
    chatWindow.innerHTML = `
      <div class="ai-header">
        <div class="ai-header-title"><span></span>AKTIV AI</div>
        <div class="ai-header-actions">
          <button class="ai-header-btn" id="ai-clear" title="Очистить чат">Очистить</button>
          <button class="ai-header-btn" id="ai-close" title="Закрыть">✕</button>
        </div>
      </div>
      <div class="ai-messages" id="ai-messages"></div>
      <div class="ai-quick-prompts" id="ai-quick-prompts"></div>
      <div class="ai-input-area">
        <textarea class="ai-input" id="ai-input" rows="1" placeholder="Спроси AI-помощника..."></textarea>
        <button class="ai-send" id="ai-send">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </div>
    `;
    document.body.appendChild(chatWindow);

    messagesContainer = chatWindow.querySelector('#ai-messages');
    inputField = chatWindow.querySelector('#ai-input');
    sendBtn = chatWindow.querySelector('#ai-send');
    quickPrompts = chatWindow.querySelector('#ai-quick-prompts');

    chatWindow.querySelector('#ai-close').addEventListener('click', toggleChat);
    chatWindow.querySelector('#ai-clear').addEventListener('click', clearHistory);
    sendBtn.addEventListener('click', handleSend);
    inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    // Quick prompts
    const prompts = [
      'Как набрать XP?',
      'Что такое streak?',
      'Помоги с квестом'
    ];
    prompts.forEach(text => {
      const btn = document.createElement('button');
      btn.className = 'ai-quick-btn';
      btn.textContent = text;
      btn.addEventListener('click', () => {
        inputField.value = text;
        handleSend();
      });
      quickPrompts.appendChild(btn);
    });
  }

  function toggleChat() {
    isOpen = !isOpen;
    chatWindow.classList.toggle('open', isOpen);
    if (isOpen) {
      inputField.focus();
      scrollToBottom();
    }
  }

  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function addMessage(role, content) {
    const div = document.createElement('div');
    div.className = `ai-bubble ${role}`;
    div.textContent = content;
    messagesContainer.appendChild(div);
    scrollToBottom();
    return div;
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'ai-typing';
    div.id = 'ai-typing-indicator';
    div.innerHTML = '<span></span><span></span><span></span>';
    messagesContainer.appendChild(div);
    scrollToBottom();
  }

  function hideTyping() {
    const el = document.getElementById('ai-typing-indicator');
    if (el) el.remove();
  }

  async function handleSend() {
    if (isLoading) return;
    const text = inputField.value.trim();
    if (!text) return;

    const token = getToken();
    if (!token) {
      addMessage('system', 'Войдите в аккаунт, чтобы использовать AI-помощника.');
      return;
    }

    addMessage('user', text);
    inputField.value = '';
    saveMessage('user', text);

    isLoading = true;
    sendBtn.disabled = true;
    showTyping();

    try {
      const history = getHistory().slice(-MAX_HISTORY);
      const messages = history.map(m => ({ role: m.role, content: m.content }));

      const fetchFn = window.authFetch || customFetch;
      const res = await fetchFn(API_URL, {
        method: 'POST',
        body: { messages }
      });

      hideTyping();

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        addMessage('system', data.error || 'Ошибка соединения с AI. Попробуйте позже.');
        return;
      }

      const data = await res.json();
      if (data.reply) {
        addMessage('assistant', data.reply);
        saveMessage('assistant', data.reply);
      } else {
        addMessage('system', 'AI не вернул ответ. Попробуйте ещё раз.');
      }
    } catch (err) {
      hideTyping();
      console.error('AI chat error:', err);
      addMessage('system', 'Ошибка сети. Проверьте подключение и попробуйте снова.');
    } finally {
      isLoading = false;
      sendBtn.disabled = false;
      inputField.focus();
    }
  }

  function customFetch(url, options = {}) {
    const token = getToken();
    if (!options.headers) options.headers = {};
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      options.body = JSON.stringify(options.body);
      options.headers['Content-Type'] = 'application/json';
    }
    return fetch(url, options);
  }

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveMessage(role, content) {
    const history = getHistory();
    history.push({ role, content, time: Date.now() });
    if (history.length > MAX_HISTORY) history.shift();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }

  function loadHistory() {
    const history = getHistory();
    if (history.length === 0) {
      addMessage('assistant', 'Привет! Я AI-помощник AKTIV. Задавай вопросы о квестах, XP, продуктивности или просто поболтаем о саморазвитии! 💪');
      return;
    }
    history.forEach(m => addMessage(m.role, m.content));
  }

  function clearHistory() {
    localStorage.removeItem(STORAGE_KEY);
    messagesContainer.innerHTML = '';
    addMessage('assistant', 'Чат очищен. Чем могу помочь? ✨');
  }

  function init() {
    // Показываем виджет только если есть токен (пользователь авторизован)
    if (!getToken()) return;
    injectStyles();
    createWidget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
