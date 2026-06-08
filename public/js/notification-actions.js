(() => {
  if (window.__linitiNotificationActionsInitialized) {
    return;
  }

  window.__linitiNotificationActionsInitialized = true;

  const markNotificationAsRead = async (notificationId, csrfToken) => {
    const headers = { 'Content-Type': 'application/json' };

    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    await fetch(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
  };

  document.addEventListener('click', async (event) => {
    const link = event.target.closest('.js-notification-link');

    if (!link || link.dataset.notificationRead === 'true') {
      return;
    }

    const notificationId = link.dataset.notificationId;
    const targetHref = link.getAttribute('href') || '#';

    if (!notificationId) {
      return;
    }

    event.preventDefault();

    try {
      await markNotificationAsRead(notificationId, link.dataset.csrfToken || '');
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    } finally {
      if (targetHref === '#') {
        window.location.reload();
        return;
      }

      window.location.href = targetHref;
    }
  });
})();
