const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const TEXTAREA_MAX_LENGTH = 2000;
const db = require('../config/database');
const { requireAuth, csrfProtect } = require('../middleware/authMiddleware');
const chatController = require('../controllers/chatController');
const orderController = require('../controllers/orderController');
const serviceController = require('../controllers/serviceController');
const dealController = require('../controllers/dealController');
const paymentController = require('../controllers/paymentController');
const withdrawalController = require('../controllers/withdrawalController');
const aiAssistantController = require('../controllers/aiAssistantController');
const { ensureReviewModerationColumns } = require('../utils/reviewModeration');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './public/uploads/avatars';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Поддерживаются только JPG, PNG, GIF и WEBP изображения'));
    }

    return cb(null, true);
  },
});

const chatFilesDir = path.join(__dirname, '..', 'public', 'uploads', 'chat-files');
if (!fs.existsSync(chatFilesDir)) {
  fs.mkdirSync(chatFilesDir, { recursive: true });
}

const chatFileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, chatFilesDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `chat-${unique}${path.extname(file.originalname || '')}`);
  },
});

const chatFileUpload = multer({
  storage: chatFileStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

const orderFilesDir = path.join(__dirname, '..', 'public', 'uploads', 'order-files');
if (!fs.existsSync(orderFilesDir)) {
  fs.mkdirSync(orderFilesDir, { recursive: true });
}

const orderFileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, orderFilesDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `order-${unique}${path.extname(file.originalname || '')}`);
  },
});

const orderFileUpload = multer({
  storage: orderFileStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
});


router.post('/api/subscribe', requireAuth, async (req, res) => {
  const { userId, action } = req.body;
  const currentUserId = req.session.user.id;

  if (currentUserId === parseInt(userId, 10)) {
    return res.status(400).json({ error: 'Нельзя подписаться на самого себя' });
  }

  try {
    if (action === 'subscribe') {
      await db.query(
        `
        INSERT INTO subscriptions (follower_id, followed_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `,
        [currentUserId, userId]
      );
    } else {
      await db.query(
        `
        DELETE FROM subscriptions
        WHERE follower_id = $1 AND followed_id = $2
      `,
        [currentUserId, userId]
      );
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Subscription error:', error);
    return res.status(500).json({ error: 'Ошибка при изменении подписки' });
  }
});

router.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const notifications = await db.query(
      `
      SELECT * FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `,
      [req.session.user.id]
    );

    return res.json(notifications.rows);
  } catch (error) {
    console.error('Notifications error:', error);
    return res.status(500).json({ error: 'Ошибка загрузки уведомлений' });
  }
});

router.post('/api/notifications/read', requireAuth, async (req, res) => {
  try {
    await db.query(
      `
      UPDATE notifications
      SET is_read = TRUE
      WHERE user_id = $1 AND is_read = FALSE
    `,
      [req.session.user.id]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    return res.status(500).json({ error: 'Ошибка при обновлении уведомлений' });
  }
});

router.post('/api/notifications/:notificationId/read', requireAuth, csrfProtect, async (req, res) => {
  const notificationId = Number.parseInt(req.params.notificationId, 10);

  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    return res.status(400).json({ error: 'Некорректное уведомление' });
  }

  try {
    const result = await db.query(
      `
      UPDATE notifications
      SET is_read = TRUE
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `,
      [notificationId, req.session.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Уведомление не найдено' });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Mark notification read error:', error);
    return res.status(500).json({ error: 'Ошибка при обновлении уведомления' });
  }
});

router.delete('/api/notifications', requireAuth, csrfProtect, async (req, res) => {
  try {
    await db.query(
      `
      DELETE FROM notifications
      WHERE user_id = $1
    `,
      [req.session.user.id]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Delete notifications error:', error);
    return res.status(500).json({ error: 'Ошибка при удалении уведомлений' });
  }
});

router.post('/api/works/:workId/like', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const workId = Number(req.params.workId);

  if (!Number.isInteger(workId) || workId <= 0) {
    return res.status(400).json({ error: 'Некорректный идентификатор работы' });
  }

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS work_likes (
        work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (work_id, user_id)
      )
    `);

    await db.query('BEGIN');

    const workResult = await db.query(
      'SELECT id FROM works WHERE id = $1 AND status = $2 FOR UPDATE',
      [workId, 'active']
    );

    if (!workResult.rows.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Работа не найдена' });
    }

    const existingLike = await db.query(
      'SELECT 1 FROM work_likes WHERE work_id = $1 AND user_id = $2',
      [workId, userId]
    );

    const isLiked = existingLike.rows.length > 0;
    let likesResult;

    if (isLiked) {
      await db.query('DELETE FROM work_likes WHERE work_id = $1 AND user_id = $2', [workId, userId]);
      likesResult = await db.query(
        'UPDATE works SET likes = GREATEST(COALESCE(likes, 0) - 1, 0) WHERE id = $1 RETURNING likes',
        [workId]
      );
    } else {
      await db.query(
        'INSERT INTO work_likes (work_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [workId, userId]
      );
      likesResult = await db.query(
        'UPDATE works SET likes = COALESCE(likes, 0) + 1 WHERE id = $1 RETURNING likes',
        [workId]
      );
    }

    await db.query('COMMIT');
    return res.json({
      success: true,
      liked: !isLiked,
      likes: likesResult.rows[0]?.likes || 0,
    });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Like toggle error:', error);
    return res.status(500).json({ error: 'Не удалось обновить лайк' });
  }
});


router.get('/api/collections', requireAuth, async (req, res) => {
  const userId = req.session.user.id;

  try {
    const collectionsResult = await db.query(
      `SELECT c.id,
              c.title,
              c.description,
              COALESCE(
                ARRAY_AGG(cw.work_id ORDER BY cw.sort_order) FILTER (WHERE cw.work_id IS NOT NULL),
                ARRAY[]::int[]
              ) AS work_ids,
              COALESCE(
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'id', w.id,
                    'title', w.title,
                    'image', COALESCE(first_image.image_url, '/img/work_img.svg')
                  )
                  ORDER BY cw.sort_order
                ) FILTER (WHERE w.id IS NOT NULL),
                '[]'::json
              ) AS work_previews
       FROM project_collections c
       LEFT JOIN collection_works cw ON cw.collection_id = c.id
       LEFT JOIN works w ON w.id = cw.work_id AND w.user_id = c.user_id
       LEFT JOIN LATERAL (
         SELECT wi.image_url
         FROM work_images wi
         WHERE wi.work_id = w.id
           AND wi.image_url IS NOT NULL
           AND BTRIM(wi.image_url) <> ''
         ORDER BY COALESCE(wi.sort_order, 0), wi.id
         LIMIT 1
       ) first_image ON true
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [userId]
    );

    return res.json({
      success: true,
      collections: collectionsResult.rows.map((collection) => ({
        id: collection.id,
        title: collection.title,
        description: collection.description,
        workIds: collection.work_ids || [],
        workPreviews: collection.work_previews || [],
      })),
    });
  } catch (error) {
    console.error('Fetch collections error:', error);
    return res.status(500).json({ error: 'Не удалось загрузить сборники' });
  }
});

router.post('/api/collections', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : null;
  const workIdsRaw = Array.isArray(req.body.workIds) ? req.body.workIds : [];
  const workIds = workIdsRaw
    .map((workId) => Number(workId))
    .filter((workId) => Number.isInteger(workId) && workId > 0);

  if (!title || workIds.length === 0) {
    return res.status(400).json({ error: 'Нужно указать название и выбрать хотя бы одну работу' });
  }

  try {
    await db.query('BEGIN');

    const ownedWorks = await db.query(
      `SELECT id
       FROM works
       WHERE user_id = $1
         AND id = ANY($2::int[])`,
      [userId, workIds]
    );

    if (ownedWorks.rows.length !== workIds.length) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: 'Можно добавлять только свои работы' });
    }

    const collectionResult = await db.query(
      `INSERT INTO project_collections (user_id, title, description)
       VALUES ($1, $2, $3)
       RETURNING id, title`,
      [userId, title, description || null]
    );

    const collectionId = collectionResult.rows[0].id;

    for (let i = 0; i < workIds.length; i += 1) {
      await db.query(
        `INSERT INTO collection_works (collection_id, work_id, sort_order)
         VALUES ($1, $2, $3)`,
        [collectionId, workIds[i], i]
      );
    }

    await db.query('COMMIT');
    return res.json({
      success: true,
      collection: {
        id: collectionId,
        title: collectionResult.rows[0].title,
        workIds,
      },
    });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Create collection error:', error);
    return res.status(500).json({ error: 'Не удалось создать сборник' });
  }
});

router.post('/api/profile/update', requireAuth, upload.single('avatar'), csrfProtect, async (req, res) => {
  const {
    first_name,
    last_name,
    email,
    bio,
    current_password,
    new_password,
    confirm_password,
    email_notifications,
    push_notifications,
  } = req.body;
  const userId = req.session.user.id;
  const emailNotifications = email_notifications === 'on';
  const pushNotifications = push_notifications === 'on';

  try {
    if (bio && String(bio).length > TEXTAREA_MAX_LENGTH) {
      return res.status(400).json({ error: `Поле "О себе" не должно превышать ${TEXTAREA_MAX_LENGTH} символов` });
    }

    if (email !== req.session.user.email) {
      const existing = await db.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, userId]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Email уже используется' });
      }
    }

    let updateQuery = `
      UPDATE users
      SET first_name = $1,
          last_name = $2,
          email = $3,
          bio = $4
    `;

    const params = [first_name, last_name, email, bio || null];
    let paramIndex = 5;

    const supportsNotificationColumns = await hasNotificationColumns();
    if (supportsNotificationColumns) {
      updateQuery += `,
          email_notifications = $${paramIndex},
          push_notifications = $${paramIndex + 1}
      `;
      params.push(emailNotifications, pushNotifications);
      paramIndex += 2;
    }

    if (req.file) {
      updateQuery += `, avatar = $${paramIndex}`;
      params.push(`/uploads/avatars/${req.file.filename}`);
      paramIndex += 1;
    }

    if (new_password) {
      if (new_password !== confirm_password) {
        return res.status(400).json({ error: 'Пароли не совпадают' });
      }

      const user = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
      const valid = await bcrypt.compare(current_password, user.rows[0].password_hash);
      if (!valid) {
        return res.status(400).json({ error: 'Неверный текущий пароль' });
      }

      const newHash = await bcrypt.hash(new_password, 10);
      updateQuery += `, password_hash = $${paramIndex}`;
      params.push(newHash);
      paramIndex += 1;
    }

    updateQuery += ` WHERE id = $${paramIndex} RETURNING *`;
    params.push(userId);

    const result = await db.query(updateQuery, params);
    const updated = result.rows[0];

    req.session.user = {
      id: updated.id,
      first_name: updated.first_name,
      last_name: updated.last_name,
      email: updated.email,
      avatar: updated.avatar,
      bio: updated.bio,
      email_notifications: updated.email_notifications ?? false,
      push_notifications: updated.push_notifications ?? false,
    };

    return res.json({ success: true });
  } catch (error) {
    console.error('Profile update error:', error);
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Размер файла не должен превышать 5MB' });
    }
    if (error && error.message && error.message.includes('Поддерживаются только')) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Ошибка при обновлении профиля' });
  }
});

const hasNotificationColumns = async () => {
  const result = await db.query(
    `SELECT COUNT(*)::int AS existing_columns
     FROM information_schema.columns
     WHERE table_name = 'users'
       AND column_name IN ('email_notifications', 'push_notifications')`
  );

  return result.rows[0]?.existing_columns === 2;
};


router.post('/api/ai-assistant/message', csrfProtect, aiAssistantController.sendAssistantMessage);

router.get('/api/chats', requireAuth, chatController.getUserChats);
router.get('/api/chats/search/users', requireAuth, chatController.searchUsers);
router.get('/api/chats/user/:userId', requireAuth, chatController.getOrCreateChat);
router.get('/api/chats/:chatId/messages', requireAuth, chatController.getChatMessages);
router.post('/api/chats/:chatId/messages', requireAuth, csrfProtect, chatController.sendMessage);
router.post('/api/chats/:chatId/files', requireAuth, chatFileUpload.array('files', 10), csrfProtect, chatController.sendFileMessage);
router.patch('/api/chats/:chatId/messages/:messageId', requireAuth, csrfProtect, chatController.editMessage);
router.delete('/api/chats/:chatId/messages/:messageId', requireAuth, csrfProtect, chatController.deleteMessageForAll);
router.post('/api/chats/:chatId/draft', requireAuth, csrfProtect, chatController.saveDraft);
router.get('/api/chats/:chatId/draft', requireAuth, chatController.getDraft);
router.post('/api/orders/create', requireAuth, orderFileUpload.array('attachment', 10), csrfProtect, orderController.createOrder);
router.get('/api/orders', requireAuth, orderController.getUserOrders);
router.post('/api/orders/:orderId/cancel', requireAuth, csrfProtect, orderController.cancelOrder);
router.post('/api/orders/:orderId/accept', requireAuth, csrfProtect, orderController.acceptOrder);
router.post('/api/orders/:orderId/deliver', requireAuth, csrfProtect, orderController.deliverOrder);
router.post('/api/orders/:orderId/complete', requireAuth, csrfProtect, orderController.completeOrder);
router.post('/api/orders/:orderId/review', requireAuth, csrfProtect, orderController.reviewOrder);
router.post('/api/orders/:orderId/stages/:stageId/toggle', requireAuth, csrfProtect, orderController.toggleStage);
router.post('/api/orders/:orderId/stages/propose', requireAuth, csrfProtect, orderController.proposeStageChanges);
router.post('/api/orders/:orderId/stage-changes/:requestId/respond', requireAuth, csrfProtect, orderController.respondStageChanges);

router.post('/api/payments/topup', requireAuth, csrfProtect, paymentController.createTopUp);
router.get('/api/payments/balance', requireAuth, paymentController.getBalance);
router.get('/api/payments/transactions', requireAuth, paymentController.getTransactions);

router.post('/api/withdrawals', requireAuth, csrfProtect, withdrawalController.createWithdrawal);
router.get('/api/withdrawals', requireAuth, withdrawalController.getMyWithdrawals);
router.get('/api/admin/withdrawals', requireAuth, withdrawalController.getAllWithdrawals);
router.post('/api/admin/withdrawals/:id/approve', requireAuth, csrfProtect, withdrawalController.approveWithdrawal);
router.post('/api/admin/withdrawals/:id/reject', requireAuth, csrfProtect, withdrawalController.rejectWithdrawal);
router.get('/api/services', requireAuth, serviceController.getUserServices);
router.post('/api/services/:id/status', requireAuth, csrfProtect, serviceController.updateServiceStatus);
router.get('/api/services/catalog', requireAuth, orderController.getServicesCatalog);

router.post('/api/deals', requireAuth, csrfProtect, dealController.createDeal);
router.get('/api/deals/:id', requireAuth, dealController.getDeal);
router.post('/api/deals/:id/accept', requireAuth, csrfProtect, dealController.acceptDeal);
router.post('/api/deals/:id/reject', requireAuth, csrfProtect, dealController.rejectDeal);
router.post('/api/deals/:id/cancel', requireAuth, csrfProtect, dealController.cancelDeal);

router.post('/api/services/:id/review', requireAuth, csrfProtect, async (req, res) => {
  const reviewerId = req.session.user.id;
  const serviceId = parseInt(req.params.id, 10);
  const rating = parseInt(req.body.rating, 10);
  const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';

  if (comment.length > TEXTAREA_MAX_LENGTH) {
    return res.status(400).json({ error: `Комментарий не должен превышать ${TEXTAREA_MAX_LENGTH} символов` });
  }

  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    return res.status(400).json({ error: 'Некорректный идентификатор услуги' });
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Оценка должна быть от 1 до 5' });
  }

  try {
    await ensureReviewModerationColumns();
    await db.query('BEGIN');

    const serviceExists = await db.query('SELECT 1 FROM services WHERE id = $1', [serviceId]);
    if (serviceExists.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Услуга не найдена' });
    }

    const existingReview = await db.query(
      'SELECT 1 FROM service_reviews WHERE reviewer_id = $1 AND service_id = $2',
      [reviewerId, serviceId]
    );

    if (existingReview.rows.length > 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: 'Вы уже оставили отзыв на эту услугу' });
    }

    await db.query(
      `INSERT INTO service_reviews (reviewer_id, service_id, rating, comment, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [reviewerId, serviceId, rating, comment || null]
    );

    await db.query('COMMIT');
    return res.json({ success: true });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Service review error:', error);
    if (process.env.NODE_ENV !== 'production') {
      return res.status(500).json({ error: `Ошибка при создании отзыва: ${error.message}` });
    }
    return res.status(500).json({ error: 'Ошибка при создании отзыва' });
  }
});

router.post('/api/users/:id/review', requireAuth, csrfProtect, async (req, res) => {
  const reviewerId = req.session.user.id;
  const reviewedUserId = parseInt(req.params.id, 10);
  const rating = parseInt(req.body.rating, 10);
  const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';

  if (comment.length > TEXTAREA_MAX_LENGTH) {
    return res.status(400).json({ error: `Комментарий не должен превышать ${TEXTAREA_MAX_LENGTH} символов` });
  }

  if (!Number.isInteger(reviewedUserId) || reviewedUserId <= 0) {
    return res.status(400).json({ error: 'Некорректный идентификатор пользователя' });
  }

  if (reviewedUserId === reviewerId) {
    return res.status(400).json({ error: 'Нельзя оставить отзыв самому себе' });
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Оценка должна быть от 1 до 5' });
  }

  try {
    await ensureReviewModerationColumns();
    await db.query('BEGIN');

    const userExists = await db.query('SELECT 1 FROM users WHERE id = $1', [reviewedUserId]);
    if (userExists.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const existingReview = await db.query(
      'SELECT 1 FROM user_reviews WHERE reviewer_id = $1 AND reviewed_user_id = $2',
      [reviewerId, reviewedUserId]
    );

    if (existingReview.rows.length > 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: 'Вы уже оставили отзыв этому пользователю' });
    }

    await db.query(
      `INSERT INTO user_reviews (reviewer_id, reviewed_user_id, rating, comment, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [reviewerId, reviewedUserId, rating, comment || null]
    );

    await db.query('COMMIT');
    return res.json({ success: true });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('User review error:', error);
    if (process.env.NODE_ENV !== 'production') {
      return res.status(500).json({ error: `Ошибка при создании отзыва: ${error.message}` });
    }
    return res.status(500).json({ error: 'Ошибка при создании отзыва' });
  }
});

module.exports = router;
