const db = require('../config/database');

const TEXTAREA_MAX_LENGTH = 2000;

let attachmentsSchemaChecked = false;
const safeDecodeURIComponent = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
};

const ensureChatAttachmentsSchema = async () => {
  if (attachmentsSchemaChecked) {
    return;
  }

  await db.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_url TEXT');
  await db.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_name TEXT');
  await db.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_mime TEXT');
  await db.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_size BIGINT');

  attachmentsSchemaChecked = true;
};

const getChatForUser = async (chatId, userId) => db.query(
  `SELECT * FROM chats WHERE id = $1
   AND (user1_id = $2 OR user2_id = $2)`,
  [chatId, userId]
);

const createChatMessage = async ({
  chatId,
  userId,
  message,
  fileUrl = null,
  fileName = null,
  fileMime = null,
  fileSize = null,
}) => {
  await ensureChatAttachmentsSchema();

  return db.query(
    `INSERT INTO messages (chat_id, sender_id, message, file_url, file_name, file_mime, file_size)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [chatId, userId, message, fileUrl, fileName, fileMime, fileSize]
  );
};


const getUserChats = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const userId = req.session.user.id;

  try {
    await ensureChatAttachmentsSchema();

    const chats = await db.query(
      `SELECT
          c.id,
          c.user1_id,
          c.user2_id,
          c.updated_at,
          u1.first_name as user1_first_name,
          u1.last_name as user1_last_name,
          u1.avatar as user1_avatar,
          u2.first_name as user2_first_name,
          u2.last_name as user2_last_name,
          u2.avatar as user2_avatar,
          (
              SELECT COALESCE(NULLIF(message, ''), CONCAT('[Файл] ', file_name), '') FROM messages
              WHERE chat_id = c.id
              ORDER BY created_at DESC
              LIMIT 1
          ) as last_message,
          (
              SELECT created_at FROM messages
              WHERE chat_id = c.id
              ORDER BY created_at DESC
              LIMIT 1
          ) as last_message_time,
          (
              SELECT COUNT(*) FROM messages
              WHERE chat_id = c.id AND sender_id != $1 AND is_read = FALSE
          ) as unread_count
      FROM chats c
      JOIN users u1 ON c.user1_id = u1.id
      JOIN users u2 ON c.user2_id = u2.id
      WHERE c.user1_id = $1 OR c.user2_id = $1
      ORDER BY c.updated_at DESC`,
      [userId]
    );

    const formattedChats = chats.rows.map((chat) => {
      const isUser1 = chat.user1_id === userId;
      const otherUser = isUser1
        ? {
            id: chat.user2_id,
            first_name: chat.user2_first_name,
            last_name: chat.user2_last_name,
            avatar: chat.user2_avatar,
          }
        : {
            id: chat.user1_id,
            first_name: chat.user1_first_name,
            last_name: chat.user1_last_name,
            avatar: chat.user1_avatar,
          };

      return {
        id: chat.id,
        otherUser,
        lastMessage: chat.last_message,
        lastMessageTime: chat.last_message_time,
        unreadCount: parseInt(chat.unread_count, 10),
      };
    });

    return res.json(formattedChats);
  } catch (error) {
    console.error('Get chats error:', error);
    return res.status(500).json({ error: 'Ошибка загрузки чатов' });
  }
};


const getOrCreateChat = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const { userId } = req.params;
  const currentUserId = req.session.user.id;

  if (currentUserId === parseInt(userId, 10)) {
    return res.status(400).json({ error: 'Нельзя создать чат с самим собой' });
  }

  try {
    let chat = await db.query(
      `SELECT * FROM chats
       WHERE (user1_id = $1 AND user2_id = $2)
          OR (user1_id = $2 AND user2_id = $1)`,
      [currentUserId, userId]
    );

    if (chat.rows.length === 0) {
      const newChat = await db.query(
        `INSERT INTO chats (user1_id, user2_id)
         VALUES ($1, $2)
         RETURNING *`,
        [currentUserId, userId]
      );
      chat = newChat;
    }

    return res.json({ chatId: chat.rows[0].id });
  } catch (error) {
    console.error('Get/create chat error:', error);
    return res.status(500).json({ error: 'Ошибка при создании чата' });
  }
};


const getChatMessages = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const { chatId } = req.params;
  const userId = req.session.user.id;

  try {
    await ensureChatAttachmentsSchema();

    const chat = await getChatForUser(chatId, userId);

    if (chat.rows.length === 0) {
      return res.status(403).json({ error: 'Нет доступа к чату' });
    }

    const messages = await db.query(
      `SELECT m.*, u.first_name, u.last_name, u.avatar
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.chat_id = $1
       ORDER BY m.created_at ASC`,
      [chatId]
    );

    await db.query(
      `UPDATE messages
       SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
       WHERE chat_id = $1 AND sender_id != $2 AND is_read = FALSE`,
      [chatId, userId]
    );

    await db.query('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [chatId]);

    return res.json(messages.rows);
  } catch (error) {
    console.error('Get messages error:', error);
    return res.status(500).json({ error: 'Ошибка загрузки сообщений' });
  }
};


const sendMessage = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const { chatId } = req.params;
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  const userId = req.session.user.id;

  if (!message) {
    return res.status(400).json({ error: 'Сообщение не может быть пустым' });
  }

  if (message.length > TEXTAREA_MAX_LENGTH) {
    return res.status(400).json({ error: `Сообщение не должно превышать ${TEXTAREA_MAX_LENGTH} символов` });
  }

  try {
    const chat = await getChatForUser(chatId, userId);

    if (chat.rows.length === 0) {
      return res.status(403).json({ error: 'Нет доступа к чату' });
    }

    const result = await createChatMessage({ chatId, userId, message });

    await db.query('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [chatId]);

    const otherUserId = chat.rows[0].user1_id === userId ? chat.rows[0].user2_id : chat.rows[0].user1_id;

    await db.query(
      `INSERT INTO notifications (user_id, message, link)
       VALUES ($1, $2, $3)`,
      [otherUserId, `Новое сообщение от ${req.session.user.first_name}`, `/chat?userId=${req.session.user.id}`]
    );

    return res.json({ success: true, message: result.rows[0] });
  } catch (error) {
    console.error('Send message error:', error);
    return res.status(500).json({ error: 'Ошибка при отправке сообщения' });
  }
};


const sendFileMessage = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const { chatId } = req.params;
  const userId = req.session.user.id;
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  const files = Array.isArray(req.files) && req.files.length > 0
    ? req.files
    : (req.file ? [req.file] : []);

  if (files.length === 0) {
    return res.status(400).json({ error: 'Файлы не переданы' });
  }

  if (files.length > 10) {
    return res.status(400).json({ error: 'Можно отправить не более 10 файлов за раз' });
  }

  if (!message && files.length === 0) {
    return res.status(400).json({ error: 'Нужно добавить сообщение или файл' });
  }

  if (message.length > TEXTAREA_MAX_LENGTH) {
    return res.status(400).json({ error: `Сообщение не должно превышать ${TEXTAREA_MAX_LENGTH} символов` });
  }

  try {
    const chat = await getChatForUser(chatId, userId);

    if (chat.rows.length === 0) {
      return res.status(403).json({ error: 'Нет доступа к чату' });
    }

    const decodedMessage = safeDecodeURIComponent(message || '');
    if (decodedMessage.length > TEXTAREA_MAX_LENGTH) {
      return res.status(400).json({ error: `Сообщение не должно превышать ${TEXTAREA_MAX_LENGTH} символов` });
    }

    const sentMessages = [];

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const decodedFileName = safeDecodeURIComponent(file.originalname || '');
      const result = await createChatMessage({
        chatId,
        userId,
        message: i === 0 ? decodedMessage : '',
        fileUrl: `/uploads/chat-files/${file.filename}`,
        fileName: decodedFileName,
        fileMime: file.mimetype,
        fileSize: file.size,
      });

      sentMessages.push(result.rows[0]);
    }

    await db.query('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [chatId]);

    const otherUserId = chat.rows[0].user1_id === userId ? chat.rows[0].user2_id : chat.rows[0].user1_id;

    await db.query(
      `INSERT INTO notifications (user_id, message, link)
       VALUES ($1, $2, $3)`,
      [otherUserId, `Новое сообщение с файлом от ${req.session.user.first_name}`, `/chat?userId=${req.session.user.id}`]
    );

    return res.json({ success: true, messages: sentMessages });
  } catch (error) {
    console.error('Send file message error:', error);
    return res.status(500).json({ error: 'Ошибка при отправке файла' });
  }
};

const editMessage = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const { chatId, messageId } = req.params;
  const userId = req.session.user.id;
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';

  if (!message) {
    return res.status(400).json({ error: 'Сообщение не может быть пустым' });
  }

  if (message.length > TEXTAREA_MAX_LENGTH) {
    return res.status(400).json({ error: `Сообщение не должно превышать ${TEXTAREA_MAX_LENGTH} символов` });
  }

  try {
    const chat = await getChatForUser(chatId, userId);
    if (chat.rows.length === 0) {
      return res.status(403).json({ error: 'Нет доступа к чату' });
    }

    const updated = await db.query(
      `UPDATE messages
       SET message = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND chat_id = $3 AND sender_id = $4
       RETURNING *`,
      [message, messageId, chatId, userId]
    );

    if (!updated.rows.length) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    await db.query('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [chatId]);
    return res.json({ success: true, message: updated.rows[0] });
  } catch (error) {
    console.error('Edit message error:', error);
    return res.status(500).json({ error: 'Ошибка при редактировании сообщения' });
  }
};

const deleteMessageForAll = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const { chatId, messageId } = req.params;
  const userId = req.session.user.id;

  try {
    const chat = await getChatForUser(chatId, userId);
    if (chat.rows.length === 0) {
      return res.status(403).json({ error: 'Нет доступа к чату' });
    }

    const deleted = await db.query(
      `DELETE FROM messages
       WHERE id = $1 AND chat_id = $2 AND sender_id = $3
       RETURNING id`,
      [messageId, chatId, userId]
    );

    if (!deleted.rows.length) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    await db.query('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [chatId]);
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete message error:', error);
    return res.status(500).json({ error: 'Ошибка при удалении сообщения' });
  }
};


const saveDraft = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const { chatId } = req.params;
  const { draft_text } = req.body;
  const userId = req.session.user.id;

  try {
    await db.query(
      `INSERT INTO message_drafts (chat_id, user_id, draft_text, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (chat_id, user_id) DO UPDATE
       SET draft_text = $3, updated_at = CURRENT_TIMESTAMP`,
      [chatId, userId, draft_text]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Save draft error:', error);
    return res.status(500).json({ error: 'Ошибка при сохранении черновика' });
  }
};


const getDraft = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const { chatId } = req.params;
  const userId = req.session.user.id;

  try {
    const draft = await db.query(
      `SELECT draft_text FROM message_drafts
       WHERE chat_id = $1 AND user_id = $2`,
      [chatId, userId]
    );

    return res.json({ draft_text: draft.rows[0]?.draft_text || '' });
  } catch (error) {
    console.error('Get draft error:', error);
    return res.status(500).json({ error: 'Ошибка при загрузке черновика' });
  }
};


const searchUsers = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const currentUserId = req.session.user.id;
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  if (query.length < 2) {
    return res.json([]);
  }

  try {
    const users = await db.query(
      `SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.avatar,
          c.id AS chat_id
      FROM users u
      LEFT JOIN chats c
          ON (c.user1_id = $1 AND c.user2_id = u.id)
          OR (c.user2_id = $1 AND c.user1_id = u.id)
      WHERE u.id != $1
        AND (
            CONCAT_WS(' ', u.first_name, u.last_name) ILIKE $2
            OR u.email ILIKE $2
        )
      ORDER BY
          CASE WHEN c.id IS NULL THEN 1 ELSE 0 END,
          u.first_name ASC,
          u.last_name ASC
      LIMIT 20`,
      [currentUserId, `%${query}%`]
    );

    return res.json(
      users.rows.map((user) => ({
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        avatar: user.avatar,
        chatId: user.chat_id,
      }))
    );
  } catch (error) {
    console.error('Search users error:', error);
    return res.status(500).json({ error: 'Ошибка поиска пользователей' });
  }
};

module.exports = {
  getUserChats,
  getOrCreateChat,
  getChatMessages,
  sendMessage,
  sendFileMessage,
  editMessage,
  deleteMessageForAll,
  saveDraft,
  getDraft,
  searchUsers,
};
