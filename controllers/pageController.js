const db = require('../config/database');
const { ensureOrdersTable, ensureOrderStagesTable } = require('./orderController');
const { ensureDealTables } = require('./dealController');
const { ensureReviewModerationColumns } = require('../utils/reviewModeration');
const { isAdmin } = require('../middleware/adminMiddleware');

const normalizeStageDate = (value) => {
  if (!value) {
    return '';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
};

const normalizeStageForSummary = (stage, index = 0) => ({
  id: Number.parseInt(stage?.id, 10) || null,
  name: String(stage?.name || stage?.title || '').trim(),
  deadline: normalizeStageDate(stage?.deadline),
  completed: stage?.completed === true || stage?.completed === 'true',
  sort_order: Number.isFinite(Number(stage?.sort_order)) ? Number(stage.sort_order) : index,
});

const parseProposedStages = (stages) => {
  if (Array.isArray(stages)) {
    return stages;
  }

  if (typeof stages === 'string') {
    try {
      const parsed = JSON.parse(stages);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  return [];
};

const buildStageChangeSummary = (currentStages = [], proposedStages = []) => {
  const current = currentStages.map(normalizeStageForSummary);
  const proposed = parseProposedStages(proposedStages).map(normalizeStageForSummary);
  const currentById = new Map(current.filter(stage => stage.id).map(stage => [stage.id, stage]));
  const proposedIds = new Set(proposed.filter(stage => stage.id).map(stage => stage.id));

  const added = proposed.filter(stage => !stage.id || !currentById.has(stage.id));
  const changed = proposed.filter(stage => {
    const existing = stage.id ? currentById.get(stage.id) : null;
    return existing && (existing.name !== stage.name || existing.deadline !== stage.deadline);
  });
  const removed = current.filter(stage => stage.id && !proposedIds.has(stage.id));

  return {
    proposed,
    added,
    changed,
    removed,
    hasDiff: added.length > 0 || changed.length > 0 || removed.length > 0,
  };
};

const getIndexPage = async (req, res) => {
  try {

    const recentWorks = await db.query(`
      SELECT
        w.id,
        w.user_id,
        w.title,
        COALESCE(wi.image_url, '/img/ab934e72b62ae5df2cfc9b2102b0e228.jpg') AS preview_image,
        u.first_name,
        u.last_name
      FROM works w
      JOIN users u ON w.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT image_url
        FROM work_images
        WHERE work_id = w.id
          AND image_url IS NOT NULL
          AND BTRIM(image_url) <> ''
        ORDER BY COALESCE(sort_order, 0), id
        LIMIT 1
      ) wi ON TRUE
      WHERE w.status = 'active'
      ORDER BY w.created_at DESC
      LIMIT 30
    `);

    res.render('index', {
      recentWorks: recentWorks.rows,
    });
  } catch (error) {
    console.error('Error loading index page:', error);
    res.render('index', { recentWorks: [] });
  }
};

const getLentaPage = async (req, res) => {
  try {
    const currentUserId = req.session.user?.id || null;
    const searchQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const searchPattern = searchQuery ? `%${searchQuery}%` : null;

    await db.query(`
      CREATE TABLE IF NOT EXISTS work_likes (
        work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (work_id, user_id)
      )
    `);


    const works = await db.query(`
      SELECT
        w.*,
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.avatar,
        COALESCE((
          SELECT ARRAY_AGG(wi.image_url ORDER BY COALESCE(wi.sort_order, 0), wi.id)
          FROM work_images wi
          WHERE wi.work_id = w.id
            AND wi.image_url IS NOT NULL
            AND BTRIM(wi.image_url) <> ''
        ), ARRAY[]::text[]) as images,
        COALESCE((
          SELECT ARRAY_AGG(DISTINCT c.name ORDER BY c.name)
          FROM work_categories wc
          JOIN categories c ON c.id = wc.category_id
          WHERE wc.work_id = w.id
            AND c.name IS NOT NULL
        ), ARRAY[]::text[]) as categories,
        COALESCE((
          SELECT ARRAY_AGG(DISTINCT c.id ORDER BY c.id)
          FROM work_categories wc
          JOIN categories c ON c.id = wc.category_id
          WHERE wc.work_id = w.id
        ), ARRAY[]::integer[]) as category_ids,
        COALESCE((
          SELECT TRUE
          FROM work_likes wl
          WHERE wl.work_id = w.id AND wl.user_id = $1
          LIMIT 1
        ), FALSE) as is_liked,
        COALESCE((
          SELECT TRUE
          FROM subscriptions s
          WHERE s.follower_id = $1 AND s.followed_id = u.id
          LIMIT 1
        ), FALSE) as is_subscribed
      FROM works w
      JOIN users u ON w.user_id = u.id
      WHERE w.status = 'active'
        AND (
          $2::text IS NULL
          OR w.title ILIKE $2
          OR u.first_name ILIKE $2
          OR u.last_name ILIKE $2
          OR CONCAT_WS(' ', u.first_name, u.last_name) ILIKE $2
          OR EXISTS (
            SELECT 1
            FROM work_categories wc_filter
            JOIN categories c_filter ON c_filter.id = wc_filter.category_id
            LEFT JOIN categories parent_c ON parent_c.id = c_filter.parent_id
            WHERE wc_filter.work_id = w.id
              AND (
                c_filter.name ILIKE $2
                OR parent_c.name ILIKE $2
              )
          )
        )
      ORDER BY w.created_at DESC
    `, [currentUserId, searchPattern]);


    const categories = await db.query(`
      SELECT * FROM categories WHERE parent_id IS NULL
    `);


    const subcategories = await db.query(`
      SELECT * FROM categories WHERE parent_id IS NOT NULL
    `);

    await db.query(`
      ALTER TABLE complaint_reasons
      ADD COLUMN IF NOT EXISTS description TEXT
    `);

    const complaintReasons = await db.query(`
      SELECT id, name, description
      FROM complaint_reasons
      ORDER BY name ASC
    `);

    res.render('lenta_new', {
      works: works.rows,
      categories: categories.rows,
      subcategories: subcategories.rows,
      complaintReasons: complaintReasons.rows,
      currentUser: req.session.user || null,
      csrfToken: req.session?.csrfToken || '',
    });
  } catch (error) {
    console.error('Error loading lenta page:', error);
    res.render('lenta_new', {
      works: [],
      categories: [],
      subcategories: [],
      complaintReasons: [],
      currentUser: req.session.user || null,
      csrfToken: req.session?.csrfToken || '',
    });
  }
};


const getBirzhaPage = async (req, res) => {
  try {
    await ensureOrdersTable(db);

    await db.query(`
      CREATE TABLE IF NOT EXISTS order_categories (
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        PRIMARY KEY (order_id, category_id)
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS service_categories (
        service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        PRIMARY KEY (service_id, category_id)
      )
    `);

    const serviceColumnsResult = await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'services'
    `);
    const serviceColumns = new Set(serviceColumnsResult.rows.map((row) => row.column_name));

    const serviceOwnerExpr = serviceColumns.has('user_id') && serviceColumns.has('provider_id')
      ? 'COALESCE(s.user_id, s.provider_id)'
      : serviceColumns.has('user_id')
        ? 's.user_id'
        : serviceColumns.has('provider_id')
          ? 's.provider_id'
          : 'NULL';
    const servicePriceFromExpr = serviceColumns.has('price_from')
      ? 's.price_from'
      : serviceColumns.has('price')
        ? 's.price'
        : '0';
    const servicePriceToExpr = serviceColumns.has('price_to')
      ? 's.price_to'
      : servicePriceFromExpr;
    const serviceCoverExpr = serviceColumns.has('cover_image') ? 's.cover_image' : 'NULL';
    const serviceRatingExpr = serviceColumns.has('avg_rating') ? 's.avg_rating' : '0';
    const serviceCatalogOnly = serviceColumns.has('source_order_id') ? 'AND s.source_order_id IS NULL' : '';
    const serviceActiveOnly = serviceColumns.has('status') ? `AND COALESCE(s.status, 'active') = 'active'` : '';
    const legacyServiceCategorySelect = serviceColumns.has('category_id')
      ? `UNION SELECT s_legacy.category_id FROM services s_legacy WHERE s_legacy.id = s.id AND s_legacy.category_id IS NOT NULL`
      : '';

    const [servicesResult, ordersResult, categoriesResult, subcategoriesResult] = await Promise.all([
      db.query(`
        SELECT
          s.*,
          ${servicePriceFromExpr} AS price_from,
          ${servicePriceToExpr} AS price_to,
          ${serviceCoverExpr} AS cover_image,
          ${serviceRatingExpr} AS avg_rating,
          COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), 'Не указан') AS provider_name,
          COALESCE((
            SELECT ARRAY_AGG(category_id ORDER BY category_id)
            FROM (
              SELECT sc.category_id
              FROM service_categories sc
              WHERE sc.service_id = s.id
              ${legacyServiceCategorySelect}
            ) service_category_ids
          ), ARRAY[]::integer[]) AS category_ids
        FROM services s
        LEFT JOIN users u ON u.id = ${serviceOwnerExpr}
        WHERE TRUE
          ${serviceCatalogOnly}
          ${serviceActiveOnly}
        ORDER BY s.created_at DESC
      `),
      db.query(`
        SELECT
          o.*,
          COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), 'Не указан') AS customer_name,
          COALESCE((
            SELECT ARRAY_AGG(oc.category_id ORDER BY oc.category_id)
            FROM order_categories oc
            WHERE oc.order_id = o.id
          ), ARRAY[]::integer[]) AS category_ids
        FROM orders o
        LEFT JOIN users u ON u.id = o.customer_id
        WHERE COALESCE(o.status, 'active') = 'active'
        ORDER BY o.created_at DESC
      `),
      db.query(`SELECT * FROM categories WHERE parent_id IS NULL ORDER BY name`),
      db.query(`SELECT * FROM categories WHERE parent_id IS NOT NULL ORDER BY name`),
    ]);

    return res.render('birzha', {
      services: servicesResult.rows,
      orders: ordersResult.rows,
      categories: categoriesResult.rows,
      subcategories: subcategoriesResult.rows,
      csrfToken: req.session?.csrfToken || '',
    });
  } catch (error) {
    console.error('Error loading birzha page:', error);
    return res.render('birzha', {
      services: [],
      orders: [],
      categories: [],
      subcategories: [],
      csrfToken: req.session?.csrfToken || '',
    });
  }
};

const getProfilePage = async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/auth');
  }

  try {
    const userId = req.params.id || req.session.user.id;
    const currentUserId = req.session.user?.id || null;

    await db.query(`
      CREATE TABLE IF NOT EXISTS work_likes (
        work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (work_id, user_id)
      )
    `);

    await ensureReviewModerationColumns();

    const userResult = await db.query(`
      SELECT
        u.*,
        r.name as role_name,
        COALESCE((
          SELECT AVG(rating) FROM user_reviews WHERE reviewed_user_id = u.id AND status = 'approved'
        ), 0) as avg_rating,
        COALESCE((
          SELECT COUNT(*) FROM user_reviews WHERE reviewed_user_id = u.id AND status = 'approved'
        ), 0) as total_reviews
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).send('Пользователь не найден');
    }

    const user = userResult.rows[0];


    const works = await db.query(`
      SELECT w.*,
             COALESCE(
               ARRAY_AGG(DISTINCT wi.image_url) FILTER (
                 WHERE wi.image_url IS NOT NULL AND BTRIM(wi.image_url) <> ''
               ),
               ARRAY[]::text[]
             ) as images,
             COALESCE(
               ARRAY_AGG(DISTINCT c.name ORDER BY c.name) FILTER (
                 WHERE c.name IS NOT NULL
               ),
               ARRAY[]::text[]
             ) as categories,
             COALESCE((
               SELECT TRUE
               FROM work_likes wl
               WHERE wl.work_id = w.id AND wl.user_id = $2
               LIMIT 1
             ), FALSE) as is_liked
      FROM works w
      LEFT JOIN work_images wi ON w.id = wi.work_id
      LEFT JOIN work_categories wc ON w.id = wc.work_id
      LEFT JOIN categories c ON wc.category_id = c.id
      WHERE w.user_id = $1 AND w.status = 'active'
      GROUP BY w.id
      ORDER BY w.created_at DESC
    `, [userId, currentUserId]);

    await ensureOrdersTable(db);
    await ensureOrderStagesTable(db);

    const deals = await db.query(`
      SELECT
        o.id,
        o.title,
        o.price,
        o.status,
        o.deadline,
        o.created_at,
        o.customer_id,
        o.executor_id,
        c.first_name AS customer_first_name,
        c.last_name AS customer_last_name,
        e.first_name AS executor_first_name,
        e.last_name AS executor_last_name,
        COALESCE(stage_counts.total_stages, 0)::int AS total_stages,
        COALESCE(stage_counts.completed_stages, 0)::int AS completed_stages
      FROM orders o
      LEFT JOIN users c ON c.id = o.customer_id
      LEFT JOIN users e ON e.id = o.executor_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS total_stages,
          COUNT(*) FILTER (WHERE completed) AS completed_stages
        FROM order_stages os
        WHERE os.order_id = o.id
      ) stage_counts ON TRUE
      WHERE o.customer_id = $1 OR o.executor_id = $1
      ORDER BY o.created_at DESC
      LIMIT 2
    `, [userId]);

    const reviews = await db.query(`
      SELECT
        ur.rating,
        ur.comment,
        ur.created_at,
        u.id AS reviewer_id,
        u.first_name,
        u.last_name,
        u.avatar
      FROM user_reviews ur
      JOIN users u ON u.id = ur.reviewer_id
      WHERE ur.reviewed_user_id = $1
        AND ur.status = 'approved'
      ORDER BY ur.created_at DESC
      LIMIT 2
    `, [userId]);

    let pendingWorks = { rows: [] };
    if (req.session.user && req.session.user.id === parseInt(userId, 10)) {
      pendingWorks = await db.query(`
        SELECT w.*,
               COALESCE(
                 ARRAY_AGG(DISTINCT wi.image_url) FILTER (
                   WHERE wi.image_url IS NOT NULL AND BTRIM(wi.image_url) <> ''
                 ),
                 ARRAY[]::text[]
               ) as images,
               COALESCE(
                 ARRAY_AGG(DISTINCT c.name ORDER BY c.name) FILTER (
                   WHERE c.name IS NOT NULL
                 ),
                 ARRAY[]::text[]
               ) as categories
        FROM works w
        LEFT JOIN work_images wi ON w.id = wi.work_id
        LEFT JOIN work_categories wc ON w.id = wc.work_id
        LEFT JOIN categories c ON wc.category_id = c.id
        WHERE w.user_id = $1 AND w.status = 'pending'
        GROUP BY w.id
        ORDER BY w.created_at DESC
      `, [userId]);
    }


    const followers = await db.query(`
      SELECT COUNT(*) as count FROM subscriptions WHERE followed_id = $1
    `, [userId]);


    let isSubscribed = false;
    if (req.session.user && req.session.user.id !== parseInt(userId)) {
      const subResult = await db.query(`
        SELECT EXISTS(SELECT 1 FROM subscriptions WHERE follower_id = $1 AND followed_id = $2)
      `, [req.session.user.id, userId]);
      isSubscribed = subResult.rows[0].exists;
    }

    res.render('profile', {
      profileUser: user,
      works: works.rows,
      deals: deals.rows,
      reviews: reviews.rows,
      pendingWorks: pendingWorks.rows,
      followersCount: followers.rows[0].count,
      isSubscribed,
      isOwnProfile: req.session.user && req.session.user.id === parseInt(userId),
      profileUpdated: req.query.profile_updated === '1',
      workCreated: req.query.work_created === '1',
      workUpdated: req.query.work_updated === '1',
    });
  } catch (error) {
    console.error('Error loading profile:', error);
    res.status(500).send('Ошибка загрузки профиля');
  }
};





const getReviewPage = async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/auth');
  }

  const reviewedUserId = parseInt(req.params.id, 10);
  const currentUserId = req.session.user.id;

  if (!Number.isInteger(reviewedUserId) || reviewedUserId <= 0) {
    return res.status(404).send('Пользователь не найден');
  }

  try {
    await ensureReviewModerationColumns();

    const userResult = await db.query(`
      SELECT
        u.*,
        COALESCE((SELECT AVG(rating) FROM user_reviews WHERE reviewed_user_id = u.id AND status = 'approved'), 0) AS avg_rating
      FROM users u
      WHERE u.id = $1
    `, [reviewedUserId]);

    if (userResult.rows.length === 0) {
      return res.status(404).send('Пользователь не найден');
    }

    const [followersResult, worksResult, reviewsResult, existingReviewResult] = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS count FROM subscriptions WHERE followed_id = $1`, [reviewedUserId]),
      db.query(`SELECT COUNT(*)::int AS count FROM works WHERE user_id = $1 AND status = 'active'`, [reviewedUserId]),
      db.query(`
        SELECT
          ur.rating,
          ur.comment,
          ur.created_at,
          u.id AS reviewer_id,
          u.first_name,
          u.last_name,
          u.avatar
        FROM user_reviews ur
        JOIN users u ON u.id = ur.reviewer_id
        WHERE ur.reviewed_user_id = $1
          AND ur.status = 'approved'
        ORDER BY ur.created_at DESC
      `, [reviewedUserId]),
      db.query(`
        SELECT rating, comment, created_at
        FROM user_reviews
        WHERE reviewer_id = $1 AND reviewed_user_id = $2
        LIMIT 1
      `, [currentUserId, reviewedUserId]),
    ]);

    const existingReview = existingReviewResult.rows[0] || null;

    return res.render('review', {
      reviewedUser: userResult.rows[0],
      followersCount: followersResult.rows[0]?.count || 0,
      worksCount: worksResult.rows[0]?.count || 0,
      reviews: reviewsResult.rows,
      hasReview: Boolean(existingReview),
      existingReview,
      isOwnProfile: currentUserId === reviewedUserId,
      csrfToken: req.session?.csrfToken || '',
    });
  } catch (error) {
    console.error('Error loading review page:', error);
    return res.status(500).send('Ошибка загрузки отзывов');
  }
};

const getPortfolioPage = async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/auth');
  }

  try {
    const userId = req.params.id ? parseInt(req.params.id, 10) : req.session.user.id;
    const currentUserId = req.session.user.id;
    const isOwnProfile = userId === currentUserId;

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(404).send('Пользователь не найден');
    }

    const userResult = await db.query(
      `SELECT id, first_name, last_name, avatar FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).send('Пользователь не найден');
    }

    const portfolioUser = userResult.rows[0];

    await db.query(`
      CREATE TABLE IF NOT EXISTS work_likes (
        work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (work_id, user_id)
      )
    `);

    const [activeWorks, pendingWorks] = await Promise.all([
      db.query(`
        SELECT w.id, w.title, w.description, w.created_at, COALESCE(w.likes, 0) AS likes,
               COALESCE((
                 SELECT ARRAY_AGG(wi.image_url ORDER BY COALESCE(wi.sort_order, 0), wi.id)
                 FROM work_images wi
                 WHERE wi.work_id = w.id
                   AND wi.image_url IS NOT NULL
                   AND BTRIM(wi.image_url) <> ''
               ), ARRAY[]::text[]) AS images,
               COALESCE((
                 SELECT TRUE
                 FROM work_likes wl
                 WHERE wl.work_id = w.id AND wl.user_id = $2
                 LIMIT 1
               ), FALSE) AS is_liked
        FROM works w
        WHERE w.user_id = $1 AND w.status = 'active'
        ORDER BY w.created_at DESC
      `, [userId, currentUserId]),
      isOwnProfile ? db.query(`
        SELECT w.id, w.title, w.created_at
        FROM works w
        WHERE w.user_id = $1 AND w.status = 'pending'
        ORDER BY w.created_at DESC
      `, [userId]) : Promise.resolve({ rows: [] }),
    ]);

    return res.render('portfolio', {
      activeWorks: activeWorks.rows,
      pendingWorks: pendingWorks.rows,
      portfolioUser,
      isOwnProfile,
      csrfToken: req.session.csrfToken || '',
      profileUpdated: req.query.profile_updated === '1',
      workCreated: req.query.work_created === '1',
      workUpdated: req.query.work_updated === '1',
    });
  } catch (error) {
    console.error('Error loading portfolio page:', error);
    return res.status(500).send('Ошибка загрузки портфолио');
  }
};

const getSubscriptionsPage = async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/auth');
  }

  try {
    const currentUserId = req.session.user.id;
    const searchQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const activeTab = req.query.tab === 'followers' ? 'followers' : 'following';
    const searchPattern = searchQuery ? `%${searchQuery}%` : null;

    const followingQuery = db.query(`
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.avatar,
        u.bio
      FROM subscriptions s
      JOIN users u ON u.id = s.followed_id
      WHERE s.follower_id = $1
        AND (
          $2::text IS NULL
          OR u.first_name ILIKE $2
          OR u.last_name ILIKE $2
          OR CONCAT_WS(' ', u.first_name, u.last_name) ILIKE $2
          OR u.email ILIKE $2
        )
      ORDER BY u.first_name ASC, u.last_name ASC
    `, [currentUserId, searchPattern]);

    const followersQuery = db.query(`
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.avatar,
        u.bio
      FROM subscriptions s
      JOIN users u ON u.id = s.follower_id
      WHERE s.followed_id = $1
        AND (
          $2::text IS NULL
          OR u.first_name ILIKE $2
          OR u.last_name ILIKE $2
          OR CONCAT_WS(' ', u.first_name, u.last_name) ILIKE $2
          OR u.email ILIKE $2
        )
      ORDER BY u.first_name ASC, u.last_name ASC
    `, [currentUserId, searchPattern]);

    const [followingResult, followersResult] = await Promise.all([followingQuery, followersQuery]);

    return res.render('subscriptions', {
      followingUsers: followingResult.rows,
      followerUsers: followersResult.rows,
      searchQuery,
      activeTab,
    });
  } catch (error) {
    console.error('Error loading subscriptions page:', error);
    return res.status(500).send('Ошибка загрузки страницы подписок');
  }
};

const getCreateWorkPage = async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/auth');
  }

  try {
    const categories = await db.query(`
      SELECT * FROM categories WHERE parent_id IS NULL ORDER BY name
    `);

    const subcategories = await db.query(`
      SELECT * FROM categories WHERE parent_id IS NOT NULL ORDER BY name
    `);

    res.render('create-work', {
      categories: categories.rows,
      subcategories: subcategories.rows,
      isEditMode: false,
      editWork: null,
    });
  } catch (error) {
    console.error('Error loading create work page:', error);
    res.status(500).send('Ошибка загрузки страницы создания работы');
  }
};

const getEditWorkPage = async (req, res) => {
  if (!req.session.user) return res.redirect('/auth');
  const workId = parseInt(req.params.workId, 10);
  if (!Number.isInteger(workId) || workId <= 0) return res.status(404).send('Работа не найдена');
  try {
    const [categories, subcategories, workResult] = await Promise.all([
      db.query(`SELECT * FROM categories WHERE parent_id IS NULL ORDER BY name`),
      db.query(`SELECT * FROM categories WHERE parent_id IS NOT NULL ORDER BY name`),
      db.query(`
        SELECT w.*,
               COALESCE((SELECT ARRAY_AGG(category_id ORDER BY category_id) FROM work_categories WHERE work_id = w.id), ARRAY[]::integer[]) AS category_ids,
               COALESCE((SELECT ARRAY_AGG(image_url ORDER BY COALESCE(sort_order, 0), id) FROM work_images WHERE work_id = w.id), ARRAY[]::text[]) AS images
        FROM works w
        WHERE w.id = $1 AND w.user_id = $2
      `, [workId, req.session.user.id]),
    ]);
    if (!workResult.rows.length) return res.status(404).send('Работа не найдена');
    return res.render('create-work', {
      categories: categories.rows,
      subcategories: subcategories.rows,
      isEditMode: true,
      editWork: workResult.rows[0],
    });
  } catch (error) {
    console.error('Error loading edit work page:', error);
    return res.status(500).send('Ошибка загрузки страницы редактирования работы');
  }
};

const getWorkPage = async (req, res) => {
  const workId = parseInt(req.params.id, 10);

  if (!Number.isInteger(workId) || workId <= 0) {
    return res.status(404).send('Работа не найдена');
  }

  try {
    const currentUserId = req.session.user?.id || null;
    const adminCheck = currentUserId ? await isAdmin(currentUserId) : false;

    await db.query(`
      CREATE TABLE IF NOT EXISTS work_likes (
        work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (work_id, user_id)
      )
    `);

    const workResult = await db.query(`
      SELECT
        w.*,
        u.id AS user_id,
        u.first_name,
        u.last_name,
        u.avatar,
        COALESCE((
          SELECT ARRAY_AGG(wi.image_url ORDER BY COALESCE(wi.sort_order, 0), wi.id)
          FROM work_images wi
          WHERE wi.work_id = w.id
            AND wi.image_url IS NOT NULL
            AND BTRIM(wi.image_url) <> ''
        ), ARRAY[]::text[]) AS images,
        COALESCE((
          SELECT ARRAY_AGG(DISTINCT c.name ORDER BY c.name)
          FROM work_categories wc
          JOIN categories c ON c.id = wc.category_id
          WHERE wc.work_id = w.id
            AND c.name IS NOT NULL
        ), ARRAY[]::text[]) AS categories,
        COALESCE((
          SELECT TRUE
          FROM work_likes wl
          WHERE wl.work_id = w.id AND wl.user_id = $2
          LIMIT 1
        ), FALSE) AS is_liked
      FROM works w
      JOIN users u ON u.id = w.user_id
      WHERE w.id = $1
        AND (
          $3::boolean = true
          OR w.status = 'active'
          OR (w.status = 'pending' AND $2::int = w.user_id)
        )
      LIMIT 1
    `, [workId, currentUserId, adminCheck]);

    if (workResult.rows.length === 0) {
      return res.status(404).send('Работа не найдена');
    }

    res.render('work', {
      work: workResult.rows[0],
      isAdmin: adminCheck,
      csrfToken: req.session?.csrfToken || '',
    });
  } catch (error) {
    console.error('Error loading work page:', error);
    res.status(500).send('Ошибка загрузки работы');
  }
};


const getDealsPage = async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/auth');
  }

  const userId = req.session.user.id;
  const allowedStatuses = ['active', 'in_progress', 'completed', 'cancelled'];
  const currentStatus = allowedStatuses.includes(req.query.status) ? req.query.status : 'all';

  try {
    await ensureOrderStagesTable(db);

    const statusClause = currentStatus === 'all' ? '' : 'AND o.status = $2';
    const queryParams = currentStatus === 'all' ? [userId] : [userId, currentStatus];

    const dealsResult = await db.query(`
      SELECT
        o.id,
        o.title,
        o.description,
        o.price,
        o.status,
        o.deadline,
        o.created_at,
        o.completed_at,
        o.customer_id,
        o.executor_id,
        c.first_name AS customer_first_name,
        c.last_name AS customer_last_name,
        c.avatar AS customer_avatar,
        e.first_name AS executor_first_name,
        e.last_name AS executor_last_name,
        e.avatar AS executor_avatar,
        COALESCE(stage_counts.total_stages, 0)::int AS total_stages,
        COALESCE(stage_counts.completed_stages, 0)::int AS completed_stages
      FROM orders o
      LEFT JOIN users c ON c.id = o.customer_id
      LEFT JOIN users e ON e.id = o.executor_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS total_stages,
          COUNT(*) FILTER (WHERE completed) AS completed_stages
        FROM order_stages os
        WHERE os.order_id = o.id
      ) stage_counts ON TRUE
      WHERE (o.customer_id = $1 OR o.executor_id = $1)
      ${statusClause}
      ORDER BY o.created_at DESC
    `, queryParams);

    const statusCountsResult = await db.query(`
      SELECT status, COUNT(*)::int AS count
      FROM orders
      WHERE customer_id = $1 OR executor_id = $1
      GROUP BY status
    `, [userId]);

    const statusCounts = statusCountsResult.rows.reduce((acc, row) => {
      acc[row.status] = row.count;
      acc.all += row.count;
      return acc;
    }, { all: 0, active: 0, in_progress: 0, completed: 0, cancelled: 0 });

    return res.render('deals', {
      deals: dealsResult.rows,
      currentStatus,
      statusCounts,
      currentUser: req.session.user,
    });
  } catch (error) {
    console.error('Error loading deals page:', error);
    return res.status(500).send('Ошибка загрузки сделок');
  }
};

const getOrdersPage = async (req, res) => {
  try {
    const [categories, subcategories] = await Promise.all([
      db.query(`SELECT * FROM categories WHERE parent_id IS NULL ORDER BY name`),
      db.query(`SELECT * FROM categories WHERE parent_id IS NOT NULL ORDER BY name`),
    ]);
    res.render('orders', {
      orderCreated: req.query.order_created === '1',
      categories: categories.rows,
      subcategories: subcategories.rows,
    });
  } catch (error) {
    console.error('Error loading orders page:', error);
    res.render('orders', {
      orderCreated: req.query.order_created === '1',
      categories: [],
      subcategories: [],
      csrfToken: req.session?.csrfToken || '',
    });
  }
};

const getCreateOrderPage = async (_req, res) => {
  try {
    const [categories, subcategories] = await Promise.all([
      db.query(`SELECT * FROM categories WHERE parent_id IS NULL ORDER BY name`),
      db.query(`SELECT * FROM categories WHERE parent_id IS NOT NULL ORDER BY name`),
    ]);
    return res.render('create-order', {
      categories: categories.rows,
      subcategories: subcategories.rows,
    });
  } catch (error) {
    console.error('Error loading create order page:', error);
    return res.render('create-order', { categories: [], subcategories: [] });
  }
};

const getServicesPage = async (req, res) => {
  try {
    const userId = req.session.user.id;

    const providerColumnResult = await db.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'services' AND column_name = 'provider_id'
      ) AS exists
    `);

    const sourceOrderColumnResult = await db.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'services' AND column_name = 'source_order_id'
      ) AS exists
    `);

    const hasProviderId = Boolean(providerColumnResult.rows[0]?.exists);
    const hasSourceOrderId = Boolean(sourceOrderColumnResult.rows[0]?.exists);
    const ownerExpr = hasProviderId ? 'COALESCE(s.user_id, s.provider_id)' : 's.user_id';
    const ownServicesOnly = hasSourceOrderId ? 'AND s.source_order_id IS NULL' : '';
    const catalogServicesOnly = hasSourceOrderId ? 'WHERE s.source_order_id IS NULL' : '';

    const [myServicesResult, allServicesResult, categoriesResult, subcategoriesResult] = await Promise.all([
      db.query(`
        SELECT s.*, COALESCE(ARRAY[]::text[], ARRAY[]::text[]) AS categories
        FROM services s
        WHERE ${ownerExpr} = $1 ${ownServicesOnly}
        ORDER BY s.created_at DESC
      `, [userId]),
      db.query(`
        SELECT
          s.*,
          u.first_name,
          u.last_name,
          u.avatar,
          COALESCE(ARRAY[]::text[], ARRAY[]::text[]) AS categories,
          COALESCE(ARRAY[]::integer[], ARRAY[]::integer[]) AS category_ids
        FROM services s
        LEFT JOIN users u ON u.id = ${ownerExpr}
        ${catalogServicesOnly}
        ORDER BY s.created_at DESC
      `),
      db.query(`SELECT * FROM categories WHERE parent_id IS NULL ORDER BY name`),
      db.query(`SELECT * FROM categories WHERE parent_id IS NOT NULL ORDER BY name`),
    ]);

    return res.render('services', {
      myServices: myServicesResult.rows,
      allServices: allServicesResult.rows,
      serviceCreated: req.query.service_created === '1',
      categories: categoriesResult.rows,
      subcategories: subcategoriesResult.rows,
      csrfToken: req.session?.csrfToken || '',
    });
  } catch (error) {
    console.error('Error loading services page:', error);
    return res.render('services', {
      myServices: [],
      allServices: [],
      serviceCreated: false,
      categories: [],
      subcategories: [],
    });
  }
};

const getCreateServicePage = async (_req, res) => {
  try {
    const [categories, subcategories] = await Promise.all([
      db.query(`SELECT * FROM categories WHERE parent_id IS NULL ORDER BY name`),
      db.query(`SELECT * FROM categories WHERE parent_id IS NOT NULL ORDER BY name`),
    ]);

    return res.render('create-service', {
      categories: categories.rows,
      subcategories: subcategories.rows,
    });
  } catch (error) {
    console.error('Error loading create service page:', error);
    return res.status(500).send('Ошибка загрузки страницы добавления услуги');
  }
};

const getServicePage = async (req, res) => {
  try {
    const serviceId = parseInt(req.params.id, 10);
    if (!Number.isInteger(serviceId) || serviceId <= 0) {
      return res.status(404).send('Услуга не найдена');
    }

    const providerColumnResult = await db.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'services' AND column_name = 'provider_id'
      ) AS exists
    `);
    const hasProviderId = Boolean(providerColumnResult.rows[0]?.exists);
    const ownerExpr = hasProviderId ? 'COALESCE(s.user_id, s.provider_id)' : 's.user_id';

    const serviceResult = await db.query(`
      SELECT
        s.*,
        u.id AS provider_id,
        u.first_name AS provider_first_name,
        u.last_name AS provider_last_name,
        u.avatar AS provider_avatar,
        u.email AS provider_email
      FROM services s
      LEFT JOIN users u ON u.id = ${ownerExpr}
      WHERE s.id = $1
    `, [serviceId]);

    if (serviceResult.rows.length === 0) {
      return res.status(404).send('Услуга не найдена');
    }

    const service = serviceResult.rows[0];

    await db.query(`
      CREATE TABLE IF NOT EXISTS service_categories (
        service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        PRIMARY KEY (service_id, category_id)
      )
    `);

    const serviceCategoryColumnResult = await db.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'services' AND column_name = 'category_id'
      ) AS exists
    `);
    const hasServiceCategoryId = Boolean(serviceCategoryColumnResult.rows[0]?.exists);
    const legacyServiceCategoryUnion = hasServiceCategoryId
      ? `
        UNION

        SELECT s.category_id
        FROM services s
        WHERE s.id = $1 AND s.category_id IS NOT NULL
      `
      : '';

    const categoriesResult = await db.query(`
      SELECT id, name, parent_name
      FROM (
        SELECT DISTINCT
               c.id,
               c.name,
               parent.name AS parent_name,
               COALESCE(parent.name, c.name) AS sort_name
        FROM categories c
        LEFT JOIN categories parent ON parent.id = c.parent_id
        WHERE c.id IN (
          SELECT sc.category_id
          FROM service_categories sc
          WHERE sc.service_id = $1
          ${legacyServiceCategoryUnion}
        )
      ) AS selected_categories
      ORDER BY sort_name, name
    `, [serviceId]);

    await ensureReviewModerationColumns();

    const reviewsResult = await db.query(`
      SELECT sr.rating, sr.comment, sr.created_at,
             u.id as reviewer_id, u.first_name, u.last_name, u.avatar
      FROM service_reviews sr
      JOIN users u ON sr.reviewer_id = u.id
      WHERE sr.service_id = $1
        AND sr.status = 'approved'
      ORDER BY sr.created_at DESC
    `, [serviceId]);

    const currentUserId = req.session?.user?.id || null;
    const existingReviewResult = currentUserId
      ? await db.query(
          'SELECT 1 FROM service_reviews WHERE reviewer_id = $1 AND service_id = $2',
          [currentUserId, serviceId]
        )
      : null;

    const hasReview = existingReviewResult?.rows.length > 0;

    const serviceOwnerId = hasProviderId
      ? (service.provider_id ?? service.user_id)
      : service.user_id;
    const isOwner = currentUserId === serviceOwnerId;
    const isAdminUser = currentUserId ? await isAdmin(currentUserId) : false;

    return res.render('service', {
      isAdmin: isAdminUser,
      service,
      categories: categoriesResult.rows.map(r => r.name),
      subcategories: categoriesResult.rows,
      reviews: reviewsResult.rows,
      hasReview,
      isOwner,
      csrfToken: req.session?.csrfToken || '',
    });
  } catch (error) {
    console.error('Error loading service page:', error);
    return res.status(500).send('Ошибка загрузки услуги');
  }
};

const getOfferPage = (_req, res) => {
  res.render('legal/offer');
};

const getPrivacyPolicyPage = (_req, res) => {
  res.render('legal/privacy-policy');
};

const getPersonalDataConsentPage = (_req, res) => {
  res.render('legal/personal-data-consent');
};

const getMarketingConsentPage = (_req, res) => {
  res.render('legal/marketing-consent');
};

const getNotificationsPage = async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/auth');
  }

  try {
    const userId = req.session.user ? req.session.user.id : 7;

    const [userResult, followersResult, worksResult] = await Promise.all([
      db.query(`
        SELECT
          u.*,
          r.name as role_name,
          COALESCE((SELECT AVG(rating) FROM user_reviews WHERE reviewed_user_id = u.id AND status = 'approved'), 0) as avg_rating,
          COALESCE((SELECT COUNT(*) FROM user_reviews WHERE reviewed_user_id = u.id AND status = 'approved'), 0) as total_reviews
        FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE u.id = $1
      `, [userId]),
      db.query(`SELECT COUNT(*) as count FROM subscriptions WHERE followed_id = $1`, [userId]),
      db.query(`SELECT COUNT(*)::int as count FROM works WHERE user_id = $1 AND status = 'active'`, [userId]),
    ]);

    const profileUser = userResult.rows[0] || {};
    const followersCount = followersResult.rows[0]?.count || 0;
    const worksCount = worksResult.rows[0]?.count || 0;

    res.render('notifications', {
      profileUser,
      followersCount,
      worksCount,
    });
  } catch (error) {
    console.error('Error loading notifications page:', error);
    const sessionUser = req.session.user || {};
    res.render('notifications', {
      profileUser: {
        id: sessionUser.id,
        first_name: sessionUser.first_name || '',
        last_name: sessionUser.last_name || '',
        email: sessionUser.email || '',
        avatar: sessionUser.avatar || null,
        avg_rating: 0,
      },
      followersCount: 0,
      worksCount: 0,
    });
  }
};

const getBalancePage = async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/auth');
  }
  try {
    const userId = req.session.user.id;
    const balanceResult = await db.query(
      `SELECT * FROM user_balances WHERE user_id = $1`, [userId]
    );
    const balance = balanceResult.rows[0] || { balance: 0, held_balance: 0 };

    const transactionsResult = await db.query(
      `SELECT id, type, amount, status, description, created_at
       FROM payments
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );

    return res.render('balance', {
      balance: Number(balance.balance || 0),
      heldBalance: Number(balance.held_balance || 0),
      transactions: transactionsResult.rows,
      csrfToken: req.session?.csrfToken || '',
      status: req.query.status || '',
    });
  } catch (error) {
    console.error('Error loading balance page:', error);
    return res.status(500).send('Ошибка загрузки баланса');
  }
};

const getWithdrawPage = async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/auth');
  }
  return res.render('withdraw', {
    csrfToken: req.session?.csrfToken || '',
  });
};


const getDealProposalPage = async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/auth');
  }

  const proposalId = parseInt(req.params.id, 10);
  if (!Number.isInteger(proposalId) || proposalId <= 0) {
    return res.status(404).send('Предложение не найдено');
  }

  const userId = req.session.user.id;

  try {
    await ensureDealTables();

    const proposalResult = await db.query(
      `SELECT dp.*,
              s.first_name AS sender_first_name,
              s.last_name AS sender_last_name,
              s.avatar AS sender_avatar,
              r.first_name AS recipient_first_name,
              r.last_name AS recipient_last_name,
              r.avatar AS recipient_avatar
       FROM deal_proposals dp
       JOIN users s ON s.id = dp.sender_id
       JOIN users r ON r.id = dp.recipient_id
       WHERE dp.id = $1`,
      [proposalId]
    );

    if (proposalResult.rows.length === 0) {
      return res.status(404).send('Предложение не найдено');
    }

    const proposal = proposalResult.rows[0];
    if (proposal.sender_id !== userId && proposal.recipient_id !== userId) {
      return res.status(403).send('Нет доступа к предложению');
    }

    const stagesResult = await db.query(
      `SELECT *
       FROM deal_proposal_stages
       WHERE proposal_id = $1
       ORDER BY sort_order, id`,
      [proposalId]
    );

    let target = null;
    if (proposal.target_type === 'service' && proposal.target_id) {
      const targetResult = await db.query(
        `SELECT id, title, description FROM services WHERE id = $1`,
        [proposal.target_id]
      );
      target = targetResult.rows[0] || null;
    } else if (proposal.target_type === 'order' && proposal.target_id) {
      const targetResult = await db.query(
        `SELECT id, title, description FROM orders WHERE id = $1`,
        [proposal.target_id]
      );
      target = targetResult.rows[0] || null;
    }

    const acceptedMessageResult = await db.query(
      `SELECT metadata->>'order_id' AS order_id
       FROM messages
       WHERE message_type = 'deal_status'
         AND metadata->>'proposal_id' = $1
         AND metadata->>'status' = 'accepted'
         AND metadata->>'order_id' IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [String(proposalId)]
    );
    const acceptedOrderId = acceptedMessageResult.rows[0]?.order_id || null;

    return res.render('deal-proposal', {
      proposal,
      stages: stagesResult.rows,
      target,
      acceptedOrderId,
      currentUser: req.session.user,
      csrfToken: req.session?.csrfToken || '',
    });
  } catch (error) {
    console.error('Error loading deal proposal page:', error);
    return res.status(500).send('Ошибка загрузки предложения');
  }
};

const getOrderPage = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(404).send('Сделка не найдена');
    }

    const orderResult = await db.query(`
      SELECT o.*,
             c.first_name AS customer_first_name,
             c.last_name AS customer_last_name,
             c.avatar AS customer_avatar,
             e.first_name AS executor_first_name,
             e.last_name AS executor_last_name,
             e.avatar AS executor_avatar
      FROM orders o
      LEFT JOIN users c ON o.customer_id = c.id
      LEFT JOIN users e ON o.executor_id = e.id
      WHERE o.id = $1
    `, [orderId]);

    if (orderResult.rows.length === 0) {
      return res.status(404).send('Сделка не найдена');
    }

    const order = orderResult.rows[0];

    await ensureReviewModerationColumns();

    const reviewsResult = await db.query(`
      SELECT r.*,
             u.id AS reviewer_id,
             u.first_name,
             u.last_name,
             u.avatar
      FROM order_reviews r
      JOIN users u ON r.reviewer_id = u.id
      WHERE r.order_id = $1
        AND r.status = 'approved'
      ORDER BY r.created_at DESC
    `, [orderId]);

    const currentUserId = req.session?.user?.id || null;
    const existingReviewResult = currentUserId
      ? await db.query(
          'SELECT 1 FROM order_reviews WHERE order_id = $1 AND reviewer_id = $2',
          [orderId, currentUserId]
        )
      : null;

    await ensureOrderStagesTable(db);

    const stagesResult = await db.query(`
      SELECT *
      FROM order_stages
      WHERE order_id = $1
      ORDER BY COALESCE(sort_order, 0), id
    `, [orderId]);

    const pendingStageChangeResult = await db.query(`
      SELECT *
      FROM order_stage_change_requests
      WHERE order_id = $1 AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    `, [orderId]);
    const pendingStageChange = pendingStageChangeResult.rows[0] || null;
    const pendingStageChangeSummary = pendingStageChange
      ? buildStageChangeSummary(stagesResult.rows, pendingStageChange.stages)
      : null;

    await db.query(`
      CREATE TABLE IF NOT EXISTS order_categories (
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        PRIMARY KEY (order_id, category_id)
      )
    `);

    const categoriesResult = await db.query(`
      SELECT id, name, parent_name
      FROM (
        SELECT DISTINCT
               c.id,
               c.name,
               parent.name AS parent_name,
               COALESCE(parent.name, c.name) AS sort_name
        FROM order_categories oc
        JOIN categories c ON c.id = oc.category_id
        LEFT JOIN categories parent ON parent.id = c.parent_id
        WHERE oc.order_id = $1
      ) AS selected_categories
      ORDER BY sort_name, name
    `, [orderId]);

    const filesResult = await db.query(`
      SELECT * FROM order_files WHERE order_id = $1 ORDER BY created_at
    `, [orderId]);

    const isAdminUser = currentUserId ? await isAdmin(currentUserId) : false;
    const isCustomer = currentUserId === order.customer_id;
    const isExecutor = currentUserId === order.executor_id;
    const hasReview = currentUserId
      ? reviewsResult.rows.some(r => r.reviewer_id === currentUserId)
      : false;

    const chatUserId = isCustomer ? order.executor_id : (isExecutor ? order.customer_id : null);

    return res.render('order', {
      order,
      reviews: reviewsResult.rows,
      stages: stagesResult.rows,
      pendingStageChange,
      pendingStageChangeSummary,
      subcategories: categoriesResult.rows,
      files: filesResult.rows,
      isCustomer,
      isExecutor,
      hasReview,
      chatUserId,
      isAdmin: isAdminUser,
      csrfToken: req.session?.csrfToken || '',
    });
  } catch (error) {
    console.error('Error loading order page:', error);
    return res.status(500).send('Ошибка загрузки сделки');
  }
};

module.exports = {
  getIndexPage,
  getLentaPage,
  getBirzhaPage,
  getProfilePage,
  getReviewPage,
  getPortfolioPage,
  getSubscriptionsPage,
  getCreateWorkPage,
  getEditWorkPage,
  getWorkPage,
  getDealsPage,
  getDealProposalPage,
  getOrdersPage,
  getCreateOrderPage,
  getOrderPage,
  getBalancePage,
  getWithdrawPage,
  getServicesPage,
  getCreateServicePage,
  getServicePage,
  getOfferPage,
  getPrivacyPolicyPage,
  getPersonalDataConsentPage,
  getMarketingConsentPage,
  getNotificationsPage,
};
