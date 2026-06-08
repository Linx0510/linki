// Central modal helpers. Safe: only define if not already present.
(function () {
  function hideElement(el) { if (!el) return; el.style.display = 'none'; el.classList.remove('is-visible'); }
  function showElement(el, display = 'flex') { if (!el) return; el.style.display = display; el.classList.add('is-visible'); }

  if (typeof window.closeConfirm === 'undefined') {
    window.closeConfirm = function () {
      const m = document.getElementById('confirmModal');
      hideElement(m);
    };
  }

  if (typeof window.closeAdminNotification === 'undefined') {
    window.closeAdminNotification = function () {
      const m = document.getElementById('adminNotificationModal');
      hideElement(m);
    };
  }

  window.openAdminNotification = function (options = {}) {
    const modal = document.getElementById('adminNotificationModal');
    if (!modal) return;
    const titleEl = modal.querySelector('#notificationTitle');
    const msgEl = modal.querySelector('#notificationMessage');
    const iconEl = modal.querySelector('#notificationIcon');
    titleEl && (titleEl.textContent = options.title || 'Уведомление');
    msgEl && (msgEl.textContent = options.message || '');
    if (iconEl) {
      iconEl.className = 'notification-icon ' + (options.type || 'success');
    }
    showElement(modal, 'flex');
  };

  // Close on ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // close known modals
      closeConfirm && closeConfirm();
      closeAdminNotification && closeAdminNotification();
      // cookie modal uses class toggle
      const cookie = document.getElementById('cookieModal');
      if (cookie && cookie.classList.contains('is-visible')) cookie.classList.remove('is-visible');
      // chat modals
      document.querySelectorAll('.chat-modal.is-visible, .chat-modal[aria-hidden="false"]').forEach(m => {
        m.classList.remove('is-visible'); m.setAttribute('aria-hidden', 'true');
      });
    }
  });

  // Delegated close for chat modals overlays and close buttons
  document.addEventListener('click', (e) => {
    if (e.target.matches('[data-close-chat-modal]') || e.target.closest('[data-close-chat-modal]')) {
      const modal = e.target.closest('.chat-modal');
      if (modal) {
        modal.classList.remove('is-visible');
        modal.setAttribute('aria-hidden', 'true');
      }
    }
  });

  // Provide helper to open/close arbitrary modal by id
  window.openModalById = function (id) {
    const m = document.getElementById(id);
    if (!m) return;
    if (m.classList.contains('is-visible') || m.style.display === 'flex') return;
    // prefer flex display for centered modals
    showElement(m, 'flex');
    if (m.hasAttribute('aria-hidden')) m.setAttribute('aria-hidden', 'false');
  };
  window.closeModalById = function (id) {
    const m = document.getElementById(id);
    if (!m) return;
    hideElement(m);
    if (m.hasAttribute('aria-hidden')) m.setAttribute('aria-hidden', 'true');
  };

  // Header hamburger toggle
  document.addEventListener('click', (e) => {
    const hb = document.getElementById('headerHamburger');
    const menu = document.getElementById('headerHamburgerMenu');
    if (!hb || !menu) return;
    if (e.target === hb || hb.contains(e.target)) {
      const expanded = hb.getAttribute('aria-expanded') === 'true';
      hb.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      menu.setAttribute('aria-hidden', expanded ? 'true' : 'false');
      return;
    }
    // click outside should close
    if (!menu.contains(e.target) && !hb.contains(e.target)) {
      hb.setAttribute('aria-expanded', 'false');
      hb.classList.remove('is-open');
      menu.setAttribute('aria-hidden', 'true');
    }
  });
})();
