// Глобальная функция для защищенных запросов
window.authFetch = async (url, options = {}) => {
  const token = localStorage.getItem('ludo_token');
  if (!options.headers) options.headers = {};
  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    options.body = JSON.stringify(options.body);
    options.headers['Content-Type'] = 'application/json';
  }
  
  const response = await fetch(url, options);
  if (response.status === 401 || response.status === 403) {
    // console.warn('Auth error, redirecting...');
    // window.logout();
  }
  return response;
};

document.addEventListener('DOMContentLoaded', () => {
  const userData = JSON.parse(localStorage.getItem('ludo_user'));
  const token = localStorage.getItem('ludo_token');

  if (!userData && !window.location.pathname.includes('index.html') && !window.location.pathname.includes('auth.html')) {
    return;
  }

  if (userData) {
    updateUserUI(userData);
  }
});

function updateUserUI(user) {
  // 1. Имя пользователя
  const nameEls = document.querySelectorAll('.s-user-name, .user-name, #topbarUserName');
  nameEls.forEach(el => el.textContent = user.username);

  // 2. Уровень и XP
  const xpEls = document.querySelectorAll('.s-user-xp, .user-xp');
  xpEls.forEach(el => el.textContent = (user.xp || 0).toLocaleString() + ' XP');

  const subEls = document.querySelectorAll('.s-user-sub, .user-role');
  subEls.forEach(el => {
    if (el.classList.contains('s-user-sub')) {
        el.textContent = user.role === 'admin' ? 'Администратор' : `Ур. ${user.level || 1}`;
    } else {
        el.textContent = user.role === 'expert' ? 'Эксперт' : 'Игрок';
    }
  });

  // 3. Аватар
  const avatarEls = document.querySelectorAll('.s-avatar, .user-avatar');
  avatarEls.forEach(el => {
    if (user.avatar_url) {
      el.style.backgroundImage = `url(${user.avatar_url})`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.textContent = ''; 
    } else {
      el.style.backgroundImage = 'none';
      el.textContent = user.username ? user.username.slice(0, 2).toUpperCase() : 'Я';
    }
  });

  // 4. Скрытие/показ элементов по роли
  if (user.role !== 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }
  if (user.role !== 'expert') {
    document.querySelectorAll('.expert-only').forEach(el => el.style.display = 'none');
  }
}

window.logout = function() {
  localStorage.removeItem('ludo_token');
  localStorage.removeItem('ludo_user');
  localStorage.removeItem('ludo_ai_chat_history');
  localStorage.removeItem('АКТИВ_joined_quests');
  location.href = 'index.html';
};

// ─── Mobile sidebar toggle (shared, used by all pages) ───────────────────────
window.initMobileMenu = function() {
  const burger  = document.getElementById('burgerBtn');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!burger || !sidebar || !overlay) return;

  function openSidebar()  { sidebar.classList.add('open');    overlay.classList.add('active'); }
  function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('active'); }
  function toggleSidebar(){ sidebar.classList.contains('open') ? closeSidebar() : openSidebar(); }

  burger.addEventListener('click', toggleSidebar);
  overlay.addEventListener('click', closeSidebar);

  // Close on Escape key
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSidebar(); });
};

// Auto-init on every page that has the required elements
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('burgerBtn')) {
    window.initMobileMenu();
  }
});

// ─── Global toast helper (fallback if page doesn't define its own) ─────────────
if (!window.showToast) {
  window.showToast = function(msg, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3200);
  };
}

// Load AI chat widget for authenticated users
(function() {
  if (!localStorage.getItem('ludo_token')) return;
  const s = document.createElement('script');
  s.src = 'ai-chat.js';
  s.async = true;
  document.head.appendChild(s);
})();
