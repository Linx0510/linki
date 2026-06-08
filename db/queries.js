const pool = require('./pool');

const queries = {
  // --- USERS ---
  // Full user record for authenticated owner — never expose to public
  async getUserById(id) {
    const { rows } = await pool.query(
      `SELECT id, username, email, role, xp, level, avatar_url, energy,
              last_energy_update, created_at
       FROM users WHERE id = $1`,
      [id]
    );
    return rows[0];
  },

  // Safe public profile — no email, no password_hash, no energy internals
  async getUserPublicProfile(id) {
    const { rows } = await pool.query(
      `SELECT id, username, role, xp, level, avatar_url, created_at
       FROM users WHERE id = $1`,
      [id]
    );
    return rows[0];
  },

  async syncUserEnergy(userId) {
    const text = `
      UPDATE users 
      SET 
        energy = LEAST(100, energy + FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_energy_update)) / 3600) * 10),
        last_energy_update = last_energy_update + (FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_energy_update)) / 3600) * INTERVAL '1 hour')
      WHERE id = $1 AND last_energy_update < CURRENT_TIMESTAMP - INTERVAL '1 hour'
      RETURNING energy`;
    const { rows } = await pool.query(text, [userId]);
    return rows[0] ? rows[0].energy : null;
  },

  async getUserByEmail(email) {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0];
  },

  async getUserByUsername(username) {
    const { rows } = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    return rows[0];
  },

  async getUserActiveQuests(userId) {
    const text = `
      SELECT q.name, q.duration_days, uq.current_day, uq.status
      FROM user_quests uq
      JOIN quests q ON uq.quest_id = q.id
      WHERE uq.user_id = $1 AND uq.status = 'active'
      ORDER BY uq.joined_at DESC
      LIMIT 5`;
    const { rows } = await pool.query(text, [userId]);
    return rows;
  },

  async createUser(username, email, passwordHash, role = 'user') {
    const text = `
      INSERT INTO users (username, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, username, email, role`;
    const { rows } = await pool.query(text, [username, email, passwordHash, role]);
    return rows[0];
  },

  async updateUserProfile(id, username, email) {
    const text = `
      UPDATE users 
      SET username = $2, email = $3
      WHERE id = $1 
      RETURNING id, username, email, role, xp, level, avatar_url`;
    const { rows } = await pool.query(text, [id, username, email]);
    return rows[0];
  },

  async updateUserAvatar(id, avatarUrl) {
    const text = `
      UPDATE users SET avatar_url = $2 WHERE id = $1 
      RETURNING id, username, email, role, xp, level, avatar_url`;
    const { rows } = await pool.query(text, [id, avatarUrl]);
    return rows[0];
  },

  async updateUserXP(userId, xpToAdd) {
    const text = `
      UPDATE users 
      SET xp = xp + $2, 
          level = floor((xp + $2) / 1000) + 1 
      WHERE id = $1 
      RETURNING xp, level`;
    const { rows } = await pool.query(text, [userId, xpToAdd]);
    return rows[0];
  },

  // --- QUESTS ---
  async getQuestById(id) {
    const { rows } = await pool.query('SELECT * FROM quests WHERE id = $1', [id]);
    return rows[0];
  },

  async getAllQuests({ limit = 50, offset = 0, type = null } = {}) {
    let text = `
      SELECT q.*, u.username as expert_name, u.role as creator_role
      FROM quests q
      LEFT JOIN users u ON q.expert_id = u.id`;
    const params = [Math.min(limit, 200), offset];
    if (type === 'expert' || type === 'community') {
      text += ' WHERE q.quest_type = $3';
      params.push(type);
    }
    text += ' ORDER BY q.created_at DESC LIMIT $1 OFFSET $2';
    const { rows } = await pool.query(text, params);
    return rows;
  },

  async checkAndAwardAchievements(userId, type) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // 1. Получаем ачивки этого типа, которых у юзера еще нет
      const text = `
        SELECT * FROM achievements 
        WHERE requirement_type = $1 
        AND id NOT IN (SELECT achievement_id FROM user_achievements WHERE user_id = $2)`;
      const { rows: potentialAchievs } = await client.query(text, [type, userId]);

      const awarded = [];

      for (const ach of potentialAchievs) {
        let isEligible = false;
        
        // 2. Проверяем условия в зависимости от типа
        if (type === 'quest_join') {
          const { rows } = await client.query('SELECT COUNT(*) FROM user_quests WHERE user_id = $1', [userId]);
          if (parseInt(rows[0].count) >= ach.requirement_value) isEligible = true;
        } else if (type === 'task_complete') {
          const { rows } = await client.query('SELECT COUNT(*) FROM quest_submissions WHERE status = $1 AND user_quest_id IN (SELECT id FROM user_quests WHERE user_id = $2)', ['approved', userId]);
          if (parseInt(rows[0].count) >= ach.requirement_value) isEligible = true;
        } else if (type === 'streak') {
          // Вызываем наш существующий метод расчета стрика
          const streak = await this.getUserStreak(userId);
          if (streak >= ach.requirement_value) isEligible = true;
        } else if (type === 'purchase') {
          const { rows } = await client.query('SELECT COUNT(*) FROM transactions WHERE user_id = $1 AND purpose = $2 AND status = $3', [userId, 'quest_purchase', 'completed']);
          if (parseInt(rows[0].count) >= ach.requirement_value) isEligible = true;
        }

        // 3. Если условие выполнено — награждаем
        if (isEligible) {
          await client.query('INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2)', [userId, ach.id]);
          await client.query('UPDATE users SET xp = xp + $1 WHERE id = $2', [ach.reward_xp, userId]);
          
          // Создаем уведомление
          await client.query(
            'INSERT INTO notifications (user_id, type, title, content) VALUES ($1, $2, $3, $4)',
            [userId, 'achievement', 'Новое достижение!', `Вы получили ачивку «${ach.name}» и +${ach.reward_xp} XP!`]
          );
          
          awarded.push(ach);
        }
      }

      await client.query('COMMIT');
      return awarded;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async joinQuest(userId, questId) {
    const check = 'SELECT * FROM user_quests WHERE user_id=$1 AND quest_id=$2';
    const existing = await pool.query(check, [userId, questId]);
    if (existing.rows.length > 0) return existing.rows[0];

    const text = 'INSERT INTO user_quests (user_id, quest_id) VALUES ($1, $2) RETURNING *';
    const { rows } = await pool.query(text, [userId, questId]);
    
    // Проверка ачивок после вступления
    await this.checkAndAwardAchievements(userId, 'quest_join');
    
    return rows[0];
  },

  async completeQuestDay(userId, questId, date) {
    const text = `
      UPDATE user_quests 
      SET completed_days = completed_days || jsonb_build_array($3::text)
      WHERE user_id = $1 AND quest_id = $2
      AND NOT (completed_days @> jsonb_build_array($3::text))
      RETURNING *`;
    const { rows } = await pool.query(text, [userId, questId, date]);
    return rows[0];
  },

  // --- QUEST TASKS & SUBMISSIONS ---
  async getTaskByDay(questId, dayNumber) {
    const text = 'SELECT * FROM quest_tasks WHERE quest_id = $1 AND day_number = $2';
    const { rows } = await pool.query(text, [questId, dayNumber]);
    return rows[0];
  },

  async submitReport(userQuestId, dayNumber, fileUrl, comment) {
    const text = `
      INSERT INTO quest_submissions (user_quest_id, day_number, file_url, comment)
      VALUES ($1, $2, $3, $4)
      RETURNING *`;
    const { rows } = await pool.query(text, [userQuestId, dayNumber, fileUrl, comment]);
    return rows[0];
  },

  async getUserQuestProgress(userId, questId) {
    const text = `
      SELECT uq.*, q.name as quest_name, q.duration_days
      FROM user_quests uq
      JOIN quests q ON uq.quest_id = q.id
      WHERE uq.user_id = $1 AND uq.quest_id = $2`;
    const { rows } = await pool.query(text, [userId, questId]);
    return rows[0];
  },

  // --- MODERATION ---
  async getAllSubmissions({ limit = 100, offset = 0 } = {}) {
    const text = `
      SELECT qs.*, u.username, q.name as quest_name, q.reward_xp
      FROM quest_submissions qs
      JOIN user_quests uq ON qs.user_quest_id = uq.id
      JOIN users u ON uq.user_id = u.id
      JOIN quests q ON uq.quest_id = q.id
      ORDER BY qs.created_at DESC
      LIMIT $1 OFFSET $2`;
    const { rows } = await pool.query(text, [Math.min(limit, 200), offset]);
    return rows;
  },

  async updateSubmissionStatus(submissionId, status, adminComment) {
    const VALID_STATUSES = ['approved', 'rejected', 'pending'];
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`Недопустимый статус: ${status}`);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const res = await client.query(
        'UPDATE quest_submissions SET status = $2, comment = $3 WHERE id = $1 RETURNING *',
        [submissionId, status, adminComment]
      );
      const sub = res.rows[0];
      if (!sub) throw new Error('Отчёт не найден');

      if (status === 'approved') {
        const questInfo = await client.query(`
          SELECT uq.user_id, q.reward_xp
          FROM quest_submissions qs
          JOIN user_quests uq ON qs.user_quest_id = uq.id
          JOIN quests q ON uq.quest_id = q.id
          WHERE qs.id = $1`, [submissionId]);

        if (!questInfo.rows[0]) throw new Error('Данные квеста не найдены');
        const { user_id, reward_xp } = questInfo.rows[0];
        const dayXp = Math.round(reward_xp / 10);

        await client.query(
          'UPDATE users SET xp = xp + $2, level = floor((xp + $2) / 1000) + 1 WHERE id = $1',
          [user_id, dayXp]
        );
        await client.query(
          'INSERT INTO notifications (user_id, type, title, content) VALUES ($1, $2, $3, $4)',
          [user_id, 'quest_update', 'Отчёт принят!', `Ваш отчёт за день ${sub.day_number} одобрен. Начислено ${dayXp} XP.`]
        );
        await this.checkAndAwardAchievements(user_id, 'task_complete');
      } else if (status === 'rejected') {
        const questInfo = await client.query(`
          SELECT uq.user_id FROM quest_submissions qs
          JOIN user_quests uq ON qs.user_quest_id = uq.id
          WHERE qs.id = $1`, [submissionId]);

        if (questInfo.rows[0]) {
          await client.query(
            'INSERT INTO notifications (user_id, type, title, content) VALUES ($1, $2, $3, $4)',
            [questInfo.rows[0].user_id, 'system', 'Отчёт отклонён', `Ваш отчёт за день ${sub.day_number} не прошёл модерацию: ${adminComment || 'без комментария'}`]
          );
        }
      }

      await client.query('COMMIT');
      return sub;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  // --- SESSIONS & BOOKING ---
  async getExpertAvailability(expertId) {
    const text = 'SELECT * FROM expert_availability WHERE expert_id = $1 ORDER BY day_of_week, start_time';
    const { rows } = await pool.query(text, [expertId]);
    return rows;
  },

  async bookSession(expertId, userId, scheduledAt, duration, price, link) {
    const text = `
      INSERT INTO expert_sessions (expert_id, user_id, scheduled_at, duration_minutes, price_paid, meeting_link)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`;
    const { rows } = await pool.query(text, [expertId, userId, scheduledAt, duration, price, link]);
    return rows[0];
  },

  async getUserSessions(userId) {
    const text = `
      SELECT s.*, u.username as expert_name, ep.specialization
      FROM expert_sessions s
      JOIN users u ON s.expert_id = u.id
      JOIN expert_profiles ep ON u.id = ep.user_id
      WHERE s.user_id = $1
      ORDER BY s.scheduled_at DESC`;
    const { rows } = await pool.query(text, [userId]);
    return rows;
  },

  async updateSessionStatus(sessionId, status) {
    const text = 'UPDATE expert_sessions SET status = $2 WHERE id = $1 RETURNING *';
    const { rows } = await pool.query(text, [sessionId, status]);
    return rows[0];
  },

  // --- ECONOMY & SUBSCRIPTIONS ---
  async getUserSubscription(userId) {
    const text = 'SELECT * FROM user_subscriptions WHERE user_id = $1';
    const { rows } = await pool.query(text, [userId]);
    return rows[0];
  },

  async createTransaction(userId, amount, purpose, expertId = null) {
    const text = `
      INSERT INTO transactions (user_id, amount, purpose, expert_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *`;
    const { rows } = await pool.query(text, [userId, amount, purpose, expertId]);
    return rows[0];
  },

  async getExpertSubmissions(expertId) {
    const text = `
      SELECT qs.*, q.name as quest_title, u.username as user_username, u.avatar_url as user_avatar
      FROM quest_submissions qs
      JOIN user_quests uq ON qs.user_quest_id = uq.id
      JOIN quests q ON uq.quest_id = q.id
      JOIN users u ON uq.user_id = u.id
      WHERE q.expert_id = $1
      ORDER BY qs.created_at DESC`;
    const { rows } = await pool.query(text, [expertId]);
    return rows;
  },

  async getExpertTransactions(expertId) {
    const text = `
      SELECT t.*, u.username as buyer_name
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE t.expert_id = $1
      ORDER BY t.created_at DESC`;
    const { rows } = await pool.query(text, [expertId]);
    return rows;
  },

  async getUserStreak(userId) {
    const text = `
      WITH date_series AS (
        SELECT DISTINCT created_at::date as active_date
        FROM user_xp_history
        WHERE user_id = $1
      ),
      streak_groups AS (
        SELECT active_date,
               active_date - (row_number() OVER (ORDER BY active_date) * INTERVAL '1 day') as grp
        FROM date_series
      )
      SELECT COUNT(*) as streak
      FROM streak_groups
      WHERE grp = (
        SELECT grp FROM streak_groups 
        WHERE active_date >= CURRENT_DATE - INTERVAL '1 day'
        ORDER BY active_date DESC LIMIT 1
      )`;
    const { rows } = await pool.query(text, [userId]);
    return rows[0] ? parseInt(rows[0].streak) : 0;
  },

  // --- ADMIN DASHBOARD ---
  async getAdminStats() {
    const stats = {};
    
    // Общая выручка
    const revenueRes = await pool.query("SELECT SUM(amount) as total FROM transactions WHERE status = 'completed'");
    stats.totalRevenue = revenueRes.rows[0].total || 0;

    // Квесты по типам
    const questsRes = await pool.query('SELECT quest_type, COUNT(*) as count FROM quests GROUP BY quest_type');
    stats.questTypes = questsRes.rows;

    // Общее количество пользователей
    const usersCount = await pool.query('SELECT COUNT(*) as count FROM users');
    stats.totalUsers = usersCount.rows[0].count;

    return stats;
  },

  // --- EXPERT DASHBOARD ---
  async getExpertQuests(expertId) {
    const text = `
      SELECT q.*, (SELECT COUNT(*) FROM user_quests uq WHERE uq.quest_id = q.id) as participants_count
      FROM quests q
      WHERE q.expert_id = $1
      ORDER BY q.created_at DESC`;
    const { rows } = await pool.query(text, [expertId]);
    return rows;
  },

  async getExpertClients(expertId) {
    const text = `
      SELECT DISTINCT u.id, u.username, u.email, u.avatar_url, u.level, uq.joined_at, q.name as quest_name
      FROM user_quests uq
      JOIN users u ON uq.user_id = u.id
      JOIN quests q ON uq.quest_id = q.id
      WHERE q.expert_id = $1
      ORDER BY uq.joined_at DESC`;
    const { rows } = await pool.query(text, [expertId]);
    return rows;
  },

  async getExpertFinances(expertId) {
    const text = `
      SELECT 
        COALESCE(SUM(amount), 0) as total_gross,
        COALESCE(SUM(amount) * 0.7, 0) as total_net
      FROM transactions
      WHERE expert_id = $1 AND status = 'completed'`;
    const { rows } = await pool.query(text, [expertId]);
    return { 
      revenue: parseFloat(rows[0].total_net),
      gross: parseFloat(rows[0].total_gross)
    };
  },

  async getTopPlayers(limit = 10) {
    const text = `
      SELECT username, level, xp, avatar_url, role
      FROM users
      WHERE role = 'user'
      ORDER BY xp DESC
      LIMIT $1`;
    const { rows } = await pool.query(text, [limit]);
    return rows;
  },

  async createFullQuest(expertId, questData, tasks) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // 1. Создаем сам квест
      const questRes = await client.query(
        `INSERT INTO quests (expert_id, name, description, category, difficulty, duration_days, reward_xp, price, quest_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [expertId, questData.name, questData.description, questData.category, questData.difficulty, questData.duration, questData.rewardXp, questData.price, questData.questType || 'expert']
      );
      const questId = questRes.rows[0].id;

      // 2. Добавляем задачи по дням
      for (const task of tasks) {
        await client.query(
          `INSERT INTO quest_tasks (quest_id, day_number, title, description, instructions_html)
           VALUES ($1, $2, $3, $4, $5)`,
          [questId, task.day, task.title, task.description, task.instructions]
        );
      }

      await client.query('COMMIT');
      return questId;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  // --- RPG & ACHIEVEMENTS ---
  async awardAchievement(userId, achievementId) {
    const text = `
      INSERT INTO user_achievements (user_id, achievement_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, achievement_id) DO NOTHING
      RETURNING *`;
    const { rows } = await pool.query(text, [userId, achievementId]);
    return rows[0];
  },

  async getUserAchievements(userId) {
    const text = `
      SELECT a.*, ua.earned_at
      FROM achievements a
      JOIN user_achievements ua ON a.id = ua.achievement_id
      WHERE ua.user_id = $1
      ORDER BY ua.earned_at DESC`;
    const { rows } = await pool.query(text, [userId]);
    return rows;
  },

  async updateUserSkill(userId, skillName, xpToAdd) {
    const text = `
      INSERT INTO user_skills (user_id, skill_name, current_xp)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, skill_name) DO UPDATE
      SET current_xp = user_skills.current_xp + $3,
          level = floor((user_skills.current_xp + $3) / 500) + 1
      RETURNING *`;
    const { rows } = await pool.query(text, [userId, skillName, xpToAdd]);
    return rows[0];
  },

  async getUserSkills(userId) {
    const text = 'SELECT * FROM user_skills WHERE user_id = $1';
    const { rows } = await pool.query(text, [userId]);
    return rows;
  },

  // --- NOTIFICATIONS ---
  async createNotification(userId, type, title, content) {
    const text = `
      INSERT INTO notifications (user_id, type, title, content)
      VALUES ($1, $2, $3, $4)
      RETURNING *`;
    const { rows } = await pool.query(text, [userId, type, title, content]);
    return rows[0];
  },

  async getUserNotifications(userId) {
    const text = `
      SELECT * FROM notifications 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 50`;
    const { rows } = await pool.query(text, [userId]);
    return rows;
  },

  async markNotificationAsRead(notificationId) {
    const text = 'UPDATE notifications SET is_read = TRUE WHERE id = $1 RETURNING *';
    const { rows } = await pool.query(text, [notificationId]);
    return rows[0];
  },

  async getUnreadCount(userId) {
    const text = 'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = FALSE';
    const { rows } = await pool.query(text, [userId]);
    return rows[0].count;
  },

  async getExpertFullProfile(expertId) {
    const expertRes = await pool.query(`
      SELECT u.id, u.username as name, u.avatar_url, ep.specialization, ep.bio, ep.rating, 
             ep.experience_years, ep.consultation_price as price
      FROM users u
      JOIN expert_profiles ep ON u.id = ep.user_id
      WHERE u.id = $1`, [expertId]);
      
    if (expertRes.rows.length === 0) return null;
    
    // Get stats (students count is count of unique users in their quests)
    const statsRes = await pool.query(`
      SELECT COUNT(DISTINCT uq.user_id) as students_count,
             (SELECT COUNT(*) FROM reviews WHERE expert_id = $1) as reviews_count
      FROM quests q
      LEFT JOIN user_quests uq ON q.id = uq.quest_id
      WHERE q.expert_id = $1`, [expertId]);
    
    const questsRes = await pool.query(`
      SELECT id, name, description, duration_days, reward_xp, price, difficulty 
      FROM quests WHERE expert_id = $1`, [expertId]);
    
    return {
      ...expertRes.rows[0],
      ...statsRes.rows[0],
      quests: questsRes.rows
    };
  },

  // --- EXPERTS ---
  async getVerifiedExperts() {
    const text = `
      SELECT u.username, ep.* 
      FROM expert_profiles ep
      JOIN users u ON ep.user_id = u.id
      WHERE ep.is_verified = TRUE
      ORDER BY ep.rating DESC`;
    const { rows } = await pool.query(text);
    return rows;
  },

  async updateExpertProfile(userId, data) {
    const text = `
      INSERT INTO expert_profiles (user_id, specialization, bio, experience_years, consultation_price)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) DO UPDATE
      SET specialization = EXCLUDED.specialization,
          bio = EXCLUDED.bio,
          experience_years = EXCLUDED.experience_years,
          consultation_price = EXCLUDED.consultation_price
      RETURNING *`;
    const { rows } = await pool.query(text, [
      userId, 
      data.specialization || 'Специалист', 
      data.bio || '', 
      data.experience_years ?? data.experience ?? 0, 
      data.price ?? data.consultation_price ?? 0
    ]);
    return rows[0];
  },
  async getExpertReviews(expertId) {
    const text = `
      SELECT r.*, u.username, u.avatar_url
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.expert_id = $1
      ORDER BY r.created_at DESC`;
    const { rows } = await pool.query(text, [expertId]);
    return rows;
  },

  async replyToReview(reviewId, expertId, replyText) {
    const text = `
      UPDATE reviews SET reply_text = $1
      WHERE id = $2 AND expert_id = $3
      RETURNING *`;
    const { rows } = await pool.query(text, [replyText, reviewId, expertId]);
    return rows[0];
  },

  // --- MESSAGES ---
  async getChatHistory(user1, user2) {
    const text = `
      SELECT * FROM messages 
      WHERE (sender_id = $1 AND receiver_id = $2)
         OR (sender_id = $2 AND receiver_id = $1)
      ORDER BY created_at ASC`;
    const { rows } = await pool.query(text, [user1, user2]);
    return rows;
  },

  async sendMessage(senderId, receiverId, content) {
    const text = 'INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING *';
    const { rows } = await pool.query(text, [senderId, receiverId, content]);
    return rows[0];
  },

  async getUserChats(userId) {
    const text = `
      WITH last_msgs AS (
        SELECT DISTINCT ON (
          CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END
        )
        id, sender_id, receiver_id, content, created_at
        FROM messages
        WHERE sender_id = $1 OR receiver_id = $1
        ORDER BY CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END, created_at DESC
      )
      SELECT lm.*, u.username as contact_name, u.avatar_url as contact_avatar, u.role as contact_role
      FROM last_msgs lm
      JOIN users u ON u.id = (CASE WHEN lm.sender_id = $1 THEN lm.receiver_id ELSE lm.sender_id END)
      ORDER BY lm.created_at DESC`;
    const { rows } = await pool.query(text, [userId]);
    return rows;
  }
};

module.exports = queries;
