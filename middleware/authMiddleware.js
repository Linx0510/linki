const crypto = require('crypto');
const db = require('../config/database');


const attachCurrentUser = async (req, res, next) => {
  const sessionUser = req.session.user || null;
  res.locals.currentPath = req.path;

  if (!sessionUser) {
    res.locals.currentUser = null;
    res.locals.headerCurrentUser = null;
    return next();
  }

  try {
    const [accountResult, unreadNotificationsResult, unreadMessagesResult, notificationsResult, userResult] = await Promise.all([
      db.query(
        `SELECT COALESCE(balance, 0) AS total_balance
         FROM user_balances
         WHERE user_id = $1`,
        [sessionUser.id]
      ).catch(() => ({ rows: [{ total_balance: 0 }] })),
      db.query(
        `SELECT COUNT(*)::int AS unread_count
         FROM notifications
         WHERE user_id = $1 AND is_read = FALSE`,
        [sessionUser.id]
      ),
      db.query(
        `SELECT COUNT(*)::int AS unread_count
         FROM messages m
         INNER JOIN chats c ON c.id = m.chat_id
         WHERE m.sender_id != $1
           AND m.is_read = FALSE
           AND (c.user1_id = $1 OR c.user2_id = $1)`,
        [sessionUser.id]
      ),
      db.query(
        `SELECT id, message, is_read, link, created_at
         FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [sessionUser.id]
      ),
      getUserMeta(sessionUser.id),
    ]);

    const totalBalance = accountResult.rows[0]?.total_balance ?? 0;
    const unreadNotificationsCount = unreadNotificationsResult.rows[0]?.unread_count ?? 0;
    const unreadMessagesCount = unreadMessagesResult.rows[0]?.unread_count ?? 0;
    const notifications = notificationsResult.rows || [];
    const user = userResult.rows[0] || {};

    const enrichedCurrentUser = {
      ...sessionUser,
      ...user,
      total_balance: totalBalance,
      unread_notifications_count: unreadNotificationsCount,
      unread_messages_count: unreadMessagesCount,
      unread_notifications: notifications.filter((notification) => !notification.is_read),
      read_notifications: notifications.filter((notification) => notification.is_read),
    };

    res.locals.currentUser = enrichedCurrentUser;
    res.locals.headerCurrentUser = enrichedCurrentUser;
  } catch (error) {
    console.error('Error attaching current user meta:', error);
    const fallbackCurrentUser = {
      ...sessionUser,
      total_balance: 0,
      unread_notifications_count: 0,
      unread_messages_count: 0,
      unread_notifications: [],
      read_notifications: [],
      is_admin: false,
    };

    res.locals.currentUser = fallbackCurrentUser;
    res.locals.headerCurrentUser = fallbackCurrentUser;
  }

  next();
};

const getUserMeta = async (userId) => {
  try {
    return await db.query(
      `SELECT u.first_name,
              u.last_name,
              u.email,
              u.avatar,
              u.bio,
              u.role_id,
              r.name AS role_name,
              u.email_notifications,
              u.push_notifications,
              (LOWER(COALESCE(r.name, '')) = 'admin') AS is_admin
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [userId]
    );
  } catch (error) {
    if (error.code !== '42703') {
      throw error;
    }

    const fallbackResult = await db.query(
      `SELECT first_name, last_name, email, avatar, bio, role_id
       FROM users
       WHERE id = $1`,
      [userId]
    );

    fallbackResult.rows = fallbackResult.rows.map((row) => ({
      ...row,
      role_name: null,
      email_notifications: false,
      push_notifications: false,
      is_admin: false,
    }));

    return fallbackResult;
  }
};


const ensureCsrfToken = (req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
};


const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/auth?error=Требуется авторизация');
  }
  next();
};


const csrfProtect = (req, res, next) => {
  const protectedMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (protectedMethods.includes(req.method)) {
    const bodyToken = req.body && typeof req.body === 'object' ? req.body.csrf_token : null;
    const headerToken = req.headers ? req.headers['x-csrf-token'] : null;
    const token = bodyToken || headerToken;
    const sessionToken = req.session ? req.session.csrfToken : null;

    if (!token || !sessionToken || token !== sessionToken) {
      return res.status(403).send('CSRF token validation failed');
    }
  }
  next();
};

module.exports = {
  attachCurrentUser,
  ensureCsrfToken,
  requireAuth,
  csrfProtect,
};
