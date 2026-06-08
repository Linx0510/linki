/**
 * expert-sidebar.js — единый компонент навигации для всех экспертных страниц.
 * Достаточно подключить этот файл + добавить <nav id="expertSidebarNav"></nav>
 * в нужное место inside <aside class="sidebar">.
 * Активный пункт определяется автоматически по window.location.pathname.
 */
(function () {
  var NAV_ITEMS = [
    {
      href: 'expert-profile-edit.html',
      label: 'Профиль',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>'
    },
    {
      href: 'expert-quests.html',
      label: 'Мои квесты',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22a8 8 0 0 1-8-8c0-5 8-12 8-12s8 7 8 12a8 8 0 0 1-8 8Z"/></svg>'
    },
    {
      href: 'expert-clients.html',
      label: 'Клиенты',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
    },
    {
      href: 'expert-reviews.html',
      label: 'Отзывы',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
    },
    {
      href: 'expert-finances.html',
      label: 'Финансы',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>'
    },
    {
      href: 'expert-chat.html',
      label: 'Чат',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
    }
  ];

  function getCurrentPage() {
    return window.location.pathname.split('/').pop() || '';
  }

  function buildNav() {
    var current = getCurrentPage();
    return NAV_ITEMS.map(function (item) {
      var isActive = current === item.href;
      return '<a href="' + item.href + '" class="nav-item' + (isActive ? ' active' : '') + '">'
        + item.svg + item.label + '</a>';
    }).join('');
  }

  function applyUserInfo() {
    var user = null;
    try { user = JSON.parse(localStorage.getItem('ludo_user')); } catch (e) {}
    if (!user) return;

    var sidebarUser = document.querySelector('.sidebar-user');
    if (sidebarUser) {
      // Убираем принудительное скрытие, поставленное хардкодом
      sidebarUser.style.removeProperty('display');
      sidebarUser.removeAttribute('style');
    }

    var nameEl = document.querySelector('.s-user-name');
    if (nameEl) nameEl.textContent = user.username || 'Эксперт';

    var subEl = document.querySelector('.s-user-sub');
    if (subEl) subEl.textContent = 'Эксперт · Ур. ' + (user.level || 1);

    var xpEl = document.querySelector('.s-user-xp');
    if (xpEl) xpEl.textContent = (user.xp || 0).toLocaleString('ru') + ' XP';

    var avaEl = document.querySelector('.s-avatar');
    if (avaEl) {
      if (user.avatar_url) {
        avaEl.style.backgroundImage = 'url(' + user.avatar_url + ')';
        avaEl.style.backgroundSize = 'cover';
        avaEl.textContent = '';
      } else {
        avaEl.textContent = (user.username || 'ЭК').slice(0, 2).toUpperCase();
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var container = document.getElementById('expertSidebarNav');
    if (!container) return;
    container.innerHTML = buildNav();
    applyUserInfo();
  });
})();
