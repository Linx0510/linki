(function () {
  'use strict';

  const STORAGE_KEY = 'ludo_ai_chat_history';
  const MAX_HISTORY = 50;
  const API_URL = '/api/ai/chat';
  const HIDDEN_PAGES = ['/', '/index.html', '/auth.html'];

  let chatWindow, messagesContainer, inputField, sendBtn, toggleBtn, quickPrompts;
  let isOpen = false;
  let isLoading = false;

  function getToken() {
    return localStorage.getItem('ludo_token');
  }

  function shouldHideAssistant() {
    const path = (window.location.pathname || '/').toLowerCase();
    return HIDDEN_PAGES.includes(path);
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
        border: 1px solid rgba(255,255,255,0.12);
        cursor: pointer;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 8px 24px rgba(232,168,216,0.35);
        transition: transform 0.24s ease, box-shadow 0.24s ease, filter 0.24s ease;
        backdrop-filter: blur(12px);
      }
      #ludo-ai-toggle svg {
        width: 24px;
        height: 24px;
        display: block;
      }
      #ludo-ai-toggle:hover {
        transform: translateY(-2px) scale(1.03);
        box-shadow: 0 12px 32px rgba(232,168,216,0.45);
        filter: saturate(1.05);
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
    toggleBtn.setAttribute('aria-label', 'Помощник AKTIV');
    toggleBtn.innerHTML = '<svg viewBox="0 0 445 416" fill="none" aria-hidden="true"><path d="M 77 375 L 79 377 L 79 378 L 81 380 L 82 380 L 83 381 L 85 381 L 86 382 L 243 382 L 244 381 L 250 381 L 251 380 L 254 380 L 255 379 L 256 379 L 257 378 L 259 378 L 260 377 L 261 377 L 262 376 L 263 376 L 264 375 L 265 375 L 267 373 L 268 373 L 270 371 L 271 371 L 279 363 L 280 363 L 282 361 L 282 360 L 288 354 L 289 354 L 298 345 L 298 344 L 299 343 L 300 343 L 323 320 L 323 319 L 325 317 L 325 315 L 326 314 L 325 313 L 325 309 L 324 308 L 324 307 L 322 305 L 321 305 L 320 304 L 150 304 L 149 305 L 146 305 L 145 306 L 142 306 L 141 307 L 139 307 L 138 308 L 137 308 L 136 309 L 135 309 L 134 310 L 133 310 L 131 312 L 130 312 L 103 339 L 102 339 L 99 342 L 99 343 L 90 352 L 89 352 L 86 355 L 86 356 L 84 358 L 83 358 L 81 360 L 81 361 L 78 364 L 78 366 L 77 367 Z" fill="currentColor"/><path d="M 113 108 L 106 108 L 105 109 L 104 109 L 59 154 L 59 155 L 56 158 L 56 159 L 55 160 L 55 161 L 54 162 L 54 163 L 53 164 L 53 165 L 52 166 L 52 167 L 51 168 L 51 170 L 50 171 L 50 172 L 49 173 L 49 176 L 48 177 L 48 181 L 47 182 L 47 193 L 46 194 L 46 335 L 47 336 L 47 341 L 48 342 L 48 343 L 53 348 L 61 348 L 63 346 L 64 346 L 105 305 L 105 304 L 108 301 L 108 300 L 109 299 L 109 298 L 110 297 L 110 296 L 111 295 L 111 294 L 112 293 L 112 292 L 113 291 L 113 290 L 114 289 L 114 287 L 115 286 L 115 283 L 116 282 L 116 277 L 117 276 L 117 113 L 116 112 L 116 111 Z" fill="currentColor"/><path d="M 107 17 L 104 20 L 103 20 L 57 66 L 56 66 L 52 70 L 52 71 L 49 74 L 49 76 L 48 77 L 48 79 L 49 80 L 49 82 L 53 86 L 315 86 L 316 87 L 321 87 L 322 88 L 324 88 L 325 89 L 326 89 L 327 90 L 328 90 L 330 92 L 331 92 L 340 101 L 340 102 L 341 103 L 341 104 L 342 105 L 342 106 L 343 107 L 343 108 L 344 109 L 344 112 L 345 113 L 345 375 L 346 376 L 346 377 L 347 378 L 347 379 L 348 380 L 349 380 L 350 381 L 352 381 L 353 382 L 354 382 L 355 381 L 357 381 L 358 380 L 359 380 L 398 341 L 399 341 L 403 337 L 403 336 L 409 330 L 409 329 L 411 327 L 411 326 L 412 325 L 412 324 L 414 322 L 414 321 L 415 320 L 415 318 L 416 317 L 416 316 L 417 315 L 417 313 L 418 312 L 418 310 L 419 309 L 419 305 L 420 304 L 420 293 L 421 292 L 421 200 L 420 199 L 420 198 L 421 197 L 421 177 L 420 176 L 421 175 L 421 144 L 420 143 L 420 136 L 421 135 L 421 120 L 420 119 L 420 80 L 421 79 L 421 74 L 420 73 L 420 63 L 419 62 L 419 57 L 418 56 L 418 53 L 417 52 L 417 50 L 416 49 L 416 48 L 415 47 L 415 45 L 414 44 L 414 43 L 413 42 L 413 41 L 412 40 L 412 39 L 410 37 L 410 36 L 409 35 L 409 34 L 403 28 L 403 27 L 399 23 L 398 23 L 395 20 L 394 20 L 392 18 L 391 18 L 389 16 L 388 16 L 387 15 L 386 15 L 385 14 L 384 14 L 383 13 L 381 13 L 380 12 L 378 12 L 377 11 L 375 11 L 374 10 L 371 10 L 370 9 L 363 9 L 362 8 L 134 8 L 133 9 L 126 9 L 125 10 L 122 10 L 121 11 L 119 11 L 118 12 L 117 12 L 116 13 L 114 13 L 113 14 L 112 14 L 111 15 L 110 15 L 108 17 Z" fill="currentColor"/></svg>';
    toggleBtn.title = 'Помощник AKTIV';
    toggleBtn.addEventListener('click', toggleChat);
    document.body.appendChild(toggleBtn);

    // Chat window
    chatWindow = document.createElement('div');
    chatWindow.id = 'ludo-ai-window';
      chatWindow.innerHTML = `
      <div class="ai-header">
        <div class="ai-header-title"><span></span>Помощник AKTIV</div>
        <div class="ai-header-actions">
          <button class="ai-header-btn" id="ai-clear" title="Очистить чат">Очистить</button>
          <button class="ai-header-btn" id="ai-close" title="Закрыть">✕</button>
        </div>
      </div>
      <div class="ai-messages" id="ai-messages"></div>
      <div class="ai-quick-prompts" id="ai-quick-prompts"></div>
      <div class="ai-input-area">
        <textarea class="ai-input" id="ai-input" rows="1" placeholder="Напишите помощнику..."></textarea>
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
      addMessage('system', 'Войдите в аккаунт, чтобы использовать помощника AKTIV.');
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
        addMessage('system', data.error || 'Помощник сейчас недоступен. Попробуйте позже.');
        return;
      }

      const data = await res.json();
      if (data.reply) {
        addMessage('assistant', data.reply);
        saveMessage('assistant', data.reply);
      } else {
        addMessage('system', 'Помощник не вернул ответ. Попробуйте ещё раз.');
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
      addMessage('assistant', 'Привет! Я помощник AKTIV. Помогу с квестами, XP, прогрессом и любыми вопросами по платформе.');
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
    if (shouldHideAssistant()) return;
    injectStyles();
    createWidget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
