const db = require('../config/database');
const { ensureOrdersTable, ensureOrderStagesTable, holdOrderFunds } = require('./orderController');
const { ensureBalanceTables } = require('./paymentController');

let schemaChecked = false;

const ensureDealTables = async () => {
  if (schemaChecked) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS deal_proposals (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('service', 'order')),
      target_id INTEGER NOT NULL,
      price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      deadline DATE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      responded_at TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS deal_proposal_stages (
      id SERIAL PRIMARY KEY,
      proposal_id INTEGER NOT NULL REFERENCES deal_proposals(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      deadline DATE,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.query(`ALTER TABLE deal_proposals ALTER COLUMN target_type DROP NOT NULL`);
  await db.query(`ALTER TABLE deal_proposals ALTER COLUMN target_id DROP NOT NULL`);

  await db.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) DEFAULT 'text'`);
  await db.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB`);

  schemaChecked = true;
};


const updateProposalMessageMetadata = async (proposalId, metadataPatch, client = db) => {
  await client.query(
    `UPDATE messages
     SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
     WHERE message_type = 'deal_proposal'
       AND metadata->>'proposal_id' = $1`,
    [String(proposalId), JSON.stringify(metadataPatch)]
  );
};

const getOrCreateChat = async (user1Id, user2Id) => {
  let chat = await db.query(
    `SELECT * FROM chats
     WHERE (user1_id = $1 AND user2_id = $2)
        OR (user1_id = $2 AND user2_id = $1)`,
    [user1Id, user2Id]
  );

  if (chat.rows.length === 0) {
    const newChat = await db.query(
      `INSERT INTO chats (user1_id, user2_id)
       VALUES ($1, $2)
       RETURNING *`,
      [user1Id, user2Id]
    );
    chat = newChat;
  }

  return chat.rows[0];
};

const createDeal = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const senderId = req.session.user.id;
  const {
    targetType,
    targetId,
    recipientId: bodyRecipientId,
    price,
    deadline,
    stages = [],
  } = req.body;

  const priceNum = parseFloat(price);
  if (Number.isNaN(priceNum) || priceNum < 0) {
    return res.status(400).json({ error: 'Неверная цена' });
  }

  try {
    await ensureDealTables();

    let recipientId;
    let title;
    let finalTargetType = targetType || null;
    let finalTargetId = targetId ? parseInt(targetId, 10) : null;

    if (finalTargetType && ['service', 'order'].includes(finalTargetType) && finalTargetId) {
      if (finalTargetType === 'service') {
        const service = await db.query(
          `SELECT provider_id, title FROM services WHERE id = $1`,
          [finalTargetId]
        );
        if (service.rows.length === 0) {
          return res.status(404).json({ error: 'Услуга не найдена' });
        }
        recipientId = service.rows[0].provider_id;
        title = service.rows[0].title;
      } else {
        const order = await db.query(
          `SELECT customer_id, title FROM orders WHERE id = $1`,
          [finalTargetId]
        );
        if (order.rows.length === 0) {
          return res.status(404).json({ error: 'Заказ не найден' });
        }
        recipientId = order.rows[0].customer_id;
        title = order.rows[0].title;
      }
    } else if (bodyRecipientId) {
      recipientId = parseInt(bodyRecipientId, 10);
      finalTargetType = null;
      finalTargetId = null;
      const userResult = await db.query(
        `SELECT first_name, last_name FROM users WHERE id = $1`,
        [recipientId]
      );
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Пользователь не найден' });
      }
      title = `Сделка с ${userResult.rows[0].first_name || 'пользователем'}`;
    } else {
      return res.status(400).json({ error: 'Укажите получателя или цель сделки' });
    }

    if (senderId === recipientId) {
      return res.status(400).json({ error: 'Нельзя предложить сделку самому себе' });
    }

    const proposalResult = await db.query(
      `INSERT INTO deal_proposals (sender_id, recipient_id, target_type, target_id, price, deadline)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [senderId, recipientId, finalTargetType, finalTargetId, priceNum, deadline || null]
    );
    const proposal = proposalResult.rows[0];

    if (Array.isArray(stages) && stages.length > 0) {
      const validStages = stages.filter(s => s.title && s.title.trim());
      for (let i = 0; i < validStages.length; i += 1) {
        await db.query(
          `INSERT INTO deal_proposal_stages (proposal_id, title, deadline, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [proposal.id, validStages[i].title.trim(), validStages[i].deadline || null, i]
        );
      }
    }

    const chat = await getOrCreateChat(senderId, recipientId);

    const metadata = JSON.stringify({
      proposal_id: proposal.id,
      target_type: finalTargetType,
      target_id: finalTargetId,
      price: proposal.price,
      deadline: proposal.deadline,
      status: proposal.status,
    });
    await db.query(
      `INSERT INTO messages (chat_id, sender_id, message, message_type, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [chat.id, senderId, `Предложение сделки: ${title || 'Без названия'}`, 'deal_proposal', metadata]
    );

    await db.query('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [chat.id]);

    await db.query(
      `INSERT INTO notifications (user_id, message, link)
       VALUES ($1, $2, $3)`,
      [recipientId, `${req.session.user.first_name} предлагает вам сделку`, `/chat?user=${senderId}`]
    );

    return res.json({ success: true, proposal, chatId: chat.id });
  } catch (error) {
    console.error('Create deal error:', error);
    return res.status(500).json({ error: 'Ошибка при создании предложения' });
  }
};

const getDeal = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const { id } = req.params;
  const userId = req.session.user.id;

  try {
    await ensureDealTables();

    const proposalResult = await db.query(
      `SELECT dp.*,
              s.first_name as sender_first_name,
              s.last_name as sender_last_name,
              r.first_name as recipient_first_name,
              r.last_name as recipient_last_name
       FROM deal_proposals dp
       JOIN users s ON dp.sender_id = s.id
       JOIN users r ON dp.recipient_id = r.id
       WHERE dp.id = $1`,
      [id]
    );

    if (proposalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Предложение не найдено' });
    }

    const proposal = proposalResult.rows[0];
    if (proposal.sender_id !== userId && proposal.recipient_id !== userId) {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    const stagesResult = await db.query(
      `SELECT * FROM deal_proposal_stages WHERE proposal_id = $1 ORDER BY sort_order, id`,
      [id]
    );

    return res.json({ ...proposal, stages: stagesResult.rows });
  } catch (error) {
    console.error('Get deal error:', error);
    return res.status(500).json({ error: 'Ошибка при загрузке предложения' });
  }
};

const acceptDeal = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const { id } = req.params;
  const userId = req.session.user.id;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await ensureDealTables();
    await ensureOrdersTable(client);
    await ensureOrderStagesTable(client);
    await ensureBalanceTables(client);

    const proposalResult = await client.query(
      `SELECT * FROM deal_proposals WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (proposalResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Предложение не найдено' });
    }

    const proposal = proposalResult.rows[0];

    if (proposal.recipient_id !== userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Только получатель может принять сделку' });
    }

    if (proposal.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Сделка уже обработана' });
    }

    const stagesResult = await client.query(
      `SELECT * FROM deal_proposal_stages WHERE proposal_id = $1 ORDER BY sort_order, id`,
      [id]
    );

    let orderId = null;

    if (proposal.target_type === 'service') {
      const service = await client.query(
        `SELECT title, description FROM services WHERE id = $1`,
        [proposal.target_id]
      );
      const serviceData = service.rows[0] || {};

      const orderResult = await client.query(
        `INSERT INTO orders (customer_id, executor_id, title, description, price, status, deadline, created_at, payment_status, customer_confirmed, executor_confirmed)
         VALUES ($1, $2, $3, $4, $5, 'in_progress', $6, CURRENT_TIMESTAMP, 'pending', FALSE, FALSE)
         RETURNING *`,
        [
          proposal.sender_id,
          proposal.recipient_id,
          serviceData.title || 'Сделка по услуге',
          serviceData.description || null,
          proposal.price,
          proposal.deadline,
        ]
      );
      orderId = orderResult.rows[0].id;
      await holdOrderFunds(orderResult.rows[0], client, 'Резерв по принятой сделке');
    } else if (proposal.target_type === 'order') {
      const orderResult = await client.query(
        `UPDATE orders
         SET executor_id = $1,
             status = 'in_progress',
             price = COALESCE($2, price),
             deadline = COALESCE($3, deadline),
             customer_confirmed = FALSE,
             executor_confirmed = FALSE,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4 AND customer_id = $5 AND status = 'active'
         RETURNING *`,
        [proposal.sender_id, proposal.price, proposal.deadline, proposal.target_id, proposal.recipient_id]
      );

      if (orderResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Заказ не найден или уже принят' });
      }

      orderId = orderResult.rows[0].id;
      await holdOrderFunds(orderResult.rows[0], client, 'Резерв по принятой сделке');
    } else {

      const orderResult = await client.query(
        `INSERT INTO orders (customer_id, executor_id, title, description, price, status, deadline, created_at, payment_status, customer_confirmed, executor_confirmed)
         VALUES ($1, $2, $3, $4, $5, 'in_progress', $6, CURRENT_TIMESTAMP, 'pending', FALSE, FALSE)
         RETURNING *`,
        [
          proposal.sender_id,
          proposal.recipient_id,
          'Прямая сделка',
          null,
          proposal.price,
          proposal.deadline,
        ]
      );
      orderId = orderResult.rows[0].id;
      await holdOrderFunds(orderResult.rows[0], client, 'Резерв по принятой сделке');
    }

    for (const stage of stagesResult.rows) {
      await client.query(
        `INSERT INTO order_stages (order_id, name, deadline, sort_order, completed)
         VALUES ($1, $2, $3, $4, FALSE)`,
        [orderId, stage.title, stage.deadline, stage.sort_order]
      );
    }

    await client.query(
      `UPDATE deal_proposals SET status = 'accepted', responded_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );
    await updateProposalMessageMetadata(proposal.id, { status: 'accepted', order_id: orderId }, client);

    await client.query('COMMIT');

    const chat = await getOrCreateChat(proposal.sender_id, proposal.recipient_id);
    const metadata = JSON.stringify({ proposal_id: proposal.id, status: 'accepted', order_id: orderId, price: proposal.price, payment_status: 'held' });
    await db.query(
      `INSERT INTO messages (chat_id, sender_id, message, message_type, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [chat.id, userId, 'Сделка принята, средства заказчика заморожены', 'deal_status', metadata]
    );
    await db.query('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [chat.id]);

    await db.query(
      `INSERT INTO notifications (user_id, message, link)
       VALUES ($1, $2, $3)`,
      [proposal.sender_id, `${req.session.user.first_name} принял(а) ваше предложение сделки. Средства заморожены.`, `/orders/${orderId}`]
    );

    return res.json({ success: true, orderId });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Accept deal error:', error);
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Ошибка при принятии сделки' });
  } finally {
    client.release();
  }
};

const rejectDeal = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const { id } = req.params;
  const userId = req.session.user.id;

  try {
    await ensureDealTables();
    await ensureOrderStagesTable(db);
    await db.query('BEGIN');

    const proposalResult = await db.query(
      `SELECT * FROM deal_proposals WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (proposalResult.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Предложение не найдено' });
    }

    const proposal = proposalResult.rows[0];

    if (proposal.recipient_id !== userId) {
      await db.query('ROLLBACK');
      return res.status(403).json({ error: 'Только получатель может отклонить сделку' });
    }

    if (proposal.status !== 'pending') {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: 'Сделка уже обработана' });
    }

    await db.query(
      `UPDATE deal_proposals SET status = 'rejected', responded_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );
    await updateProposalMessageMetadata(proposal.id, { status: 'rejected' });

    await db.query('COMMIT');

    const chat = await getOrCreateChat(proposal.sender_id, proposal.recipient_id);
    const metadata = JSON.stringify({ proposal_id: proposal.id, status: 'rejected', price: proposal.price });
    await db.query(
      `INSERT INTO messages (chat_id, sender_id, message, message_type, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [chat.id, userId, 'Сделка отклонена', 'deal_status', metadata]
    );
    await db.query('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [chat.id]);

    await db.query(
      `INSERT INTO notifications (user_id, message, link)
       VALUES ($1, $2, $3)`,
      [proposal.sender_id, `${req.session.user.first_name} отклонил(а) ваше предложение сделки`, `/chat?user=${userId}`]
    );

    return res.json({ success: true });
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('Reject deal error:', error);
    return res.status(500).json({ error: 'Ошибка при отклонении сделки' });
  }
};

const cancelDeal = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const { id } = req.params;
  const userId = req.session.user.id;

  try {
    await ensureDealTables();
    await ensureOrderStagesTable(db);
    await db.query('BEGIN');

    const proposalResult = await db.query(
      `SELECT * FROM deal_proposals WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (proposalResult.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Предложение не найдено' });
    }

    const proposal = proposalResult.rows[0];

    if (proposal.sender_id !== userId) {
      await db.query('ROLLBACK');
      return res.status(403).json({ error: 'Только отправитель может отменить сделку' });
    }

    if (proposal.status !== 'pending') {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: 'Сделка уже обработана' });
    }

    await db.query(
      `UPDATE deal_proposals SET status = 'cancelled', responded_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );
    await updateProposalMessageMetadata(proposal.id, { status: 'cancelled' });

    await db.query('COMMIT');

    const chat = await getOrCreateChat(proposal.sender_id, proposal.recipient_id);
    const metadata = JSON.stringify({ proposal_id: proposal.id, status: 'cancelled', price: proposal.price });
    await db.query(
      `INSERT INTO messages (chat_id, sender_id, message, message_type, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [chat.id, userId, 'Предложение сделки отменено', 'deal_status', metadata]
    );
    await db.query('UPDATE chats SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [chat.id]);

    return res.json({ success: true });
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('Cancel deal error:', error);
    return res.status(500).json({ error: 'Ошибка при отмене сделки' });
  }
};

module.exports = {
  ensureDealTables,
  createDeal,
  getDeal,
  acceptDeal,
  rejectDeal,
  cancelDeal,
};
