const db = require('../config/database');
const {
    getOrCreateBalance,
    getPlatformAdminAccount,
    ensureBalanceTables,
    PLATFORM_FEE_RATE,
    roundMoney,
} = require('./paymentController');
const { ensureReviewModerationColumns } = require('../utils/reviewModeration');

const TEXTAREA_MAX_LENGTH = 2000;

const ensureOrdersTable = async (queryable) => {
    await queryable.query(`
        CREATE TABLE IF NOT EXISTS orders (
            id SERIAL PRIMARY KEY,
            customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            executor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            price NUMERIC(12, 2) NOT NULL DEFAULT 0,
            status VARCHAR(50) NOT NULL DEFAULT 'active',
            deadline DATE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP
        )
    `);

    await queryable.query(`
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS executor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS title VARCHAR(255),
        ADD COLUMN IF NOT EXISTS description TEXT,
        ADD COLUMN IF NOT EXISTS price NUMERIC(12, 2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS deadline DATE,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);
};


const ensureOrderStagesTable = async (queryable) => {
    await queryable.query(`
        CREATE TABLE IF NOT EXISTS order_stages (
            id SERIAL PRIMARY KEY,
            order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            deadline DATE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            completed BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await queryable.query(`
        ALTER TABLE order_stages
        ADD COLUMN IF NOT EXISTS name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS deadline DATE,
        ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    `);

    await queryable.query(`
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'order_stages' AND column_name = 'title'
            ) THEN
                UPDATE order_stages
                SET name = COALESCE(name, title)
                WHERE name IS NULL;
            END IF;
        END $$;
    `);

    await queryable.query(`
        CREATE TABLE IF NOT EXISTS order_stage_change_requests (
            id SERIAL PRIMARY KEY,
            order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            executor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            stages JSONB NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            responded_at TIMESTAMP
        )
    `);
};

const ensureServicesTable = async (queryable) => {
    await queryable.query(`
        CREATE TABLE IF NOT EXISTS services (
            id SERIAL PRIMARY KEY,
            provider_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
            source_order_id INTEGER UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            price NUMERIC(12, 2) NOT NULL DEFAULT 0,
            start_date DATE,
            deadline DATE,
            avg_rating NUMERIC(3, 1) NOT NULL DEFAULT 0,
            total_reviews INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            cover_image TEXT
        )
    `);

    await queryable.query(`
        ALTER TABLE services
        ADD COLUMN IF NOT EXISTS provider_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS source_order_id INTEGER UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS title VARCHAR(255),
        ADD COLUMN IF NOT EXISTS price NUMERIC(12, 2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS start_date DATE,
        ADD COLUMN IF NOT EXISTS deadline DATE,
        ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3, 1) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total_reviews INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS cover_image TEXT
    `);

    await queryable.query(`
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'services' AND column_name = 'executor_id'
            ) THEN
                UPDATE services
                SET provider_id = COALESCE(provider_id, executor_id)
                WHERE provider_id IS NULL;
            END IF;
        END $$;
    `);

    await queryable.query(`
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'services' AND column_name = 'user_id'
            ) THEN
                UPDATE services
                SET provider_id = COALESCE(provider_id, user_id)
                WHERE provider_id IS NULL;
            END IF;
        END $$;
    `);
};



const createOrder = async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const { title, description, price, executor_id, deadline } = req.body;

    if (!title || !price) {
        return res.status(400).json({ error: 'Заполните обязательные поля' });
    }

    if (description && String(description).length > TEXTAREA_MAX_LENGTH) {
        return res.status(400).json({ error: `Описание не должно превышать ${TEXTAREA_MAX_LENGTH} символов` });
    }

    const parsedExecutorId = executor_id ? Number(executor_id) : null;
    const parsedDeadline = deadline || null;

    const categoriesRaw = req.body.categories;
    const categoryIds = Array.isArray(categoriesRaw)
        ? categoriesRaw.map(Number).filter((id) => Number.isInteger(id) && id > 0)
        : (categoriesRaw ? [Number(categoriesRaw)].filter((id) => Number.isInteger(id) && id > 0) : []);

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        await ensureOrdersTable(client);

        await client.query(`
            CREATE TABLE IF NOT EXISTS order_categories (
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
                PRIMARY KEY (order_id, category_id)
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS order_files (
                id SERIAL PRIMARY KEY,
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                file_url TEXT NOT NULL,
                original_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const result = await client.query(`
            INSERT INTO orders (customer_id, executor_id, title, description, price, status, deadline)
            VALUES ($1, $2, $3, $4, $5, 'active', $6)
            RETURNING *
        `, [req.session.user.id, parsedExecutorId, title, description, price, parsedDeadline]);

        const orderId = result.rows[0].id;

        for (const catId of categoryIds) {
            await client.query(`
                INSERT INTO order_categories (order_id, category_id)
                VALUES ($1, $2)
                ON CONFLICT DO NOTHING
            `, [orderId, catId]);
        }

        const uploadedFiles = Array.isArray(req.files) ? req.files : [];
        for (const file of uploadedFiles) {
            await client.query(`
                INSERT INTO order_files (order_id, file_url, original_name)
                VALUES ($1, $2, $3)
            `, [orderId, `/uploads/order-files/${file.filename}`, file.originalname]);
        }





        if (parsedExecutorId) {
            await client.query(`
                INSERT INTO notifications (user_id, message, link)
                VALUES ($1, $2, $3)
            `, [parsedExecutorId, `Новая задача: ${title}`, '/orders']);
        }

        await client.query('COMMIT');
        res.status(201).json({ success: true, order: result.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Create order error:', error);
        res.status(500).json({ error: 'Ошибка при создании задачи' });
    } finally {
        client.release();
    }
};



const getServicesCatalog = async (_req, res) => {
    try {
        await ensureServicesTable(db);

        const result = await db.query(`
            SELECT
                s.id AS service_id,
                s.title AS service_title,
                s.price,
                s.start_date,
                s.deadline,
                s.avg_rating,
                s.total_reviews,
                COALESCE(u.first_name || ' ' || u.last_name, 'Не назначен') AS provider_name,
                c.name AS category_name
            FROM services s
            LEFT JOIN users u ON s.provider_id = u.id
            LEFT JOIN categories c ON s.category_id = c.id
            WHERE s.source_order_id IS NULL
            ORDER BY s.created_at DESC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error('Get services catalog error:', error);
        res.status(500).json({ error: 'Ошибка при загрузке каталога услуг' });
    }
};


const getUserOrders = async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const { status } = req.query;
    const userId = req.session.user.id;

    try {
        let query = `
            SELECT o.*,
                   c.first_name as customer_first_name,
                   c.last_name as customer_last_name,
                   e.first_name as executor_first_name,
                   e.last_name as executor_last_name,
                   COALESCE((
                       SELECT ARRAY_AGG(category_id ORDER BY category_id)
                       FROM order_categories
                       WHERE order_id = o.id
                   ), ARRAY[]::integer[]) AS category_ids
            FROM orders o
            LEFT JOIN users c ON o.customer_id = c.id
            LEFT JOIN users e ON o.executor_id = e.id
            WHERE o.customer_id = $1 OR o.executor_id = $1
        `;
        let params = [userId];

        if (status && status !== 'all') {
            query += ` AND o.status = $2`;
            params.push(status);
        }

        query += ` ORDER BY o.created_at DESC`;

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ error: 'Ошибка при загрузке задач' });
    }
};


const holdOrderFunds = async (order, client, descriptionPrefix = 'Резерв по заказу') => {
    await ensureBalanceTables(client);

    const amount = roundMoney(order.price);
    if (amount <= 0) {
        await client.query(
            `UPDATE orders
             SET payment_status = 'held', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [order.id]
        );
        return;
    }

    const customerBalance = await getOrCreateBalance(order.customer_id, client);
    if (Number(customerBalance.balance) < amount) {
        const error = new Error('Недостаточно средств на балансе заказчика');
        error.statusCode = 400;
        throw error;
    }

    const holdResult = await client.query(
        `UPDATE user_balances
         SET balance = balance - $1,
             held_balance = held_balance + $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2 AND balance >= $1
         RETURNING balance, held_balance`,
        [amount, order.customer_id]
    );

    if (holdResult.rows.length === 0) {
        const error = new Error('Недостаточно средств на балансе заказчика');
        error.statusCode = 400;
        throw error;
    }

    await client.query(
        `INSERT INTO payments (user_id, type, amount, status, metadata, description)
         VALUES ($1, 'hold', $2, 'succeeded', $3, $4)`,
        [
            order.customer_id,
            amount,
            JSON.stringify({ order_id: order.id }),
            `${descriptionPrefix} #${order.id}`,
        ]
    );

    await client.query(
        `UPDATE orders
         SET payment_status = 'held', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [order.id]
    );
};


const acceptOrder = async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const { orderId } = req.params;
    const userId = req.session.user.id;
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');
        await ensureOrdersTable(client);
        await ensureBalanceTables(client);

        const orderCheck = await client.query(`
            SELECT * FROM orders WHERE id = $1 AND status = 'active' FOR UPDATE
        `, [orderId]);

        if (orderCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Задача не найдена или уже принята' });
        }

        const order = orderCheck.rows[0];
        if (order.customer_id === userId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Нельзя принять собственную задачу' });
        }

        await holdOrderFunds(order, client);

        const updated = await client.query(`
            UPDATE orders
            SET executor_id = $1,
                status = 'in_progress',
                customer_confirmed = FALSE,
                executor_confirmed = FALSE,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
        `, [userId, orderId]);

        await client.query('COMMIT');


        await db.query(`
            INSERT INTO notifications (user_id, message, link)
            VALUES ($1, $2, $3)
        `, [updated.rows[0].customer_id, `Исполнитель принял вашу задачу "${updated.rows[0].title}"`, `/orders/${orderId}`]);

        return res.json({ success: true, order: updated.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Accept order error:', error);
        return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Ошибка при принятии задачи' });
    } finally {
        client.release();
    }
};

const releaseOrderFunds = async (orderId, client = db) => {
    await ensureBalanceTables(client);

    const orderResult = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    if (orderResult.rows.length === 0) return null;

    const order = orderResult.rows[0];
    if (order.payment_status !== 'held') return order;

    const price = roundMoney(order.price);
    const fee = roundMoney(price * PLATFORM_FEE_RATE);
    const payout = roundMoney(price - fee);
    const admin = fee > 0 ? await getPlatformAdminAccount(client) : null;

    if (fee > 0 && !admin) {
        throw new Error('Не найден аккаунт администратора для зачисления комиссии платформы');
    }

    await client.query(`
        UPDATE user_balances
        SET held_balance = held_balance - $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2 AND held_balance >= $1
        RETURNING held_balance
    `, [price, order.customer_id]).then((result) => {
        if (result.rows.length === 0) {
            throw new Error('Недостаточно замороженных средств заказчика для завершения сделки');
        }
    });

    if (order.executor_id && payout > 0) {
        await getOrCreateBalance(order.executor_id, client);
        await client.query(`
            UPDATE user_balances
            SET balance = balance + $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $2
        `, [payout, order.executor_id]);

        await client.query(`
            INSERT INTO payments (user_id, type, amount, status, metadata, description)
            VALUES ($1, 'release', $2, 'succeeded', $3, $4)
        `, [
            order.executor_id,
            payout,
            JSON.stringify({ order_id: order.id, gross_amount: price, fee_amount: fee }),
            `Выплата по заказу #${order.id} после комиссии платформы ${fee} ₽`,
        ]);
    }

    if (admin && fee > 0) {
        await client.query(`
            UPDATE user_balances
            SET balance = balance + $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $2
        `, [fee, admin.id]);

        await client.query(`
            INSERT INTO payments (user_id, type, amount, status, metadata, description)
            VALUES ($1, 'fee', $2, 'succeeded', $3, $4)
        `, [
            admin.id,
            fee,
            JSON.stringify({ order_id: order.id, customer_id: order.customer_id, executor_id: order.executor_id, fee_rate: PLATFORM_FEE_RATE }),
            `Комиссия платформы 3% по заказу #${order.id}`,
        ]);
    }

    const updatedOrder = await client.query(`
        UPDATE orders
        SET payment_status = 'released',
            fee_amount = $1,
            fee_recipient_id = $2,
            platform_fee_rate = $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *
    `, [fee, admin?.id || null, PLATFORM_FEE_RATE, orderId]);

    return updatedOrder.rows[0];
};


const deliverOrder = async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const { orderId } = req.params;
    const userId = req.session.user.id;
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');
        await ensureBalanceTables(client);

        const order = await client.query(`
            SELECT * FROM orders WHERE id = $1 AND executor_id = $2 AND status = 'in_progress' FOR UPDATE
        `, [orderId, userId]);

        if (order.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Задача не найдена' });
        }

        await client.query(`
            UPDATE orders SET executor_confirmed = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1
        `, [orderId]);

        const customerConfirmed = order.rows[0].customer_confirmed;
        if (customerConfirmed) {
            await client.query(`
                UPDATE orders SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1
            `, [orderId]);
            await releaseOrderFunds(orderId, client);
        }

        await client.query('COMMIT');


        await db.query(`
            INSERT INTO notifications (user_id, message, link)
            VALUES ($1, $2, $3)
        `, [order.rows[0].customer_id, `Исполнитель сдал задачу "${order.rows[0].title}"`, `/orders/${orderId}`]);

        return res.json({ success: true, released: customerConfirmed });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Deliver order error:', error);
        return res.status(500).json({ error: 'Ошибка при подтверждении сдачи' });
    } finally {
        client.release();
    }
};


const completeOrder = async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const { orderId } = req.params;
    const userId = req.session.user.id;
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');
        await ensureBalanceTables(client);

        const order = await client.query(`
            SELECT * FROM orders WHERE id = $1 AND customer_id = $2 AND status = 'in_progress' FOR UPDATE
        `, [orderId, userId]);

        if (order.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Задача не найдена' });
        }

        await client.query(`
            UPDATE orders SET customer_confirmed = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1
        `, [orderId]);

        const executorConfirmed = order.rows[0].executor_confirmed;
        if (executorConfirmed) {
            await client.query(`
                UPDATE orders SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1
            `, [orderId]);
            await releaseOrderFunds(orderId, client);
        }

        await client.query('COMMIT');


        if (order.rows[0].executor_id) {
            await db.query(`
                INSERT INTO notifications (user_id, message, link)
                VALUES ($1, $2, $3)
            `, [order.rows[0].executor_id, `Заказчик подтвердил выполнение задачи "${order.rows[0].title}"`, `/orders/${orderId}`]);
        }

        return res.json({ success: true, released: executorConfirmed });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Complete order error:', error);
        return res.status(500).json({ error: 'Ошибка при завершении задачи' });
    } finally {
        client.release();
    }
};


const cancelOrder = async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const { orderId } = req.params;
    const userId = req.session.user.id;
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');
        await ensureBalanceTables(client);

        const order = await client.query(`
            SELECT * FROM orders
            WHERE id = $1 AND (customer_id = $2 OR executor_id = $2)
            AND status IN ('active', 'in_progress')
            FOR UPDATE
        `, [orderId, userId]);

        if (order.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Задача не найдена' });
        }

        const orderData = order.rows[0];


        if (orderData.payment_status === 'held') {
            const refundAmount = roundMoney(orderData.price);
            const refundResult = await client.query(`
                UPDATE user_balances
                SET balance = balance + $1,
                    held_balance = held_balance - $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $2 AND held_balance >= $1
                RETURNING balance, held_balance
            `, [refundAmount, orderData.customer_id]);

            if (refundResult.rows.length === 0) {
                throw new Error('Недостаточно замороженных средств заказчика для возврата');
            }

            await client.query(`
                INSERT INTO payments (user_id, type, amount, status, metadata, description)
                VALUES ($1, 'release', $2, 'succeeded', $3, $4)
            `, [
                orderData.customer_id,
                refundAmount,
                JSON.stringify({ order_id: orderData.id, refund: true }),
                `Возврат замороженных средств по отмене заказа #${orderData.id}`,
            ]);
        }

        await client.query(`
            UPDATE orders
            SET status = 'cancelled', payment_status = 'cancelled', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [orderId]);

        await client.query('COMMIT');


        const otherUserId = orderData.customer_id === userId
            ? orderData.executor_id
            : orderData.customer_id;

        if (otherUserId) {
            await db.query(`
                INSERT INTO notifications (user_id, message, link)
                VALUES ($1, $2, $3)
            `, [otherUserId, `Задача "${orderData.title}" была отменена`, `/orders/${orderId}`]);
        }

        return res.json({ success: true, order: orderData });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Cancel order error:', error);
        return res.status(500).json({ error: 'Ошибка при отмене задачи' });
    } finally {
        client.release();
    }
};


const reviewOrder = async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const { orderId } = req.params;
    const { rating, comment } = req.body;

    if (comment && String(comment).length > TEXTAREA_MAX_LENGTH) {
        return res.status(400).json({ error: `Комментарий не должен превышать ${TEXTAREA_MAX_LENGTH} символов` });
    }
    const userId = req.session.user.id;

    try {
        await ensureReviewModerationColumns();

        const order = await db.query(`
            SELECT * FROM orders
            WHERE id = $1 AND status = 'completed'
            AND (customer_id = $2 OR executor_id = $2)
        `, [orderId, userId]);

        if (order.rows.length === 0) {
            return res.status(404).json({ error: 'Задача не найдена' });
        }

        await db.query(`
            INSERT INTO order_reviews (order_id, reviewer_id, rating, comment, status)
            VALUES ($1, $2, $3, $4, 'pending')
            ON CONFLICT (order_id, reviewer_id) DO UPDATE
            SET rating = $3, comment = $4, status = 'pending'
        `, [orderId, userId, rating, comment || null]);

        res.json({ success: true });
    } catch (error) {
        console.error('Review order error:', error);
        if (process.env.NODE_ENV !== 'production') {
            return res.status(500).json({ error: `Ошибка при сохранении отзыва: ${error.message}` });
        }
        res.status(500).json({ error: 'Ошибка при сохранении отзыва' });
    }
};

const toggleStage = async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    const { orderId, stageId } = req.params;
    const userId = req.session.user.id;
    try {
        await ensureOrderStagesTable(db);
        const order = await db.query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
        if (order.rows.length === 0) {
            return res.status(404).json({ error: 'Задача не найдена' });
        }
        if (order.rows[0].executor_id !== userId || order.rows[0].status !== 'in_progress') {
            return res.status(403).json({ error: 'Только исполнитель может отмечать этапы в активной сделке' });
        }
        const stage = await db.query(
            `UPDATE order_stages SET completed = NOT completed WHERE id = $1 AND order_id = $2 RETURNING *`,
            [stageId, orderId]
        );
        if (stage.rows.length === 0) {
            return res.status(404).json({ error: 'Этап не найден' });
        }
        res.json({ success: true, stage: stage.rows[0] });
    } catch (error) {
        console.error('Toggle stage error:', error);
        res.status(500).json({ error: 'Ошибка при обновлении этапа' });
    }
};


const normalizeStagePayload = (stages) => {
    if (!Array.isArray(stages)) {
        return [];
    }

    return stages
        .map((stage, index) => ({
            id: Number.parseInt(stage.id, 10) || null,
            name: String(stage.name || stage.title || '').trim(),
            deadline: stage.deadline || null,
            completed: stage.completed === true || stage.completed === 'true',
            sort_order: index,
        }))
        .filter(stage => stage.name.length > 0)
        .slice(0, 50);
};

const proposeStageChanges = async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const { orderId } = req.params;
    const userId = req.session.user.id;
    const stages = normalizeStagePayload(req.body.stages);

    if (stages.length === 0) {
        return res.status(400).json({ error: 'Добавьте хотя бы один этап' });
    }

    try {
        await ensureOrderStagesTable(db);

        const orderResult = await db.query(
            `SELECT * FROM orders WHERE id = $1`,
            [orderId]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Сделка не найдена' });
        }

        const order = orderResult.rows[0];
        if (order.executor_id !== userId || order.status !== 'in_progress') {
            return res.status(403).json({ error: 'Только исполнитель может отправить изменения этапов' });
        }

        const currentStagesResult = await db.query(
            `SELECT id, name, deadline
             FROM order_stages
             WHERE order_id = $1`,
            [orderId]
        );
        const proposedIds = new Set(stages.filter(stage => stage.id).map(stage => stage.id));
        const hasRemovedStages = currentStagesResult.rows.some(stage => !proposedIds.has(stage.id));
        const hasChangedStages = stages.some(stage => {
            const currentStage = currentStagesResult.rows.find(existing => existing.id === stage.id);
            if (!currentStage) {
                return true;
            }

            const currentDeadline = currentStage.deadline ? new Date(currentStage.deadline).toISOString().slice(0, 10) : null;
            return currentStage.name !== stage.name || currentDeadline !== stage.deadline;
        });

        await db.query(
            `UPDATE order_stage_change_requests
             SET status = 'rejected', responded_at = CURRENT_TIMESTAMP
             WHERE order_id = $1 AND status = 'pending'`,
            [orderId]
        );

        const requestResult = await db.query(
            `INSERT INTO order_stage_change_requests (order_id, executor_id, customer_id, stages)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [orderId, userId, order.customer_id, JSON.stringify(stages)]
        );

        const notificationMessage = hasRemovedStages
            ? 'Исполнитель предложил удалить или изменить этапы сделки — требуется подтверждение'
            : (hasChangedStages
                ? 'Исполнитель предложил изменить этапы и дедлайны сделки — требуется подтверждение'
                : 'Исполнитель отправил этапы сделки на подтверждение');

        await db.query(
            `INSERT INTO notifications (user_id, message, link)
             VALUES ($1, $2, $3)`,
            [order.customer_id, notificationMessage, `/orders/${orderId}`]
        );

        return res.json({ success: true, request: requestResult.rows[0] });
    } catch (error) {
        console.error('Propose stage changes error:', error);
        return res.status(500).json({ error: 'Ошибка при отправке изменений этапов' });
    }
};

const respondStageChanges = async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const { orderId, requestId } = req.params;
    const { action } = req.body;
    const userId = req.session.user.id;

    if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Неверное действие' });
    }

    const client = await db.pool.connect();
    try {
        await ensureOrderStagesTable(client);
        await client.query('BEGIN');

        const requestResult = await client.query(
            `SELECT r.*, o.status AS order_status
             FROM order_stage_change_requests r
             JOIN orders o ON o.id = r.order_id
             WHERE r.id = $1 AND r.order_id = $2
             FOR UPDATE`,
            [requestId, orderId]
        );

        if (requestResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Запрос изменений не найден' });
        }

        const changeRequest = requestResult.rows[0];
        if (changeRequest.customer_id !== userId) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Только заказчик может подтвердить изменения' });
        }

        if (changeRequest.status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Запрос изменений уже обработан' });
        }

        if (changeRequest.order_status !== 'in_progress') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Изменять этапы можно только в активной сделке' });
        }

        if (action === 'approve') {
            const stages = normalizeStagePayload(changeRequest.stages);
            await client.query(`DELETE FROM order_stages WHERE order_id = $1`, [orderId]);

            for (const stage of stages) {
                await client.query(
                    `INSERT INTO order_stages (order_id, name, deadline, sort_order, completed)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [orderId, stage.name, stage.deadline, stage.sort_order, stage.completed]
                );
            }
        }

        await client.query(
            `UPDATE order_stage_change_requests
             SET status = $1, responded_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [action === 'approve' ? 'approved' : 'rejected', requestId]
        );

        await client.query('COMMIT');

        await db.query(
            `INSERT INTO notifications (user_id, message, link)
             VALUES ($1, $2, $3)`,
            [changeRequest.executor_id, action === 'approve' ? 'Заказчик подтвердил изменения этапов сделки' : 'Заказчик отклонил изменения этапов сделки', `/orders/${orderId}`]
        );

        return res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Respond stage changes error:', error);
        return res.status(500).json({ error: 'Ошибка при обработке изменений этапов' });
    } finally {
        client.release();
    }
};

module.exports = {
    createOrder,
    getServicesCatalog,
    getUserOrders,
    acceptOrder,
    deliverOrder,
    completeOrder,
    cancelOrder,
    reviewOrder,
    toggleStage,
    proposeStageChanges,
    respondStageChanges,
    ensureOrderStagesTable,
    ensureOrdersTable,
    holdOrderFunds,
    releaseOrderFunds
};
