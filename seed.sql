-- Дополнительные тестовые данные (запускать ПОСЛЕ init.sql)
-- Команда: node run-seed.js
-- Пароль у всех демо-пользователей: 123456

-- Дополнительные пользователи
INSERT INTO users (username, email, password_hash, role, level, xp) VALUES
('Dmitry_Steel',    'dmitry@ludo.app',  '$2b$10$zywt.IZuOf5/HEwIKolA6ekk1jpwQuJUH4BQ2QpOjS1LtWX1cmcvi', 'expert', 1, 0),
('Elena_Mind',      'elena@ludo.app',   '$2b$10$zywt.IZuOf5/HEwIKolA6ekk1jpwQuJUH4BQ2QpOjS1LtWX1cmcvi', 'expert', 1, 0),
('Viktor_Code',     'viktor@ludo.app',  '$2b$10$zywt.IZuOf5/HEwIKolA6ekk1jpwQuJUH4BQ2QpOjS1LtWX1cmcvi', 'expert', 1, 0),
('Ivan_The_Great',  'ivan@test.com',    '$2b$10$zywt.IZuOf5/HEwIKolA6ekk1jpwQuJUH4BQ2QpOjS1LtWX1cmcvi', 'user',   15, 8500),
('Masha_Beginner',  'masha@test.com',   '$2b$10$zywt.IZuOf5/HEwIKolA6ekk1jpwQuJUH4BQ2QpOjS1LtWX1cmcvi', 'user',   2,  450),
('Petr_Runner',     'petr@test.com',    '$2b$10$zywt.IZuOf5/HEwIKolA6ekk1jpwQuJUH4BQ2QpOjS1LtWX1cmcvi', 'user',   5,  1200)
ON CONFLICT (email) DO NOTHING;

-- Профили дополнительных экспертов
INSERT INTO expert_profiles (user_id, specialization, bio, consultation_price, experience_years, is_verified)
SELECT id, 'Фитнес и Бодибилдинг', 'Построил тело мечты сотням учеников. Мастер дисциплины.', 2500, 12, true
FROM users WHERE username = 'Dmitry_Steel'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO expert_profiles (user_id, specialization, bio, consultation_price, experience_years, is_verified)
SELECT id, 'Психология и Когнитивистика', 'Специалист по борьбе с выгоранием и поиску внутреннего ресурса.', 3000, 8, true
FROM users WHERE username = 'Elena_Mind'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO expert_profiles (user_id, specialization, bio, consultation_price, experience_years, is_verified)
SELECT id, 'Python Development', 'Senior Python Dev в BigTech. Обучаю кодить с нуля до первого оффера.', 1500, 6, true
FROM users WHERE username = 'Viktor_Code'
ON CONFLICT (user_id) DO NOTHING;

-- Дополнительные квесты
INSERT INTO quests (expert_id, name, description, category, difficulty, duration_days, reward_xp, price)
SELECT id, 'Стальной Пресс: Интенсив', '7 дней жёстких тренировок на кор и правильного питания.', 'Sport', 'Hard', 7, 500, 990
FROM users WHERE username = 'Dmitry_Steel'
ON CONFLICT DO NOTHING;

INSERT INTO quests (expert_id, name, description, category, difficulty, duration_days, reward_xp, price)
SELECT id, 'Цифровой Детокс', 'Верните себе способность концентрироваться. Минимум соцсетей, максимум осознанности.', 'Mindset', 'Medium', 7, 300, 0
FROM users WHERE username = 'Elena_Mind'
ON CONFLICT DO NOTHING;

INSERT INTO quests (expert_id, name, description, category, difficulty, duration_days, reward_xp, price)
SELECT id, 'Первый бот на Python', 'Напишите своего первого полезного Telegram-бота за неделю.', 'Coding', 'Medium', 7, 450, 490
FROM users WHERE username = 'Viktor_Code'
ON CONFLICT DO NOTHING;

-- Задания для новых квестов
INSERT INTO quest_tasks (quest_id, day_number, title, description, instructions_html)
SELECT id, 1, 'Замер и Тест', 'Замерьте талию и сделайте максимальное количество скручиваний.', '<p>Запишите видео теста.</p>'
FROM quests WHERE name = 'Стальной Пресс: Интенсив'
ON CONFLICT (quest_id, day_number) DO NOTHING;

INSERT INTO quest_tasks (quest_id, day_number, title, description, instructions_html)
SELECT id, 1, 'Тишина утром', 'Первый час после пробуждения без телефона.', '<p>Почитайте книгу или выйдите на прогулку.</p>'
FROM quests WHERE name = 'Цифровой Детокс'
ON CONFLICT (quest_id, day_number) DO NOTHING;

INSERT INTO quest_tasks (quest_id, day_number, title, description, instructions_html)
SELECT id, 1, 'Установка Python', 'Установите Python и VS Code, запустите первый скрипт.', '<p>Выведите "Hello, World!" в консоль.</p>'
FROM quests WHERE name = 'Первый бот на Python'
ON CONFLICT (quest_id, day_number) DO NOTHING;

-- Подписки для тестовых пользователей
INSERT INTO user_subscriptions (user_id, tier, status)
SELECT id, 'pro', 'active' FROM users WHERE username = 'Ivan_The_Great'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO user_subscriptions (user_id, tier, status)
SELECT id, 'expert', 'active' FROM users WHERE username IN ('Dmitry_Steel', 'Elena_Mind', 'Viktor_Code')
ON CONFLICT (user_id) DO NOTHING;
