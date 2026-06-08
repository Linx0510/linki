const db = require('../config/database');
const fs = require('fs');
const path = require('path');
const { ensureFeedbackTable } = require('./feedbackController');
const { ensureBalanceTables, roundMoney } = require('./paymentController');


const getTableColumns = async (tableName) => {
    const result = await db.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [tableName]
    );

    return new Set(result.rows.map((row) => row.column_name));
};

const getStatusConstraintValues = async (tableName) => {
    const result = await db.query(
        `SELECT pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = 'public'
           AND t.relname = $1
           AND c.contype = 'c'
           AND c.conname ILIKE '%status%check%'`,
        [tableName]
    );

    const values = new Set();

    for (const row of result.rows) {
        const definition = row.def || '';
        const matches = definition.match(/'([^']+)'/g) || [];
        for (const match of matches) {
            values.add(match.slice(1, -1));
        }
    }

    return values;
};

const pickAllowedStatus = (inputStatus, allowedStatuses, aliases = {}) => {
    if (!inputStatus || typeof inputStatus !== 'string') return null;

    const normalized = inputStatus.trim();
    const aliasTarget = aliases[normalized] || normalized;

    if (!allowedStatuses || allowedStatuses.size === 0) {
        return aliasTarget;
    }

    if (allowedStatuses.has(aliasTarget)) {
        return aliasTarget;
    }

    const lowerMap = new Map(Array.from(allowedStatuses).map((value) => [value.toLowerCase(), value]));

    if (lowerMap.has(aliasTarget.toLowerCase())) {
        return lowerMap.get(aliasTarget.toLowerCase());
    }

    return null;
};

const toCsv = (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) {
        return '';
    }

    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const escapeValue = (value) => {
        if (value === null || value === undefined) return '';
        const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        if (/[,"\n]/.test(stringValue)) {
            return `"${stringValue.replace(/"/g, '""')}"`;
        }

        return stringValue;
    };

    const lines = [headers.join(',')];
    for (const row of rows) {
        lines.push(headers.map((header) => escapeValue(row[header])).join(','));
    }

    return lines.join('\n');
};

const getDashboard = async (req, res) => {
    try {
        await ensureFeedbackTable();

        const stats = await db.query(`
            SELECT
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE) as new_users_today,
                (SELECT COUNT(*) FROM works) as total_works,
                (SELECT COUNT(*) FROM works WHERE created_at >= CURRENT_DATE) as new_works_today,
                (SELECT COUNT(*) FROM orders) as total_orders,
                (SELECT COUNT(*) FROM orders WHERE status = 'active') as active_orders,
                (SELECT COUNT(*) FROM complaints WHERE status = 'pending') as pending_complaints,
                (SELECT COUNT(*) FROM public.feedback) as total_feedback,
                (SELECT COALESCE(SUM(price), 0) FROM orders WHERE status = 'completed') as total_revenue
            FROM users LIMIT 1
        `);

        const recentActivities = await db.query(`
            SELECT
                al.*,
                u.first_name,
                u.last_name,
                u.email
            FROM user_activity_logs al
            LEFT JOIN users u ON al.user_id = u.id
            ORDER BY al.created_at DESC
            LIMIT 50
        `);

        const dailyStats = await db.query(`
            SELECT
                date,
                total_users,
                new_users_today as new_users,
                active_users_today as active_users,
                total_works,
                total_orders
            FROM platform_stats
            WHERE date >= CURRENT_DATE - INTERVAL '30 days'
            ORDER BY date ASC
        `);

        const settings = await db.query('SELECT * FROM system_settings');
        const settingsMap = {};
        settings.rows.forEach(s => { settingsMap[s.key] = s.value; });

        res.render('admin/dashboard', {
            stats: stats.rows[0],
            recentActivities: recentActivities.rows,
            dailyStats: dailyStats.rows,
            settings: settingsMap
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).send('Ошибка загрузки админ-панели');
    }
};
const getUsers = async (req, res) => {
    const { search, role, page = 1 } = req.query;
    const limit = 20;
    const offset = (page - 1) * limit;

    try {
        let query = `
            SELECT u.*, r.name as role_name,
                   (SELECT COUNT(*) FROM works WHERE user_id = u.id) as works_count,
                   (SELECT COUNT(*) FROM subscriptions WHERE followed_id = u.id) as followers_count
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE 1=1
        `;
        let params = [];
        let paramIndex = 1;

        if (search) {
            query += ` AND (u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (role && role !== 'all') {
            query += ` AND r.name = $${paramIndex}`;
            params.push(role);
            paramIndex++;
        }

        const countQuery = `SELECT COUNT(*) as total FROM (${query}) AS complaint_rows`;

        const totalResult = await db.query(countQuery, params);
        const total = parseInt(totalResult.rows[0].total);

        query += ` ORDER BY u.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const users = await db.query(query, params);

        res.render('admin/users', {
            users: users.rows,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / limit),
            search,
            role
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).send('Ошибка загрузки пользователей');
    }
};
const editUser = async (req, res) => {
    const { id } = req.params;
    const { first_name, last_name, email, role_id, status, balance } = req.body;

    try {
        await db.query(`
            UPDATE users
            SET first_name = $1, last_name = $2, email = $3, role_id = $4, status = $5
            WHERE id = $6
        `, [first_name, last_name, email, role_id, status, id]);

        if (balance !== undefined) {
            await db.query(`
                UPDATE accounts SET total_balance = $1 WHERE user_id = $2
            `, [balance, id]);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Edit user error:', error);
        res.status(500).json({ error: 'Ошибка при обновлении пользователя' });
    }
};
const blockUser = async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    try {
        const userColumns = await getTableColumns('users');
        const setFragments = [];
        const values = [];

        if (userColumns.has('status')) {
            setFragments.push(`status = $${values.length + 1}`);
            values.push('blocked');
        }
        if (userColumns.has('blocked_reason')) {
            setFragments.push(`blocked_reason = $${values.length + 1}`);
            values.push(reason || null);
        }
        if (userColumns.has('is_blocked')) {
            setFragments.push(`is_blocked = $${values.length + 1}`);
            values.push(true);
        }

        if (setFragments.length) {
            values.push(id);
            await db.query(`
                UPDATE users SET ${setFragments.join(', ')} WHERE id = $${values.length}
            `, values);
        }

        const workStatuses = await getStatusConstraintValues('works');
        const blockedStatus = pickAllowedStatus('blocked', workStatuses, { blocked: 'blocked' });
        if (blockedStatus) {
            await db.query(`
                UPDATE works SET status = $1 WHERE user_id = $2 AND status != $1
            `, [blockedStatus, id]);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Block user error:', error);
        res.status(500).json({ error: 'Ошибка при блокировке пользователя' });
    }
};
const unblockUser = async (req, res) => {
    const { id } = req.params;

    try {
        const userColumns = await getTableColumns('users');
        const setFragments = [];
        const values = [];

        if (userColumns.has('status')) {
            setFragments.push(`status = $${values.length + 1}`);
            values.push('active');
        }
        if (userColumns.has('blocked_reason')) {
            setFragments.push(`blocked_reason = NULL`);
        }
        if (userColumns.has('is_blocked')) {
            setFragments.push(`is_blocked = $${values.length + 1}`);
            values.push(false);
        }

        if (setFragments.length) {
            values.push(id);
            await db.query(`
                UPDATE users SET ${setFragments.join(', ')} WHERE id = $${values.length}
            `, values);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Unblock user error:', error);
        res.status(500).json({ error: 'Ошибка при разблокировке пользователя' });
    }
};
const getWorks = async (req, res) => {
    const { search, status, page = 1 } = req.query;
    const selectedStatus = status || 'pending';
    const limit = 20;
    const offset = (page - 1) * limit;

    try {
        let query = `
            SELECT w.*, u.first_name, u.last_name, u.email,
                   (SELECT COUNT(*) FROM complaints WHERE work_id = w.id) as complaints_count
            FROM works w
            JOIN users u ON w.user_id = u.id
            WHERE 1=1
        `;
        let params = [];
        let paramIndex = 1;

        if (search) {
            query += ` AND (w.title ILIKE $${paramIndex} OR w.description ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (selectedStatus !== 'all') {
            query += ` AND w.status = $${paramIndex}`;
            params.push(selectedStatus);
            paramIndex++;
        }

        const countResult = await db.query(`
            SELECT COUNT(*)::int as total
            FROM works w
            JOIN users u ON w.user_id = u.id
            WHERE 1=1
              AND ($1::text IS NULL OR (w.title ILIKE $1 OR w.description ILIKE $1))
              AND ($2::text IS NULL OR w.status = $2)
        `, [search ? `%${search}%` : null, selectedStatus !== 'all' ? selectedStatus : null]);
        const total = countResult.rows[0]?.total || 0;

        query += ` ORDER BY w.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const works = await db.query(query, params);

        res.render('admin/works', {
            works: works.rows,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / limit),
            search,
            status: selectedStatus
        });
    } catch (error) {
        console.error('Get works error:', error);
        res.status(500).send('Ошибка загрузки работ');
    }
};
const moderateWork = async (req, res) => {
    const { id } = req.params;
    const { status, reason } = req.body;

    try {
        const columns = await getTableColumns('works');
        const allowedStatuses = await getStatusConstraintValues('works');
        const nextStatus = pickAllowedStatus(status, allowedStatuses, {
            approved: 'active',
            cancelled: 'cancelled',
            rejected: 'cancelled',
        });

        if (!nextStatus) {
            return res.status(400).json({ error: 'Некорректный статус модерации' });
        }

        const setFragments = ['status = $1'];
        const values = [nextStatus];

        if (columns.has('moderation_comment')) {
            setFragments.push(`moderation_comment = $${values.length + 1}`);
            values.push(reason || null);
        }

        values.push(id);

        await db.query(`
            UPDATE works SET ${setFragments.join(', ')} WHERE id = $${values.length}
        `, values);

        const work = await db.query(`
            SELECT w.user_id, w.title FROM works w WHERE w.id = $1
        `, [id]);

        if (!work.rows.length) {
            return res.status(404).json({ error: 'Работа не найдена' });
        }

        const message = nextStatus === 'blocked'
            ? `Ваша работа "${work.rows[0].title}" была заблокирована. Причина: ${reason}`
            : nextStatus === 'cancelled'
                ? `Ваша работа "${work.rows[0].title}" не прошла модерацию и была отменена${reason ? `. Причина: ${reason}` : ''}`
                : `Ваша работа "${work.rows[0].title}" была одобрена и опубликована`;

        await db.query(`
            INSERT INTO notifications (user_id, message, link)
            VALUES ($1, $2, $3)
        `, [work.rows[0].user_id, message, `/works/${id}`]);

        res.json({ success: true });
    } catch (error) {
        console.error('Moderate work error:', error);
        res.status(500).json({ error: 'Ошибка при модерации работы' });
    }
};

const deleteWork = async (req, res) => {
    const { id } = req.params;
    const reason = String(req.body.reason || '').trim();

    if (!reason) {
        return res.status(400).json({ error: 'Причина удаления обязательна' });
    }

    try {
        const workResult = await db.query(
            `SELECT id, title, user_id FROM works WHERE id = $1`,
            [id]
        );

        if (workResult.rows.length === 0) {
            return res.status(404).json({ error: 'Работа не найдена' });
        }

        const work = workResult.rows[0];
        const imagesResult = await db.query(`SELECT image_url FROM work_images WHERE work_id = $1`, [id]);

        await db.query(`DELETE FROM works WHERE id = $1`, [id]);

        for (const row of imagesResult.rows) {
            const imageUrl = typeof row.image_url === 'string' ? row.image_url.trim() : '';
            if (!imageUrl || !imageUrl.startsWith('/uploads/')) continue;
            const imagePath = path.join(__dirname, '..', 'public', imageUrl);
            try {
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            } catch (unlinkError) {
                console.error('Failed to delete work image:', unlinkError);
            }
        }

        await db.query(`
            INSERT INTO notifications (user_id, message, link)
            VALUES ($1, $2, $3)
        `, [
            work.user_id,
            `Администратор удалил вашу работу "${work.title}". Причина: ${reason}`,
            `/profile/${work.user_id}`
        ]);

        res.json({ success: true });
    } catch (error) {
        console.error('Delete work error:', error);
        res.status(500).json({ error: 'Ошибка при удалении работы' });
    }
};

const deleteService = async (req, res) => {
    const { id } = req.params;
    const reason = String(req.body.reason || '').trim();

    if (!reason) {
        return res.status(400).json({ error: 'Причина удаления обязательна' });
    }

    try {
        const serviceResult = await db.query(
            `SELECT id, title, COALESCE(provider_id, user_id) AS owner_id, cover_image FROM services WHERE id = $1`,
            [id]
        );

        if (serviceResult.rows.length === 0) {
            return res.status(404).json({ error: 'Услуга не найдена' });
        }

        const service = serviceResult.rows[0];
        if (service.cover_image && service.cover_image.startsWith('/uploads/')) {
            const coverPath = path.join(__dirname, '..', 'public', service.cover_image);
            try {
                if (fs.existsSync(coverPath)) {
                    fs.unlinkSync(coverPath);
                }
            } catch (unlinkError) {
                console.error('Failed to delete service cover:', unlinkError);
            }
        }

        await db.query(`DELETE FROM services WHERE id = $1`, [id]);

        await db.query(`
            INSERT INTO notifications (user_id, message, link)
            VALUES ($1, $2, $3)
        `, [
            service.owner_id,
            `Администратор удалил вашу услугу "${service.title}". Причина: ${reason}`,
            `/profile/${service.owner_id}`
        ]);

        res.json({ success: true });
    } catch (error) {
        console.error('Delete service error:', error);
        res.status(500).json({ error: 'Ошибка при удалении услуги' });
    }
};

const deleteOrder = async (req, res) => {
    const { id } = req.params;
    const reason = String(req.body.reason || '').trim();

    if (!reason) {
        return res.status(400).json({ error: 'Причина удаления обязательна' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        await ensureBalanceTables(client);

        const orderResult = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [id]);
        if (orderResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Задача не найдена' });
        }

        const order = orderResult.rows[0];
        if (order.status === 'completed' || order.status === 'cancelled') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Нельзя удалить завершённую или отменённую задачу' });
        }

        if (order.payment_status === 'held') {
            const refundAmount = roundMoney(order.price);
            const refundResult = await client.query(`
                UPDATE user_balances
                SET balance = balance + $1,
                    held_balance = held_balance - $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $2 AND held_balance >= $1
                RETURNING balance
            `, [refundAmount, order.customer_id]);

            if (refundResult.rows.length === 0) {
                throw new Error('Недостаточно замороженных средств заказчика для возврата');
            }

            await client.query(`
                INSERT INTO payments (user_id, type, amount, status, metadata, description)
                VALUES ($1, 'release', $2, 'succeeded', $3, $4)
            `, [
                order.customer_id,
                refundAmount,
                JSON.stringify({ order_id: order.id, refund: true }),
                `Возврат замороженных средств по отмене задачи #${order.id}`
            ]);
        }

        await client.query(`
            UPDATE orders
            SET status = 'cancelled', payment_status = 'cancelled', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [id]);

        await client.query('COMMIT');

        const usersToNotify = new Set([order.customer_id, order.executor_id].filter(Boolean));
        for (const userId of usersToNotify) {
            await db.query(`
                INSERT INTO notifications (user_id, message, link)
                VALUES ($1, $2, $3)
            `, [
                userId,
                `Администратор отменил задачу "${order.title}". Причина: ${reason}`,
                `/orders/${order.id}`
            ]);
        }

        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Delete order error:', error);
        res.status(500).json({ error: 'Ошибка при удалении задачи' });
    } finally {
        client.release();
    }
};

const getComplaints = async (req, res) => {
    const { status, page = 1 } = req.query;
    const limit = 20;
    const offset = (page - 1) * limit;

    try {
        let query = `
            SELECT c.*,
                   COALESCE(c.target_type, CASE WHEN c.work_id IS NOT NULL THEN 'work' WHEN c.service_id IS NOT NULL THEN 'service' WHEN c.order_id IS NOT NULL THEN 'order' ELSE 'work' END) AS target_type,
                   u.first_name as sender_first_name, u.last_name as sender_last_name, u.email as sender_email,
                   w.title as work_title, s.title as service_title, o.title as order_title,
                   COALESCE(w.title, s.title, o.title, 'Объект удалён') as target_title,
                   COALESCE(w.user_id, s.user_id, s.provider_id, o.customer_id) as author_id,
                   a.first_name as author_first_name, a.last_name as author_last_name,
                   cr.name as reason_name
            FROM complaints c
            JOIN users u ON c.sender_id = u.id
            LEFT JOIN works w ON c.work_id = w.id
            LEFT JOIN services s ON c.service_id = s.id
            LEFT JOIN orders o ON c.order_id = o.id
            LEFT JOIN users a ON a.id = COALESCE(w.user_id, s.user_id, s.provider_id, o.customer_id)
            JOIN complaint_reasons cr ON c.reason_id = cr.id
            WHERE 1=1
        `;
        let params = [];
        let paramIndex = 1;

        if (status && status !== 'all') {
            query += ` AND c.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        const countQuery = `SELECT COUNT(*) as total FROM (${query}) AS complaint_rows`;

        const totalResult = await db.query(countQuery, params);
        const total = parseInt(totalResult.rows[0].total);

        query += ` ORDER BY c.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const complaints = await db.query(query, params);

        res.render('admin/complaints', {
            complaints: complaints.rows,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / limit),
            status
        });
    } catch (error) {
        console.error('Get complaints error:', error);
        res.status(500).send('Ошибка загрузки жалоб');
    }
};

const getReviews = async (req, res) => {
    const { type = 'all', status = 'all', page = 1 } = req.query;
    const limit = 20;
    const currentPage = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (currentPage - 1) * limit;

    try {
        const allowedStatuses = new Set(['pending', 'approved', 'rejected']);
        const statusFilter = allowedStatuses.has(status) ? status : null;

        let baseQueries = [];

        if (type === 'all' || type === 'service') {
            baseQueries.push(`SELECT sr.id, 'service' AS type, sr.reviewer_id, sr.rating, sr.comment, sr.status, sr.created_at, s.id AS target_id, COALESCE(s.provider_id, s.user_id) AS target_owner_id, u.first_name AS reviewer_first_name, u.last_name AS reviewer_last_name FROM service_reviews sr JOIN users u ON u.id = sr.reviewer_id LEFT JOIN services s ON s.id = sr.service_id ${statusFilter ? `WHERE sr.status = '${statusFilter}'` : ''}`);
        }

        if (type === 'all' || type === 'user') {
            baseQueries.push(`SELECT ur.id, 'user' AS type, ur.reviewer_id, ur.rating, ur.comment, ur.status, ur.created_at, ur.reviewed_user_id AS target_id, ur.reviewed_user_id AS target_owner_id, u.first_name AS reviewer_first_name, u.last_name AS reviewer_last_name FROM user_reviews ur JOIN users u ON u.id = ur.reviewer_id ${statusFilter ? `WHERE ur.status = '${statusFilter}'` : ''}`);
        }

        if (type === 'all' || type === 'order') {
            baseQueries.push(`SELECT orv.id, 'order' AS type, orv.reviewer_id, orv.rating, orv.comment, orv.status, orv.created_at, orv.order_id AS target_id, CASE WHEN o.customer_id = orv.reviewer_id THEN o.executor_id ELSE o.customer_id END AS target_owner_id, u.first_name AS reviewer_first_name, u.last_name AS reviewer_last_name FROM order_reviews orv JOIN users u ON u.id = orv.reviewer_id LEFT JOIN orders o ON o.id = orv.order_id ${statusFilter ? `WHERE orv.status = '${statusFilter}'` : ''}`);
        }

        if (baseQueries.length === 0) {
            return res.render('admin/reviews', { reviews: [], total: 0, page: currentPage, totalPages: 0, type, status, limit, csrfToken: req.session?.csrfToken || '' });
        }

        const unionQuery = baseQueries.join('\nUNION ALL\n');
        const countQuery = `SELECT COUNT(*)::int AS total FROM (${unionQuery}) AS all_reviews`;
        const totalResult = await db.query(countQuery);
        const total = totalResult.rows[0]?.total || 0;

        const finalQuery = `${unionQuery} ORDER BY created_at DESC LIMIT $1 OFFSET $2`;
        const reviewsResult = await db.query(finalQuery, [limit, offset]);

        const totalPages = Math.max(Math.ceil(total / limit), 1);

        res.render('admin/reviews', {
            reviews: reviewsResult.rows,
            total,
            page: currentPage,
            totalPages,
            type,
            status,
            limit,
            csrfToken: req.session?.csrfToken || ''
        });
    } catch (error) {
        console.error('Get reviews error:', error);
        res.status(500).send('Ошибка загрузки отзывов');
    }
};

const updateReviewStatus = async (table, id, newStatus, comment) => {
    const q = `UPDATE ${table} SET status = $1${comment !== undefined ? ', moderation_comment = $2' : ''} WHERE id = $${comment !== undefined ? 3 : 2} RETURNING *`;
    // Build params
    const params = comment !== undefined ? [newStatus, comment, id] : [newStatus, id];
    const result = await db.query(q, params);
    return result.rows[0];
};

const approveReview = async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Неверный ID отзыва' });

    try {
        // try service_reviews
        let row = (await db.query('SELECT * FROM service_reviews WHERE id = $1', [id])).rows[0];
        if (row) {
            await db.query(`UPDATE service_reviews SET status = 'approved' WHERE id = $1`, [id]);
            await require('../utils/reviewModeration').recalcServiceReviewStats(row.service_id);
            const ownerId = (await db.query('SELECT COALESCE(provider_id, user_id) AS owner FROM services WHERE id = $1', [row.service_id])).rows[0]?.owner;
            if (ownerId) {
                await db.query(`INSERT INTO notifications (user_id, message, link) VALUES ($1, $2, $3)`, [ownerId, `Новый отзыв одобрен для вашей услуги`, '/']);
            }
            return res.json({ success: true });
        }

        // try user_reviews
        row = (await db.query('SELECT * FROM user_reviews WHERE id = $1', [id])).rows[0];
        if (row) {
            await db.query(`UPDATE user_reviews SET status = 'approved' WHERE id = $1`, [id]);
            await require('../utils/reviewModeration').recalcUserReviewStats(row.reviewed_user_id);
            await db.query(`INSERT INTO notifications (user_id, message, link) VALUES ($1, $2, $3)`, [row.reviewed_user_id, `Новый отзыв одобрен в ваш профиль`, `/users/${row.reviewed_user_id}/review`]);
            return res.json({ success: true });
        }

        // try order_reviews
        row = (await db.query('SELECT * FROM order_reviews WHERE id = $1', [id])).rows[0];
        if (row) {
            await db.query(`UPDATE order_reviews SET status = 'approved' WHERE id = $1`, [id]);
            // notify the other party
            const order = (await db.query('SELECT customer_id, executor_id FROM orders WHERE id = $1', [row.order_id])).rows[0];
            if (order) {
                const target = order.customer_id === row.reviewer_id ? order.executor_id : order.customer_id;
                if (target) {
                    await db.query(`INSERT INTO notifications (user_id, message, link) VALUES ($1, $2, $3)`, [target, `Новый отзыв одобрен для вашей сделки`, `/orders/${row.order_id}`]);
                }
            }
            return res.json({ success: true });
        }

        return res.status(404).json({ error: 'Отзыв не найден' });
    } catch (error) {
        console.error('Approve review error:', error);
        res.status(500).json({ error: 'Ошибка при одобрении отзыва' });
    }
};

const rejectReview = async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const reason = String(req.body.reason || '').trim() || null;
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Неверный ID отзыва' });

    try {
        let row = (await db.query('SELECT * FROM service_reviews WHERE id = $1', [id])).rows[0];
        if (row) {
            await db.query(`UPDATE service_reviews SET status = 'rejected', moderation_comment = $1 WHERE id = $2`, [reason, id]);
            const ownerId = (await db.query('SELECT COALESCE(provider_id, user_id) AS owner FROM services WHERE id = $1', [row.service_id])).rows[0]?.owner;
            if (ownerId) {
                await db.query(`INSERT INTO notifications (user_id, message, link) VALUES ($1, $2, $3)`, [ownerId, `Отзыв отклонён модерацией`, '/']);
            }
            return res.json({ success: true });
        }

        row = (await db.query('SELECT * FROM user_reviews WHERE id = $1', [id])).rows[0];
        if (row) {
            await db.query(`UPDATE user_reviews SET status = 'rejected', moderation_comment = $1 WHERE id = $2`, [reason, id]);
            await db.query(`INSERT INTO notifications (user_id, message, link) VALUES ($1, $2, $3)`, [row.reviewed_user_id, `Отзыв в ваш профиль отклонён модерацией`, `/users/${row.reviewed_user_id}/review`]);
            return res.json({ success: true });
        }

        row = (await db.query('SELECT * FROM order_reviews WHERE id = $1', [id])).rows[0];
        if (row) {
            await db.query(`UPDATE order_reviews SET status = 'rejected', moderation_comment = $1 WHERE id = $2`, [reason, id]);
            const order = (await db.query('SELECT customer_id, executor_id FROM orders WHERE id = $1', [row.order_id])).rows[0];
            if (order) {
                const target = order.customer_id === row.reviewer_id ? order.executor_id : order.customer_id;
                if (target) {
                    await db.query(`INSERT INTO notifications (user_id, message, link) VALUES ($1, $2, $3)`, [target, `Отзыв отклонён модерацией`, `/orders/${row.order_id}`]);
                }
            }
            return res.json({ success: true });
        }

        return res.status(404).json({ error: 'Отзыв не найден' });
    } catch (error) {
        console.error('Reject review error:', error);
        res.status(500).json({ error: 'Ошибка при отклонении отзыва' });
    }
};

const getComplaintDetail = async (req, res) => {
    const { id } = req.params;
    const complaintId = parseInt(id, 10);

    if (!Number.isInteger(complaintId) || complaintId <= 0) {
        return res.status(404).send('Жалоба не найдена');
    }

    try {
        const complaintResult = await db.query(`
            SELECT c.*,
                   COALESCE(c.target_type, CASE WHEN c.work_id IS NOT NULL THEN 'work' WHEN c.service_id IS NOT NULL THEN 'service' WHEN c.order_id IS NOT NULL THEN 'order' ELSE 'work' END) AS target_type,
                   u.first_name as sender_first_name, u.last_name as sender_last_name, u.email as sender_email,
                   u.avatar as sender_avatar,
                   w.title as work_title, w.id as work_id, s.title as service_title, s.id as service_id, o.title as order_title, o.id as order_id,
                   COALESCE(w.title, s.title, o.title, 'Объект удалён') as target_title,
                   COALESCE(w.user_id, s.user_id, s.provider_id, o.customer_id) as author_id,
                   a.first_name as author_first_name, a.last_name as author_last_name,
                   cr.name as reason_name, cr.description as reason_description
            FROM complaints c
            JOIN users u ON c.sender_id = u.id
            LEFT JOIN works w ON c.work_id = w.id
            LEFT JOIN services s ON c.service_id = s.id
            LEFT JOIN orders o ON c.order_id = o.id
            LEFT JOIN users a ON a.id = COALESCE(w.user_id, s.user_id, s.provider_id, o.customer_id)
            JOIN complaint_reasons cr ON c.reason_id = cr.id
            WHERE c.id = $1
        `, [complaintId]);

        if (complaintResult.rows.length === 0) {
            return res.status(404).send('Жалоба не найдена');
        }

        const complaint = complaintResult.rows[0];

        res.render('admin/complaint-detail', {
            complaint,
            csrfToken: req.session?.csrfToken || '',
        });
    } catch (error) {
        console.error('Get complaint detail error:', error);
        res.status(500).send('Ошибка загрузки жалобы');
    }
};

const resolveComplaint = async (req, res) => {
    const { id } = req.params;
    const { status, action } = req.body;

    try {
        const allowedStatuses = await getStatusConstraintValues('complaints');
        const nextStatus = pickAllowedStatus(status, allowedStatuses, {
            resolved: 'resolved',
            approved: 'approved',
            rejected: 'rejected',
            pending: 'pending',
        });

        if (!nextStatus) {
            return res.status(400).json({ error: 'Некорректный статус жалобы' });
        }

        await db.query(`
            UPDATE complaints SET status = $1 WHERE id = $2
        `, [nextStatus, id]);

        if (action === 'block_work') {
            const complaint = await db.query(`
                SELECT work_id, service_id, order_id, target_type FROM complaints WHERE id = $1
            `, [id]);

            const workStatuses = await getStatusConstraintValues('works');
            const blockedStatus = pickAllowedStatus('blocked', workStatuses, { blocked: 'blocked' });

            if (blockedStatus) {
                await db.query(`
                    UPDATE works SET status = $1 WHERE id = $2
                `, [blockedStatus, complaint.rows[0].work_id]);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Resolve complaint error:', error);
        res.status(500).json({ error: 'Ошибка при обработке жалобы' });
    }
};
const exportData = async (req, res) => {
    const { type, format, date_from, date_to } = req.query;

    try {
        let data = [];
        let filename = '';

        switch (type) {
            case 'users':
                data = await exportUsers(date_from, date_to);
                filename = `users_${new Date().toISOString().split('T')[0]}`;
                break;
            case 'works':
                data = await exportWorks(date_from, date_to);
                filename = `works_${new Date().toISOString().split('T')[0]}`;
                break;
            case 'orders':
                data = await exportOrders(date_from, date_to);
                filename = `orders_${new Date().toISOString().split('T')[0]}`;
                break;
            case 'complaints':
                data = await exportComplaints(date_from, date_to);
                filename = `complaints_${new Date().toISOString().split('T')[0]}`;
                break;
            case 'transactions':
                data = await exportTransactions(date_from, date_to);
                filename = `transactions_${new Date().toISOString().split('T')[0]}`;
                break;
            case 'full_backup':
                data = await exportFullBackup();
                filename = `full_backup_${new Date().toISOString().split('T')[0]}`;
                break;
        }

        if (format === 'csv') {
            const csv = toCsv(data);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
            res.send(csv);
        } else {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=${filename}.json`);
            res.json(data);
        }
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Ошибка при экспорте данных' });
    }
};
async function exportUsers(date_from, date_to) {
    let query = `
        SELECT u.id, u.first_name, u.last_name, u.email, u.created_at,
               r.name as role, u.status,
               (SELECT COUNT(*) FROM works WHERE user_id = u.id) as works_count,
               (SELECT COUNT(*) FROM orders WHERE customer_id = u.id) as orders_as_customer,
               (SELECT COUNT(*) FROM orders WHERE executor_id = u.id) as orders_as_executor
        FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE 1=1
    `;
    const params = [];

    if (date_from) {
        query += ` AND u.created_at >= $${params.length + 1}`;
        params.push(date_from);
    }
    if (date_to) {
        query += ` AND u.created_at <= $${params.length + 1}`;
        params.push(date_to);
    }

    const result = await db.query(query, params);
    return result.rows;
}
async function exportWorks(date_from, date_to) {
    let query = `
        SELECT w.id, w.title, w.description, w.status, w.likes, w.created_at,
               u.first_name, u.last_name, u.email,
               (SELECT COUNT(*) FROM complaints WHERE work_id = w.id) as complaints_count
        FROM works w
        JOIN users u ON w.user_id = u.id
        WHERE 1=1
    `;
    const params = [];

    if (date_from) {
        query += ` AND w.created_at >= $${params.length + 1}`;
        params.push(date_from);
    }
    if (date_to) {
        query += ` AND w.created_at <= $${params.length + 1}`;
        params.push(date_to);
    }

    const result = await db.query(query, params);
    return result.rows;
}
async function exportOrders(date_from, date_to) {
    let query = `
        SELECT o.id, o.title, o.description, o.price, o.status, o.created_at, o.completed_at,
               c.first_name as customer_first_name, c.last_name as customer_last_name,
               e.first_name as executor_first_name, e.last_name as executor_last_name
        FROM orders o
        JOIN users c ON o.customer_id = c.id
        LEFT JOIN users e ON o.executor_id = e.id
        WHERE 1=1
    `;
    const params = [];

    if (date_from) {
        query += ` AND o.created_at >= $${params.length + 1}`;
        params.push(date_from);
    }
    if (date_to) {
        query += ` AND o.created_at <= $${params.length + 1}`;
        params.push(date_to);
    }

    const result = await db.query(query, params);
    return result.rows;
}
async function exportComplaints(date_from, date_to) {
    let query = `
        SELECT c.id, c.status, c.created_at,
               COALESCE(c.target_type, CASE WHEN c.work_id IS NOT NULL THEN 'work' WHEN c.service_id IS NOT NULL THEN 'service' WHEN c.order_id IS NOT NULL THEN 'order' ELSE 'work' END) as target_type,
               s.first_name as sender_first_name, s.last_name as sender_last_name,
               COALESCE(w.title, srv.title, o.title, 'Объект удалён') as target_title,
               cr.name as reason_name
        FROM complaints c
        JOIN users s ON c.sender_id = s.id
        LEFT JOIN works w ON c.work_id = w.id
        LEFT JOIN services srv ON c.service_id = srv.id
        LEFT JOIN orders o ON c.order_id = o.id
        JOIN complaint_reasons cr ON c.reason_id = cr.id
        WHERE 1=1
    `;
    const params = [];

    if (date_from) {
        query += ` AND c.created_at >= $${params.length + 1}`;
        params.push(date_from);
    }
    if (date_to) {
        query += ` AND c.created_at <= $${params.length + 1}`;
        params.push(date_to);
    }

    const result = await db.query(query, params);
    return result.rows;
}
async function exportTransactions(date_from, date_to) {
    let query = `
        SELECT t.id, t.amount, t.type, t.description, t.created_at,
               u.first_name, u.last_name, u.email
        FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        JOIN users u ON a.user_id = u.id
        WHERE 1=1
    `;
    const params = [];

    if (date_from) {
        query += ` AND t.created_at >= $${params.length + 1}`;
        params.push(date_from);
    }
    if (date_to) {
        query += ` AND t.created_at <= $${params.length + 1}`;
        params.push(date_to);
    }

    const result = await db.query(query, params);
    return result.rows;
}
async function exportFullBackup() {
    const backup = {
        exported_at: new Date().toISOString(),
        users: await exportUsers(),
        works: await exportWorks(),
        orders: await exportOrders(),
        complaints: await exportComplaints(),
        transactions: await exportTransactions(),
        categories: (await db.query('SELECT * FROM categories')).rows,
        system_settings: (await db.query('SELECT * FROM system_settings')).rows
    };
    return backup;
}
const updateSettings = async (req, res) => {
    const settings = req.body;

    try {
        for (const [key, value] of Object.entries(settings)) {
            await db.query(`
                INSERT INTO system_settings (key, value, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE
                SET value = $2, updated_at = CURRENT_TIMESTAMP
            `, [key, value]);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: 'Ошибка при обновлении настроек' });
    }
};
const updatePlatformStats = async () => {
    try {
        const today = new Date().toISOString().split('T')[0];

        await db.query(`
            INSERT INTO platform_stats (date, total_users, total_works, total_orders, total_revenue, active_users_today, new_users_today)
            SELECT
                CURRENT_DATE,
                (SELECT COUNT(*) FROM users),
                (SELECT COUNT(*) FROM works),
                (SELECT COUNT(*) FROM orders),
                (SELECT COALESCE(SUM(price), 0) FROM orders WHERE status = 'completed'),
                (SELECT COUNT(DISTINCT user_id) FROM user_activity_logs WHERE created_at >= CURRENT_DATE),
                (SELECT COUNT(*) FROM users WHERE created_at >= CURRENT_DATE)
            ON CONFLICT (date) DO UPDATE SET
                total_users = EXCLUDED.total_users,
                total_works = EXCLUDED.total_works,
                total_orders = EXCLUDED.total_orders,
                total_revenue = EXCLUDED.total_revenue,
                active_users_today = EXCLUDED.active_users_today,
                new_users_today = EXCLUDED.new_users_today
        `);
    } catch (error) {
        console.error('Update stats error:', error);
    }
};

const getFeedback = async (req, res) => {
    const { search, page = 1 } = req.query;
    const limit = 20;
    const currentPage = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (currentPage - 1) * limit;
    const params = [];
    let whereClause = '';

    if (search && search.trim()) {
        params.push(`%${search.trim()}%`);
        whereClause = `WHERE name ILIKE $1 OR email ILIKE $1 OR message ILIKE $1`;
    }

    try {
        await ensureFeedbackTable();

        const totalResult = await db.query(
            `SELECT COUNT(*)::int AS total FROM public.feedback ${whereClause}`,
            params
        );
        const total = totalResult.rows[0]?.total || 0;

        const feedbackResult = await db.query(
            `SELECT id, name, email, message, created_at
             FROM public.feedback
             ${whereClause}
             ORDER BY created_at DESC, id DESC
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, limit, offset]
        );

        return res.render('admin/feedback', {
            feedback: feedbackResult.rows,
            total,
            page: currentPage,
            totalPages: Math.max(Math.ceil(total / limit), 1),
            search: search || '',
            csrfToken: req.session?.csrfToken || '',
        });
    } catch (error) {
        console.error('Get feedback error:', error);
        return res.status(500).send('Ошибка загрузки сообщений');
    }
};

const getWithdrawalsPage = async (req, res) => {
    try {
        return res.render('admin/withdrawals', {
            csrfToken: req.session?.csrfToken || '',
        });
    } catch (error) {
        console.error('Error loading withdrawals page:', error);
        return res.status(500).send('Ошибка загрузки страницы');
    }
};

module.exports = {
    getDashboard,
    getUsers,
    editUser,
    blockUser,
    unblockUser,
    getWorks,
    moderateWork,
    deleteWork,
    deleteService,
    deleteOrder,
    getComplaints,
    getComplaintDetail,
    getReviews,
    approveReview,
    rejectReview,
    getFeedback,
    resolveComplaint,
    getWithdrawalsPage,
    exportData,
    updateSettings,
    updatePlatformStats
};
