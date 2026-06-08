-- Сброс ВСЕХ таблиц перед созданием (в правильном порядке зависимостей)
DROP TABLE IF EXISTS user_xp_history CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS user_skills CASCADE;
DROP TABLE IF EXISTS user_achievements CASCADE;
DROP TABLE IF EXISTS achievements CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS user_subscriptions CASCADE;
DROP TABLE IF EXISTS expert_sessions CASCADE;
DROP TABLE IF EXISTS expert_availability CASCADE;
DROP TABLE IF EXISTS quest_submissions CASCADE;
DROP TABLE IF EXISTS quest_tasks CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS user_quests CASCADE;
DROP TABLE IF EXISTS quests CASCADE;
DROP TABLE IF EXISTS expert_profiles CASCADE;
DROP TABLE IF EXISTS support_tickets CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ==========================================
-- СХЕМА БАЗЫ ДАННЫХ
-- ==========================================

-- 1. Пользователи
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    avatar_url TEXT,
    energy INTEGER DEFAULT 100,
    last_energy_update TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Профили экспертов
CREATE TABLE expert_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    specialization VARCHAR(100) NOT NULL,
    bio TEXT,
    rating DECIMAL(3,2) DEFAULT 0,
    experience_years INTEGER DEFAULT 0,
    is_verified BOOLEAN DEFAULT FALSE,
    consultation_price INTEGER DEFAULT 0
);

-- 3. Квесты
CREATE TABLE quests (
    id SERIAL PRIMARY KEY,
    expert_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(50),
    difficulty VARCHAR(20),
    duration_days INTEGER NOT NULL,
    reward_xp INTEGER NOT NULL,
    price INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Задания квестов
CREATE TABLE quest_tasks (
    id SERIAL PRIMARY KEY,
    quest_id INTEGER REFERENCES quests(id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    instructions_html TEXT,
    task_type VARCHAR(20) DEFAULT 'video',
    UNIQUE(quest_id, day_number)
);

-- 5. Участие в квестах
CREATE TABLE user_quests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    quest_id INTEGER REFERENCES quests(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'active',
    current_day INTEGER DEFAULT 1,
    completed_days JSONB DEFAULT '[]',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, quest_id)
);

-- 6. Отчёты пользователей
CREATE TABLE quest_submissions (
    id SERIAL PRIMARY KEY,
    user_quest_id INTEGER REFERENCES user_quests(id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL,
    file_url TEXT,
    comment TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    xp_awarded INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Расписание экспертов
CREATE TABLE expert_availability (
    id SERIAL PRIMARY KEY,
    expert_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    UNIQUE(expert_id, day_of_week, start_time)
);

-- 8. Сессии
CREATE TABLE expert_sessions (
    id SERIAL PRIMARY KEY,
    expert_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER DEFAULT 60,
    status VARCHAR(20) DEFAULT 'confirmed',
    price_paid INTEGER DEFAULT 0,
    meeting_link TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Подписки
CREATE TABLE user_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    tier VARCHAR(20) DEFAULT 'free',
    status VARCHAR(20) DEFAULT 'active',
    starts_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ends_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id)
);

-- 10. Транзакции
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    expert_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'RUB',
    purpose VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Достижения
CREATE TABLE achievements (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    reward_xp INTEGER DEFAULT 0,
    requirement_type VARCHAR(50),
    requirement_value INTEGER DEFAULT 1,
    icon_url TEXT,
    category VARCHAR(50)
);

CREATE TABLE user_achievements (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    achievement_id INTEGER REFERENCES achievements(id) ON DELETE CASCADE,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, achievement_id)
);

-- 12. Навыки
CREATE TABLE user_skills (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    skill_name VARCHAR(50) NOT NULL,
    level INTEGER DEFAULT 1,
    current_xp INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, skill_name)
);

-- 13. Уведомления
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL,
    title VARCHAR(150) NOT NULL,
    content TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. История XP
CREATE TABLE user_xp_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    reason VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 15. Отзывы
CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    expert_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    reply_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 16. Сообщения
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 17. Обращения в поддержку
CREATE TABLE support_tickets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    subject VARCHAR(200),
    message TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'open',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- ИНДЕКСЫ
-- ==========================================

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_user_quests_user_id ON user_quests(user_id);
CREATE INDEX idx_user_quests_quest_id ON user_quests(quest_id);
CREATE INDEX idx_quest_submissions_user_quest_id ON quest_submissions(user_quest_id);
CREATE INDEX idx_quest_tasks_quest_day ON quest_tasks(quest_id, day_number);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read);
CREATE INDEX idx_messages_sender_receiver ON messages(sender_id, receiver_id);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_expert_id ON transactions(expert_id);
CREATE INDEX idx_user_xp_history_user_id ON user_xp_history(user_id);
CREATE INDEX idx_user_xp_history_user_date ON user_xp_history(user_id, created_at);
CREATE INDEX idx_user_achievements_user_id ON user_achievements(user_id);

-- ==========================================
-- SEED DATA (Наполнение данными)
-- ==========================================

INSERT INTO users (username, email, password_hash, role, xp, level) VALUES
('Alex_Kostenko',    'alex@ludo.com',  '$2b$10$zywt.IZuOf5/HEwIKolA6ekk1jpwQuJUH4BQ2QpOjS1LtWX1cmcvi', 'user',   4820, 12),
('Artem_Razumovsky', 'artem@ludo.com', '$2b$10$zywt.IZuOf5/HEwIKolA6ekk1jpwQuJUH4BQ2QpOjS1LtWX1cmcvi', 'expert', 0,    50),
('Admin_Ludo',       'admin@ludo.com', '$2b$10$zywt.IZuOf5/HEwIKolA6ekk1jpwQuJUH4BQ2QpOjS1LtWX1cmcvi', 'admin',  0,    99);

-- История XP для Алекса (последние 7 дней)
INSERT INTO user_xp_history (user_id, amount, reason, created_at) VALUES
(1, 300, 'Quest Day', NOW() - INTERVAL '6 days'),
(1, 450, 'Quest Day', NOW() - INTERVAL '5 days'),
(1, 100, 'Achievement', NOW() - INTERVAL '4 days'),
(1, 500, 'Quest Day', NOW() - INTERVAL '3 days'),
(1, 200, 'Quest Day', NOW() - INTERVAL '2 days'),
(1, 600, 'Quest Day', NOW() - INTERVAL '1 day'),
(1, 150, 'Quest Day', NOW());

-- Уведомления
INSERT INTO notifications (user_id, type, title, content) VALUES
(1, 'achievement', 'Новое достижение!', 'Вы получили ачивку «Первый шаг»'),
(1, 'message', 'Новое сообщение', 'Эксперт Артём ответил в чате');

-- Достижения
INSERT INTO achievements (name, description, reward_xp, requirement_type, requirement_value, category) VALUES
('Первый шаг',     'Запишись на свой первый квест.',             50,  'quest_join',    1,  'Квесты'),
('Коллекционер',   'Запишись на 5 квестов.',                     150, 'quest_join',    5,  'Квесты'),
('Марафонец',      'Запишись на 10 квестов.',                    300, 'quest_join',    10, 'Квесты'),
('Первая попытка', 'Сдай первый отчёт по квесту.',              75,  'task_complete', 1,  'Прогресс'),
('Стахановец',     'Сдай 10 отчётов по квестам.',               200, 'task_complete', 10, 'Прогресс'),
('Легенда',        'Сдай 50 отчётов по квестам.',               500, 'task_complete', 50, 'Прогресс'),
('На волне',       'Набери 3-дневный стрик.',                   100, 'streak',        3,  'Стрики'),
('Неостановимый',  'Набери 7-дневный стрик.',                   250, 'streak',        7,  'Стрики'),
('Железная воля',  'Набери 30-дневный стрик.',                  1000,'streak',        30, 'Стрики'),
('Инвестор',       'Купи первый платный квест.',                 100, 'purchase',      1,  'Экономика'),
('Меценат',        'Купи 5 платных квестов.',                    300, 'purchase',      5,  'Экономика');

INSERT INTO user_achievements (user_id, achievement_id) VALUES (1, 1);

-- Подписки
INSERT INTO user_subscriptions (user_id, tier, status) VALUES
(1, 'pro', 'active'),
(2, 'expert', 'active');

-- Эксперты
INSERT INTO expert_profiles (user_id, specialization, bio, rating, experience_years, is_verified, consultation_price) VALUES
(2, 'Биохакинг & Продуктивность', 'Помогаю взломать продуктивность через научный подход к нейробиологии и физиологии.', 4.9, 6, TRUE, 2500);

-- Расписание эксперта
INSERT INTO expert_availability (expert_id, day_of_week, start_time, end_time) VALUES
(2, 1, '10:00', '18:00'),
(2, 3, '10:00', '18:00'),
(2, 5, '10:00', '16:00');

-- Квесты
INSERT INTO quests (expert_id, name, description, category, difficulty, duration_days, reward_xp, price) VALUES
(2, 'Дофаминовый детокс',  'Перезагрузка системы вознаграждения мозга через 14 дней осознанного воздержания.',     'Productivity', 'Hard',   14, 1200, 2500),
(2, 'Биохакинг сна',       'Оптимизируй режим сна через циркадные ритмы и научные протоколы восстановления.',       'Health',       'Medium',  7,  600,  0),
(2, 'Утренний марафон',    '30 дней бега и ранних подъёмов. Формируем привычку на всю жизнь.',                     'Sport',        'Hard',   30, 2500, 1500),
(2, 'Код чистоты',         'Наведи порядок в GitHub за 10 дней. Рефакторинг, документация, CI.',                    'Coding',       'Medium', 10,  800,  0),
(2, 'Мастер фокуса',       'Техники глубокой концентрации: Помодоро, Deep Work, цифровой детокс.',                   'Mindset',      'Easy',    5,  400,  990);

-- Задания
INSERT INTO quest_tasks (quest_id, day_number, title, description, instructions_html) VALUES
(1, 1, 'Утро без экрана',         'Проведи первый час после пробуждения без гаджетов.',          'Убери телефон в другую комнату с вечера. Первые 60 минут — только мысли и тело.'),
(1, 2, 'Список триггеров',        'Запиши всё что вызывает у тебя дофаминовые «хотелки».',       'Блокноты, заметки в телефоне — что угодно. Честность прежде всего.'),
(2, 1, 'Тёмная комната',          'Подготовь спальню к идеальному сну.',                          'Убери все источники синего света. Температура 18-20°C. Полная темнота.'),
(2, 2, 'Режим без кофеина',       'Первая половина дня без кофе. Проверь как работает тело.',    'Вода, травяной чай — можно. Кофе, энергетики — нельзя до 13:00.'),
(3, 1, 'Первые 2 км',             'Начни с лёгкой пробежки в комфортном темпе.',                  'Беги медленно. Главное — завершить. Сфотографируй маршрут.'),
(4, 1, 'Ревизия репозиториев',    'Просмотри все свои GitHub-проекты и оцени их состояние.',     'Составь список: что живое, что заброшено, что нужно почистить.'),
(5, 1, 'Метод Помодоро',          'Первый день с таймером 25/5.',                                 'Установи Focus Keeper или Forest. Сделай 4 полных цикла. Запиши результат.');

-- Записи на квесты
INSERT INTO user_quests (user_id, quest_id, current_day) VALUES (1, 1, 3);

-- Отзывы
INSERT INTO reviews (user_id, expert_id, rating, comment) VALUES
(1, 2, 5, 'Лучший коуч по биохакингу! Артём даёт реальные инструменты, не воду.'),
(1, 2, 4, 'Очень полезные консультации. Понял наконец почему не мог засыпать.');

