const db = require('../config/database');

const TEXTAREA_MAX_LENGTH = 2000;

const ensureServiceCoverColumn = async () => {
  await db.query(`
    ALTER TABLE services
    ADD COLUMN IF NOT EXISTS cover_image TEXT
  `);
};

const getUserServices = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const userId = req.session.user.id;
  const { status } = req.query;

  try {
    const providerColumnResult = await db.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'services' AND column_name = 'provider_id'
      ) AS exists
    `);
    const sourceOrderColumnResult = await db.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'services' AND column_name = 'source_order_id'
      ) AS exists
    `);
    const hasProviderId = Boolean(providerColumnResult.rows[0]?.exists);
    const hasSourceOrderId = Boolean(sourceOrderColumnResult.rows[0]?.exists);
    const ownerExpr = hasProviderId ? 'COALESCE(s.user_id, s.provider_id)' : 's.user_id';
    const ownServicesOnly = hasSourceOrderId ? 'AND s.source_order_id IS NULL' : '';

    await db.query(`
      CREATE TABLE IF NOT EXISTS service_categories (
        service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        PRIMARY KEY (service_id, category_id)
      )
    `);

    const serviceCategoryColumnResult = await db.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'services' AND column_name = 'category_id'
      ) AS exists
    `);
    const hasServiceCategoryId = Boolean(serviceCategoryColumnResult.rows[0]?.exists);
    const legacyCategorySelect = hasServiceCategoryId
      ? `UNION SELECT s_legacy.category_id FROM services s_legacy WHERE s_legacy.id = s.id AND s_legacy.category_id IS NOT NULL`
      : '';

    let query = `
      SELECT s.*,
             COALESCE(u.first_name || ' ' || u.last_name, 'Не назначен') AS provider_name,
             COALESCE((
               SELECT ARRAY_AGG(category_id ORDER BY category_id)
               FROM (
                 SELECT sc.category_id
                 FROM service_categories sc
                 WHERE sc.service_id = s.id
                 ${legacyCategorySelect}
               ) service_category_ids
             ), ARRAY[]::integer[]) AS category_ids
      FROM services s
      LEFT JOIN users u ON ${ownerExpr} = u.id
      WHERE ${ownerExpr} = $1 ${ownServicesOnly}
    `;
    const params = [userId];

    if (status && status !== 'all') {
      query += ` AND s.status = $2`;
      params.push(status);
    }

    query += ` ORDER BY s.created_at DESC`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get user services error:', error);
    res.status(500).json({ error: 'Ошибка при загрузке услуг' });
  }
};

const updateServiceStatus = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const serviceId = parseInt(req.params.id, 10);
  const { status } = req.body;
  const userId = req.session.user.id;

  if (!Number.isInteger(serviceId) || serviceId <= 0) {
    return res.status(400).json({ error: 'Некорректный ID услуги' });
  }

  const allowedStatuses = ['active', 'in_progress', 'completed', 'cancelled', 'archived'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Недопустимый статус' });
  }

  try {
    const providerColumnResult = await db.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'services' AND column_name = 'provider_id'
      ) AS exists
    `);
    const hasProviderId = Boolean(providerColumnResult.rows[0]?.exists);
    const ownerExpr = hasProviderId ? 'COALESCE(s.user_id, s.provider_id)' : 's.user_id';

    const result = await db.query(`
      UPDATE services s
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE s.id = $2 AND ${ownerExpr} = $3
      RETURNING *
    `, [status, serviceId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Услуга не найдена' });
    }

    res.json({ success: true, service: result.rows[0] });
  } catch (error) {
    console.error('Update service status error:', error);
    res.status(500).json({ error: 'Ошибка при обновлении статуса' });
  }
};

const createService = async (req, res) => {
  if (!req.session.user) return res.redirect('/auth');

  try {
    const userId = req.session.user.id;
    const title = String(req.body.title || '').trim();
    const fullDescription = String(req.body.full_description || '').trim();
    const buyerRequirements = String(req.body.buyer_requirements || '').trim();
    const description = [fullDescription, buyerRequirements ? `Требования: ${buyerRequirements}` : '']
      .filter(Boolean)
      .join('\n\n');
    const priceFrom = Number(req.body.price_from ?? req.body.price ?? 0);
    const priceTo = Number(req.body.price_to ?? req.body.price ?? 0);
    const executionDays = Number(req.body.delivery_days || 1);
    const selected = Array.isArray(req.body.categories)
      ? req.body.categories
      : req.body.categories
        ? [req.body.categories]
        : [];

    if (fullDescription.length > TEXTAREA_MAX_LENGTH || buyerRequirements.length > TEXTAREA_MAX_LENGTH) {
      return res.status(400).send(`Описание и требования не должны превышать ${TEXTAREA_MAX_LENGTH} символов`);
    }

    if (
      !title
      || Number.isNaN(priceFrom)
      || Number.isNaN(priceTo)
      || priceFrom < 0
      || priceTo < 0
      || priceTo < priceFrom
      || !Number.isInteger(executionDays)
      || executionDays < 1
    ) {
      return res.status(400).send('Некорректные данные услуги');
    }

    await ensureServiceCoverColumn();

    await db.query(`
      CREATE TABLE IF NOT EXISTS service_categories (
        service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        PRIMARY KEY (service_id, category_id)
      )
    `);

    const startDate = new Date();
    const deadlineDate = new Date(startDate);
    deadlineDate.setDate(deadlineDate.getDate() + executionDays);

    const coverImage = req.file ? `/uploads/${req.file.filename}` : null;

    const created = await db.query(
      `INSERT INTO services (user_id, title, description, price_from, price_to, execution_days, start_date, deadline, cover_image)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        userId,
        title,
        description || null,
        priceFrom,
        priceTo,
        executionDays,
        startDate.toISOString().split('T')[0],
        deadlineDate.toISOString().split('T')[0],
        coverImage,
      ]
    );

    const serviceId = created.rows[0].id;
    for (const categoryIdRaw of selected) {
      const categoryId = Number(categoryIdRaw);
      if (!Number.isInteger(categoryId)) continue;
      await db.query(
        `INSERT INTO service_categories (service_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [serviceId, categoryId]
      );
    }

    return res.redirect('/services?service_created=1');
  } catch (error) {
    console.error('Error creating service:', error);
    return res.status(500).send('Ошибка создания услуги');
  }
};

module.exports = { createService, getUserServices, updateServiceStatus };
