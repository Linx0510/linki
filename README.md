# 🎮 LUDO - Gamify Your World

Полная система геймификации привычек с квестами, достижениями и сообществом.

## 🚀 Быстрый старт

```bash
# 1. Установите зависимости
npm install

# 2. Создайте .env файл
cp .env.example .env

# 3. Настройте базу данных
npm run setup

# 4. Заполните тестовыми данными
npm run seed

# 5. Запустите приложение
npm run dev
```

Откройте браузер: **http://localhost:3000**

## 🔑 Тестовые аккаунты

- **Пользователь**: test@test.com / password123
- **Эксперт**: expert@ludo.com / expert123
- **Админ**: admin@ludo.com / admin123

## ✨ Возможности

### Для пользователей:
- ✅ Регистрация и аутентификация
- ✅ Просмотр и запись на квесты
- ✅ Трекинг прогресса и streak
- ✅ Система уровней и XP
- ✅ Достижения
- ✅ Рейтинг игроков
- ✅ Личный дашборд

### Для экспертов:
- ✅ Создание собственных квестов
- ✅ Управление клиентами
- ✅ Статистика и отзывы

### Для админов:
- ✅ Административная панель
- ✅ Управление пользователями
- ✅ Модерация контента
- ✅ Статистика платформы

## 📁 Структура проекта

```
ludo-final/
├── models/              # 10 моделей БД
│   ├── User.js         # Пользователи
│   ├── Quest.js        # Квесты
│   ├── Task.js         # Задачи
│   ├── UserQuest.js    # Записи на квесты
│   ├── TaskCompletion.js
│   ├── Achievement.js  # Достижения
│   ├── UserAchievement.js
│   ├── Expert.js       # Профили экспертов
│   ├── Review.js       # Отзывы
│   ├── Notification.js # Уведомления
│   └── index.js
├── routes/              # 8 роутов
│   ├── index.js        # Главная страница
│   ├── auth.js         # Аутентификация
│   ├── user.js         # Пользовательские страницы
│   ├── quests.js       # Квесты
│   ├── expert.js       # Эксперты
│   ├── admin.js        # Админ-панель
│   ├── community.js    # Сообщество
│   └── api.js          # API endpoints
├── views/               # 15+ EJS шаблонов
│   ├── landing.ejs
│   ├── auth/           # Вход, регистрация
│   ├── user/           # Дашборд, профиль, достижения
│   ├── quests/         # Список, детали
│   ├── expert/         # Эксперты
│   ├── admin/          # Админ-панель
│   ├── community/      # Рейтинг
│   ├── errors/         # 404, 500
│   └── partials/       # Navbar
├── public/assets/
│   ├── css/style.css   # Полные стили
│   └── js/app.js       # Frontend JS
├── scripts/
│   ├── setup.js        # Инициализация БД
│   └── seed.js         # Тестовые данные
├── middleware/
│   └── auth.js         # Авторизация
├── utils/
│   └── helpers.js      # Утилиты
├── data/               # SQLite БД
├── uploads/            # Загруженные файлы
├── app.js              # Главный файл
├── package.json
├── Dockerfile
└── docker-compose.yml
```

## 🗄️ База данных

- **SQLite** для MVP (легко развернуть)
- **Sequelize ORM**
- 10 моделей с полными ассоциациями
- Автоматическая синхронизация схемы

## 🎨 Дизайн

- Современный градиентный дизайн
- Темная тема с purple-pink палитрой
- Полностью адаптивный (mobile-first)
- Glassmorphism эффекты
- Smooth анимации и transitions

## 🔒 Безопасность

- Bcrypt хеширование паролей (10 раундов)
- Защищенные сессии (httpOnly cookies)
- Rate limiting
- Helmet.js для HTTP заголовков
- CSRF protection ready

## 📦 Docker

```bash
# Запуск через Docker
docker-compose up -d

# Просмотр логов
docker-compose logs -f

# Остановка
docker-compose down
```

## 🛠️ Разработка

```bash
# Режим разработки с автоперезагрузкой
npm run dev

# Production
npm start
```

## 📊 Основные фичи

1. **Система квестов** - создание, прохождение, трекинг
2. **Геймификация** - XP, уровни, достижения, streak
3. **Эксперты** - верифицированные создатели квестов
4. **Сообщество** - рейтинги, социальные функции
5. **Адаптивный дизайн** - работает на всех устройствах
6. **Уведомления** - система нотификаций
7. **Отзывы и рейтинги** - оценка квестов и экспертов

## 🚀 Production готовность

- ✅ Структурированный код
- ✅ Error handling
- ✅ Logging ready
- ✅ Docker support
- ✅ Environment variables
- ✅ Security best practices

## 📝 API Endpoints

### Auth
- POST /auth/login
- POST /auth/register
- POST /auth/logout

### User
- GET /user/dashboard
- GET /user/profile
- GET /user/achievements

### Quests
- GET /quests
- GET /quests/:id
- POST /quests/:id/enroll
- POST /quests/:id/complete-task

### API
- GET /api/notifications
- POST /api/notifications/:id/read

## 🤝 Вклад в проект

1. Fork репозитория
2. Создайте feature branch
3. Commit изменения
4. Push в branch
5. Создайте Pull Request

## 📄 Лицензия

MIT License

## 👥 Автор

Made with ❤️ by LUDO Team

---

**Готов к запуску!** Просто выполните команды из раздела "Быстрый старт"
