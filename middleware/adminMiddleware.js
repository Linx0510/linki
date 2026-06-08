const db = require('../config/database');


const isAdmin = async (userId) => {
    if (!userId) return false;

    const result = await db.query(`
        SELECT r.name FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE u.id = $1
    `, [userId]);

    return result.rows[0]?.name === 'admin';
};


const requireAdmin = async (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/auth?error=Требуется авторизация');
    }

    const admin = await isAdmin(req.session.user.id);
    if (!admin) {
        return res.status(403).send('Доступ запрещён. Требуются права администратора.');
    }

    next();
};


const logActivity = (action, getDetails = null) => {
    return async (req, res, next) => {
        if (req.session.user) {
            const details = getDetails ? await getDetails(req) : {};

            await db.query(`
                INSERT INTO user_activity_logs (user_id, action, details, ip_address, user_agent)
                VALUES ($1, $2, $3, $4, $5)
            `, [
                req.session.user.id,
                action,
                JSON.stringify(details),
                req.ip,
                req.headers['user-agent']
            ]);
        }
        next();
    };
};

module.exports = {
    isAdmin,
    requireAdmin,
    logActivity
};