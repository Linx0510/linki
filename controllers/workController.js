const db = require('../config/database');
const fs = require('fs');
const path = require('path');
const MAX_WORK_IMAGES = 10;
const TEXTAREA_MAX_LENGTH = 2000;

const uploadDir = path.join(__dirname, '..', 'public', 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const saveBase64Image = (base64String) => {
  if (typeof base64String !== 'string') return null;

  const matches = base64String.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!matches) {
    return null;
  }

  const mimeType = matches[1];
  const base64Data = matches[2];
  const extensionMap = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  const ext = extensionMap[mimeType.toLowerCase()];
  if (!ext) return null;

  const fileName = `work-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
  const filePath = path.join(uploadDir, fileName);

  fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
  return `/uploads/${fileName}`;
};

const getAllowedWorkStatuses = async () => {
  const result = await db.query(`
    SELECT pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'works'
      AND c.contype = 'c'
      AND c.conname ILIKE '%status%check%'
  `);

  const allowed = new Set();
  for (const row of result.rows) {
    const definition = row.def || '';
    const matches = definition.match(/'([^']+)'/g) || [];
    for (const match of matches) {
      allowed.add(match.slice(1, -1));
    }
  }

  return allowed;
};

const pickModerationStatus = (allowedStatuses) => {
  if (!allowedStatuses || allowedStatuses.size === 0) {
    return 'pending';
  }

  const values = Array.from(allowedStatuses);
  const lowerMap = new Map(values.map((value) => [value.toLowerCase(), value]));
  const moderationCandidates = [
    'pending',
    'on_moderation',
    'under_review',
    'moderation',
    'review',
    'wait_moderation',
    'на модерации',
    'ожидает модерации',
  ];

  for (const candidate of moderationCandidates) {
    const match = lowerMap.get(candidate.toLowerCase());
    if (match) {
      return match;
    }
  }

  const nonPublicStatus = values.find((status) => {
    const normalized = status.toLowerCase();
    return !['active', 'approved', 'published', 'cancelled', 'blocked', 'rejected'].includes(normalized);
  });

  return nonPublicStatus || values[0];
};

const createWork = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { title, description, categories, images } = req.body;
  const normalizedDescription = typeof description === 'string' ? description : '';
  const uploadedImagesCount = Array.isArray(req.files) ? req.files.length : 0;
  const requestImages = Array.isArray(images)
    ? images
    : (images ? [images] : []);

  if (normalizedDescription.length > TEXTAREA_MAX_LENGTH) {
    return res.status(400).json({ error: `Описание не должно превышать ${TEXTAREA_MAX_LENGTH} символов` });
  }

  if (uploadedImagesCount + requestImages.length > MAX_WORK_IMAGES) {
    return res.status(400).json({ error: `Можно загрузить не более ${MAX_WORK_IMAGES} изображений` });
  }

  try {
    const allowedStatuses = await getAllowedWorkStatuses();
    const moderationStatus = pickModerationStatus(allowedStatuses);

    const workResult = await db.query(`
      INSERT INTO works (user_id, title, description, status)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [req.session.user.id, title, normalizedDescription, moderationStatus]);

    const workId = workResult.rows[0].id;

    const selectedCategories = Array.isArray(categories)
      ? categories
      : (categories ? [categories] : []);
    const uniqueCategoryIds = [...new Set(selectedCategories
      .map((categoryId) => parseInt(categoryId, 10))
      .filter((categoryId) => Number.isInteger(categoryId)))];

    if (uniqueCategoryIds.length > 8) {
      return res.status(400).json({ error: 'Можно выбрать не более 8 подкатегорий' });
    }

    if (uniqueCategoryIds.length > 0) {
      for (const categoryId of uniqueCategoryIds) {
        await db.query(`
          INSERT INTO work_categories (work_id, category_id)
          VALUES ($1, $2)
        `, [workId, categoryId]);
      }
    }

    const uploadedImages = Array.isArray(req.files)
      ? req.files
          .map((file) => (file && file.filename ? `/uploads/${file.filename}` : null))
          .filter((imageUrl) => typeof imageUrl === 'string' && imageUrl.trim())
      : [];

    const base64ImageUrls = requestImages
      .map((image) => saveBase64Image(image))
      .filter((imageUrl) => typeof imageUrl === 'string' && imageUrl.trim());

    const imageUrls = [...uploadedImages, ...base64ImageUrls];

    if (imageUrls.length > 0) {
      for (let i = 0; i < imageUrls.length; i++) {
        await db.query(`
          INSERT INTO work_images (work_id, image_url, sort_order)
          VALUES ($1, $2, $3)
        `, [workId, imageUrls[i], i]);
      }
    }

    res.status(201).json({
      success: true,
      workId,
      message: 'Работа отправлена на модерацию и станет доступна после проверки администратором',
    });
  } catch (error) {
    console.error('Error creating work:', error);
    res.status(500).json({ error: 'Ошибка при создании работы' });
  }
};

const REPORT_REASONS = [
  { slug: 'fraud', name: 'Мошенничество', description: 'Обман, попытка получить оплату вне платформы или недостоверные условия.' },
  { slug: 'spam', name: 'Спам или реклама', description: 'Навязчивая реклама, повторяющиеся публикации или нерелевантные предложения.' },
  { slug: 'prohibited_content', name: 'Запрещённый контент', description: 'Материалы, товары или услуги, нарушающие правила платформы.' },
  { slug: 'offensive_content', name: 'Оскорбления или дискриминация', description: 'Грубые высказывания, угрозы, ненависть или дискриминация.' },
  { slug: 'copyright_violation', name: 'Нарушение авторских прав', description: 'Чужие материалы, логотипы, тексты или изображения без разрешения.' },
  { slug: 'incorrect_information', name: 'Недостоверная информация', description: 'Ложное описание, неверная цена, сроки, опыт или характеристики.' },
];

const LEGACY_REPORT_REASON_NAMES = {
  sexual_content: 'Запрещённый контент',
  self_harm: 'Запрещённый контент',
  misinformation: 'Недостоверная информация',
  hate_or_abuse: 'Оскорбления или дискриминация',
  dangerous_goods: 'Запрещённый контент',
  harassment: 'Оскорбления или дискриминация',
  violence: 'Запрещённый контент',
  privacy: 'Недостоверная информация',
  intellectual_property: 'Нарушение авторских прав',
};

const ensureComplaintSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS complaint_reasons (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL UNIQUE
    )
  `);

  await db.query(`ALTER TABLE complaint_reasons ADD COLUMN IF NOT EXISTS slug VARCHAR(100)`);
  await db.query(`ALTER TABLE complaint_reasons ADD COLUMN IF NOT EXISTS description TEXT`);

  for (const reason of REPORT_REASONS) {
    await db.query(`
      INSERT INTO complaint_reasons (name, slug, description)
      VALUES ($1, $2, $3)
      ON CONFLICT (name) DO UPDATE
      SET slug = EXCLUDED.slug,
          description = EXCLUDED.description
    `, [reason.name, reason.slug, reason.description]);
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS complaints (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      work_id INTEGER,
      reason_id INTEGER NOT NULL REFERENCES complaint_reasons(id),
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`ALTER TABLE complaints ADD COLUMN IF NOT EXISTS target_type VARCHAR(30) DEFAULT 'work'`);
  await db.query(`ALTER TABLE complaints ADD COLUMN IF NOT EXISTS service_id INTEGER`);
  await db.query(`ALTER TABLE complaints ADD COLUMN IF NOT EXISTS order_id INTEGER`);
  await db.query(`ALTER TABLE complaints ADD COLUMN IF NOT EXISTS details TEXT`);
  await db.query(`ALTER TABLE complaints ALTER COLUMN work_id DROP NOT NULL`);
};

const getComplaintReasonId = async (reasonCode) => {
  if (!reasonCode || typeof reasonCode !== 'string') return null;

  const normalizedCode = reasonCode.trim();
  if (!normalizedCode) return null;

  const numericId = Number.parseInt(normalizedCode, 10);
  if (Number.isInteger(numericId) && String(numericId) === normalizedCode) {
    const idResult = await db.query('SELECT id FROM complaint_reasons WHERE id = $1 LIMIT 1', [numericId]);
    return idResult.rows[0]?.id || null;
  }

  const fallbackName = LEGACY_REPORT_REASON_NAMES[normalizedCode] || normalizedCode;
  const result = await db.query(`
    SELECT id
    FROM complaint_reasons
    WHERE slug = $1 OR name = $1 OR name = $2
    LIMIT 1
  `, [normalizedCode, fallbackName]);

  return result.rows[0]?.id || null;
};

const getReportTarget = (req) => {
  if (req.params.workId) {
    return { type: 'work', id: Number.parseInt(req.params.workId, 10) };
  }

  const typeAliases = {
    work: 'work',
    works: 'work',
    project: 'work',
    projects: 'work',
    service: 'service',
    services: 'service',
    order: 'order',
    orders: 'order',
    task: 'order',
    tasks: 'order',
  };

  return {
    type: typeAliases[req.params.targetType],
    id: Number.parseInt(req.params.targetId, 10),
  };
};

const ensureTargetExists = async (type, id) => {
  const tableByType = { work: 'works', service: 'services', order: 'orders' };
  const table = tableByType[type];
  if (!table || !Number.isInteger(id) || id <= 0) return false;

  const result = await db.query(`SELECT id FROM ${table} WHERE id = $1 LIMIT 1`, [id]);
  return result.rows.length > 0;
};

const reportContent = async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/auth');
  }

  const target = getReportTarget(req);
  const reasonValuesRaw = [
    ...(Array.isArray(req.body.reason_codes) ? req.body.reason_codes : [req.body.reason_codes]),
    ...(Array.isArray(req.body.reason_ids) ? req.body.reason_ids : [req.body.reason_ids]),
    req.body.reason,
  ];
  const reasonValues = [...new Set(reasonValuesRaw.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];

  try {
    await ensureComplaintSchema();

    if (!target.type || !await ensureTargetExists(target.type, target.id)) {
      return res.status(404).json({ error: 'Объект жалобы не найден' });
    }

    if (reasonValues.length === 0) {
      return res.status(400).json({ error: 'Выберите минимум одну причину жалобы' });
    }

    const reasonIds = [];
    for (const value of reasonValues) {
      const reasonId = await getComplaintReasonId(value);
      if (reasonId) reasonIds.push(reasonId);
    }
    const filteredReasonIds = [...new Set(reasonIds)];

    if (filteredReasonIds.length === 0) {
      return res.status(400).json({ error: 'Выбранные причины жалобы недоступны' });
    }

    for (const reasonId of filteredReasonIds) {
      await db.query(`
        INSERT INTO complaints (sender_id, work_id, service_id, order_id, target_type, reason_id, details, status)
        VALUES ($1, $2, $3, $4, $5, $6, NULL, 'pending')
      `, [
        req.session.user.id,
        target.type === 'work' ? target.id : null,
        target.type === 'service' ? target.id : null,
        target.type === 'order' ? target.id : null,
        target.type,
        reasonId,
      ]);
    }

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true });
    }

    return res.redirect('back');
  } catch (error) {
    console.error('Error reporting content:', error);
    return res.status(500).json({ error: 'Ошибка при отправке жалобы' });
  }
};

const reportWork = reportContent;

const deleteWork = async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const workId = parseInt(req.params.workId, 10);
  if (!Number.isInteger(workId) || workId <= 0) {
    return res.status(400).json({ error: 'Некорректный идентификатор работы' });
  }

  try {
    const workResult = await db.query(
      `SELECT id FROM works WHERE id = $1 AND user_id = $2`,
      [workId, req.session.user.id]
    );

    if (!workResult.rows.length) {
      return res.status(404).json({ error: 'Работа не найдена или у вас нет прав на удаление' });
    }

    const imagesResult = await db.query(
      `SELECT image_url FROM work_images WHERE work_id = $1`,
      [workId]
    );

    await db.query(`DELETE FROM works WHERE id = $1`, [workId]);

    for (const row of imagesResult.rows) {
      const imageUrl = typeof row.image_url === 'string' ? row.image_url.trim() : '';
      if (!imageUrl || !imageUrl.startsWith('/uploads/')) continue;
      const imagePath = path.join(uploadDir, path.basename(imageUrl));
      try {
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      } catch (unlinkError) {
        console.error('Failed to delete work image:', unlinkError);
      }
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Error deleting work:', error);
    return res.status(500).json({ error: 'Ошибка при удалении работы' });
  }
};

const updateWork = async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  const workId = parseInt(req.params.workId, 10);
  if (!Number.isInteger(workId) || workId <= 0) return res.status(400).json({ error: 'Некорректный идентификатор работы' });

  const { title, description, categories, existingImages } = req.body;
  const normalizedDescription = typeof description === 'string' ? description : '';
  const uploadedImages = Array.isArray(req.files)
    ? req.files.map((file) => (file?.filename ? `/uploads/${file.filename}` : null)).filter(Boolean)
    : [];
  const keepImages = Array.isArray(existingImages) ? existingImages : (existingImages ? [existingImages] : []);
  const imageUrls = [...keepImages, ...uploadedImages];

  if (normalizedDescription.length > TEXTAREA_MAX_LENGTH) return res.status(400).json({ error: `Описание не должно превышать ${TEXTAREA_MAX_LENGTH} символов` });
  if (imageUrls.length === 0) return res.status(400).json({ error: 'Добавьте хотя бы одно изображение' });
  if (imageUrls.length > MAX_WORK_IMAGES) return res.status(400).json({ error: `Можно загрузить не более ${MAX_WORK_IMAGES} изображений` });

  try {
    const ownWork = await db.query(`SELECT id FROM works WHERE id = $1 AND user_id = $2`, [workId, req.session.user.id]);
    if (!ownWork.rows.length) return res.status(404).json({ error: 'Работа не найдена' });

    const selectedCategories = Array.isArray(categories) ? categories : (categories ? [categories] : []);
    const uniqueCategoryIds = [...new Set(selectedCategories.map((id) => parseInt(id, 10)).filter(Number.isInteger))];
    if (uniqueCategoryIds.length > 8) return res.status(400).json({ error: 'Можно выбрать не более 8 подкатегорий' });

    await db.query(`UPDATE works SET title = $1, description = $2 WHERE id = $3`, [title, normalizedDescription, workId]);
    await db.query(`DELETE FROM work_categories WHERE work_id = $1`, [workId]);
    await db.query(`DELETE FROM work_images WHERE work_id = $1`, [workId]);

    for (const categoryId of uniqueCategoryIds) {
      await db.query(`INSERT INTO work_categories (work_id, category_id) VALUES ($1, $2)`, [workId, categoryId]);
    }
    for (let i = 0; i < imageUrls.length; i++) {
      await db.query(`INSERT INTO work_images (work_id, image_url, sort_order) VALUES ($1, $2, $3)`, [workId, imageUrls[i], i]);
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('Error updating work:', error);
    return res.status(500).json({ error: 'Ошибка при редактировании работы' });
  }
};

module.exports = {
  createWork,
  reportWork,
  reportContent,
  REPORT_REASONS,
  deleteWork,
  updateWork,
};
