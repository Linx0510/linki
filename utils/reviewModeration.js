const db = require('../config/database');

const ensureReviewModerationColumns = async () => {
  await db.query(`
    ALTER TABLE IF EXISTS service_reviews
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'approved',
      ADD COLUMN IF NOT EXISTS moderation_comment TEXT;
    ALTER TABLE IF EXISTS order_reviews
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'approved',
      ADD COLUMN IF NOT EXISTS moderation_comment TEXT;
    ALTER TABLE IF EXISTS user_reviews
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'approved',
      ADD COLUMN IF NOT EXISTS moderation_comment TEXT;
  `);
};

const recalcServiceReviewStats = async (serviceId) => {
  await db.query(`
    UPDATE services
    SET avg_rating = COALESCE((SELECT AVG(rating)::numeric(4,1)
                               FROM service_reviews
                               WHERE service_id = $1 AND status = 'approved'), 0),
        total_reviews = (SELECT COUNT(*) FROM service_reviews WHERE service_id = $1 AND status = 'approved')
    WHERE id = $1
  `, [serviceId]);
};

const recalcUserReviewStats = async (userId) => {
  await db.query(`
    UPDATE users
    SET avg_rating = COALESCE((SELECT AVG(rating)::numeric(4,1)
                               FROM user_reviews
                               WHERE reviewed_user_id = $1 AND status = 'approved'), 0),
        total_reviews = (SELECT COUNT(*) FROM user_reviews WHERE reviewed_user_id = $1 AND status = 'approved')
    WHERE id = $1
  `, [userId]);
};

module.exports = {
  ensureReviewModerationColumns,
  recalcServiceReviewStats,
  recalcUserReviewStats,
};
