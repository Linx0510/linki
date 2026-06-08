<!-- From: C:\Users\zasmi\Desktop\законченная страница\AGENTS.md -->
# AGENTS.md — AKTIV (Ludo) RPG Platform

> This file is intended for AI coding agents. It describes the actual project structure, conventions, and runtime behavior as found in the codebase.

## Project Overview

**AKTIV** (internally also called *Ludo*) is a Russian-language gamified self-improvement platform built as a monolithic Node.js/Express application with a static HTML frontend. Users ("players") join multi-day quests created by experts, complete daily tasks, upload video/image proof, earn XP, level up, maintain streaks, and unlock achievements. Experts create quests, review submissions, and run 1-on-1 sessions. Admins moderate submissions and view platform analytics.

The project lives in a single directory. The backend serves both the API and the static HTML pages from the same Express instance.

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js (targeting v20+) |
| Server framework | Express 4 (`^4.18.2`) |
| Database | PostgreSQL 14+ |
| DB driver | `pg` (`^8.11.5`) — node-postgres |
| Auth | JWT (`jsonwebtoken` `^9.0.2`), bcrypt (`^5.1.0`) with cost factor 10 |
| File uploads | Multer (`^1.4.5-lts.1`) with disk storage + magic-byte verification |
| Security | Helmet (`^7.0.0`), CORS (`^2.8.5`), `express-rate-limit` (`^6.7.0`) |
| Logging | Morgan (`^1.10.0`) — `dev` format in development, `combined` in production |
| Env config | dotenv (`^16.0.3`) |
| Frontend | Static HTML, vanilla JS, inline CSS (no build step) |
| Process manager (prod) | PM2 (recommended) |

## Directory Structure

```
.
├── server.js               # Express bootstrap, middleware, route mounting
├── package.json
├── .env                    # Required env vars (see below)
├── .gitignore
├── init.sql                # Full PostgreSQL schema + seed data (3 demo users)
│
├── db/
│   ├── pool.js             # pg Pool configuration (max 20 connections)
│   └── queries.js          # All SQL queries exported as one object (~700 lines)
│
├── middleware/
│   └── auth.js             # JWT verification + role authorization
│
├── routes/                 # REST API routes
│   ├── auth.js             # POST /api/auth/login, /register + static page serving
│   ├── quests.js           # GET /api/quests, join, complete-day
│   ├── users.js            # /api/user/* profiles, notifications, XP
│   ├── experts.js          # /api/experts/* profiles, bookings, reviews
│   ├── admin.js            # /api/admin/* stats, submissions, leaderboard
│   ├── chat.js             # 1-on-1 messaging
│   ├── upload.js           # Video/image upload with magic-byte validation
│   ├── support.js          # Contact form + admin ticket list
│   └── ai.js               # AI assistant proxy to OpenRouter
│
├── uploads/                # Uploaded files served statically
│
├── *.html                  # Static frontend pages (Russian UI)
├── *.js (root)             # Frontend helpers + one-off Node scripts
├── admin.css               # Admin dashboard stylesheet
└── setup-server.sh         # Ubuntu server bootstrap (nginx, certbot, pm2)
```

### Key Frontend Scripts (root `.js`)

- `user-sync.js` — Defines `window.authFetch()` (auto-injects Bearer token from `localStorage` key `ludo_token`), `updateUserUI()`, and `logout()`. Loaded by most HTML pages. Hydrates UI from cached user data on `DOMContentLoaded`. Hides `.admin-only` and `.expert-only` elements based on role. Also auto-loads `ai-chat.js` for authenticated users.
- `expert-sidebar.js` — Self-contained sidebar nav component for expert pages. Expects `<nav id="expertSidebarNav">`. Auto-builds 5-item navigation and highlights active page from `window.location.pathname`.
- `cookie-consent.js` — Injects a cookie-consent banner + toast. Fully self-contained (creates its own `<style>`). Sets real `document.cookie` entries with categories: essential, analytics, preferences.
- `ai-chat.js` — Floating AI chat widget. Self-contained (creates its own `<style>` and DOM). Connects to `/api/ai/chat`. Stores history in `localStorage`.
- `update_menu.js` — Node script that patches `.html` files to inject a unified navigation menu. Safe to re-run.
- `add_notif_link.js` — Node script that adds `onclick` to notification buttons across HTML files.
- `test-connection.js` — Smoke-test script for DB connectivity.
- `run-seed.js` — Loads `seed.sql` into the database.
- `e2e-test.js` — Lightweight end-to-end API test runner using Node's built-in `http` module.

## Environment Variables

The server **fails fast** on startup if required variables are missing or insecure.

```
JWT_SECRET          # Min 32 random chars. "fallback_secret" is rejected.
DB_HOST
DB_USER
DB_NAME
DB_PASSWORD
DB_PORT             # Optional, defaults to 5432
PORT                # Optional, defaults to 3000
NODE_ENV            # "production" switches rate limits & error messages
OPENROUTER_API_KEY  # OpenRouter API key for AI assistant
OPENROUTER_MODEL    # Model slug, e.g. deepseek/deepseek-chat:free
```

Create a `.env` file in the project root. It is gitignored by default.

## Build and Run Commands

```bash
# Install dependencies
npm install

# Start the server
npm start        # node server.js
npm run dev      # nodemon server.js

# Database smoke test
node test-connection.js

# Load additional seed data (after init.sql was applied)
node run-seed.js

# Run E2E API tests against a running local server
node e2e-test.js

# Patch navigation menus in HTML files
node update_menu.js

# Add notification links to HTML files
node add_notif_link.js
```

There is **no transpile/bundling step**. The frontend is served as raw static files via `express.static(__dirname)`.

## Database Setup

1. Create a PostgreSQL database (e.g., `ludo_db`).
2. Run `init.sql` to create tables, indexes, and base seed data.
3. Optionally run `node run-seed.js` to load extra demo users/quests from `seed.sql`.

All schema changes should go through new SQL migration scripts or be applied manually. The codebase includes one runtime migration in `server.js`:

```js
pool.query('ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reply_text TEXT')
```

### Database Schema

The schema consists of **18 tables**:

1. **`users`** — Core accounts (`id, username, email, password_hash, role, xp, level, avatar_url, energy, last_energy_update, created_at`).
2. **`expert_profiles`** — Expert-specific data (`user_id, specialization, bio, rating, experience_years, is_verified, consultation_price`).
3. **`quests`** — Quest definitions (`expert_id, name, description, category, difficulty, duration_days, reward_xp, price, created_at`).
4. **`quest_tasks`** — Daily tasks per quest (`quest_id, day_number, title, description, instructions_html, task_type`). Unique on `(quest_id, day_number)`.
5. **`user_quests`** — Player quest enrollments (`user_id, quest_id, status, current_day, completed_days JSONB, joined_at`). Unique on `(user_id, quest_id)`.
6. **`quest_submissions`** — Daily report uploads (`user_quest_id, day_number, file_url, comment, status, xp_awarded, created_at`).
7. **`expert_availability`** — Weekly schedule slots (`expert_id, day_of_week, start_time, end_time`).
8. **`expert_sessions`** — 1-on-1 booked sessions (`expert_id, user_id, scheduled_at, duration_minutes, status, price_paid, meeting_link`).
9. **`user_subscriptions`** — Subscription tiers (`user_id, tier, status, starts_at, ends_at`). Unique on `user_id`.
10. **`transactions`** — Payments (`user_id, expert_id, amount, currency, purpose, status, created_at`).
11. **`achievements`** — Achievement definitions (`name, description, reward_xp, requirement_type, requirement_value, icon_url, category`).
12. **`user_achievements`** — Unlocked achievements (`user_id, achievement_id, earned_at`).
13. **`user_skills`** — Per-user skill XP/levels (`user_id, skill_name, level, current_xp`). Composite PK.
14. **`notifications`** — In-app notifications (`user_id, type, title, content, is_read, created_at`).
15. **`user_xp_history`** — Daily XP audit trail (`user_id, amount, reason, created_at`).
16. **`reviews`** — Expert ratings with optional reply (`user_id, expert_id, rating, comment, reply_text, created_at`).
17. **`messages`** — 1-on-1 chat (`sender_id, receiver_id, content, is_read, created_at`).
18. **`support_tickets`** — Contact form submissions (`name, email, subject, message, status, created_at`).

**Seed data** in `init.sql` includes 3 demo users (password `123456` hashed with bcrypt):
- `Alex_Kostenko` (user, level 12, 4820 XP)
- `Artem_Razumovsky` (expert, level 50)
- `Admin_Ludo` (admin, level 99)

## API Architecture

### Routing Table

| Prefix | Route file | Auth | Notes |
|--------|-----------|------|-------|
| `/api/auth` | `routes/auth.js` | No (except logout) | Rate-limited separately (`authLimiter`) |
| `/api/quests` | `routes/quests.js` | Mixed | Public list; create requires expert/admin |
| `/api/user` | `routes/users.js` | Token | Owner-only or admin for private data |
| `/api/experts` | `routes/experts.js` | Mixed | Public list/profiles; bookings require token |
| `/api/admin` | `routes/admin.js` | Token + admin role | All routes guarded |
| `/api/chat` | `routes/chat.js` | Token | 1-on-1 messaging |
| `/api/upload` | `routes/upload.js` | Token | File upload (video/image) |
| `/api/support` | `routes/support.js` | Mixed | Public contact form; list requires admin |
| `/api/ai` | `routes/ai.js` | Token | AI assistant chat proxy to OpenRouter |

### Authentication Flow

1. Register/Login returns a JWT (`expiresIn: '7d'`).
2. Frontend stores token in `localStorage` under key `ludo_token`.
3. `user-sync.js` provides `authFetch(url, options)` which injects `Authorization: Bearer <token>`.
4. `middleware/auth.js` `authenticateToken` verifies JWT and sets `req.user = { id, role }`.
5. `authorizeRole(role)` allows the specified role **or** `admin`.

### Role System

- `user` — Player; can join quests, complete days, message, book experts.
- `expert` — Can create quests, review their own quest submissions, reply to reviews, view clients/finances.
- `admin` — Full access; can moderate all submissions, view stats, manage subscriptions.

## Code Style and Conventions

### Language
- All user-facing strings (errors, UI) are in **Russian**.
- Code comments are a mix of English and Russian; recent additions tend to be English.

### Error Handling Pattern in Routes
```js
try {
  // work
} catch (err) {
  console.error(err);
  res.status(500).json({ error: 'Ошибка сервера' });
}
```
In production (`NODE_ENV === 'production'`), the global error middleware hides `err.message` from clients and returns `'Внутренняя ошибка сервера'`.

### Database Queries
- All queries live in `db/queries.js` and use **parameterized queries** (`$1`, `$2`, …).
- Complex transactions use `pool.connect()` + `BEGIN`/`COMMIT`/`ROLLBACK`.
- Do **not** write inline SQL inside route files; add new methods to `db/queries.js`.
- The `db/pool.js` config: max 20 connections, idle timeout 30s, connection timeout 2s. Fatal errors on idle clients exit the process.

### Input Validation
- Routes perform basic validation (presence, regex, length) before calling `queries`.
- Email regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- URL regex for avatars: `/^https?:\/\/.{3,}/`
- Password min length: 6 characters.

### Frontend Conventions
- HTML pages are self-contained; each includes its own `<style>` block.
- Common CSS custom properties (e.g., `--bg: #050508`, `--pink: #e8a8d8`) are repeated per file.
- The sidebar navigation on user pages is injected/maintained by `update_menu.js`.
- Expert pages share `expert-sidebar.js` for the sidebar nav.

### Game Mechanics
- **XP / Level formula**: `level = floor(xp / 1000) + 1`
- **Energy system**: Users have `energy` (default 100, max 100). It regenerates at **+10 per hour** of real time based on `last_energy_update`. `syncUserEnergy()` updates it before reads.
- **Achievement engine**: `checkAndAwardAchievements(userId, type)` runs inside transactions after quest joins (`quest_join`), day completions (`task_complete`), streak checks (`streak`), and purchases (`purchase`). Awards XP and creates a notification.
- **Streaks**: Calculated from consecutive days with approved submissions in `user_xp_history`.

## AI Assistant

- **Endpoint**: `POST /api/ai/chat` — accepts `{ messages: [{role, content}] }` and returns `{ reply }`.
- **Backend**: `routes/ai.js` proxies to OpenRouter (`https://openrouter.ai/api/v1/chat/completions`).
- **Frontend**: `ai-chat.js` injects a floating chat widget on all pages for authenticated users.
- **Context**: The backend enriches the system prompt with the user's profile (level, XP, energy, streak, active quests) for personalized responses.
- **History**: Chat history is stored in `localStorage` under key `ludo_ai_chat_history` (client-side only).

## Testing

The project does **not** use Jest, Mocha, or Vitest.

1. **`test-connection.js`** — Quick PostgreSQL connectivity + basic query smoke test. Calls `getAllQuests()` and `getUserById(1)`. Provides specific error messages for wrong password (`28P01`) or missing database (`3D000`).
2. **`e2e-test.js`** — API-level integration test that exercises auth, quests, admin, expert, user, and support endpoints against a running server on `localhost:3000`. Exits with code `1` on any failure.

### Adding Tests
- Extend `e2e-test.js` with new `req()` calls and `check()` assertions.

## Security Considerations

- **JWT secret**: Enforced min 32 chars at startup (`server.js`). Never commit `.env`.
- **Passwords**: Hashed with bcrypt (cost factor 10).
- **CORS** (`server.js`): Restricted to `localhost:3000`, `localhost:5500`, `127.0.0.1` origins.
- **Rate limiting** (`server.js`): Global 200 requests / 15 min; auth endpoints 15 / 15 min in production.
- **Helmet CSP** (`server.js`): Custom directives; `upgrade-insecure-requests` disabled. Allows `cdn.jsdelivr.net` for scripts and `fonts.googleapis.com` for styles.
- **File uploads**: MIME + magic-byte verification. Max 50 MB.
- **SQL injection**: Prevented by parameterized queries in `db/queries.js`.
- **Information disclosure**: Internal stack traces are never sent to clients in production.
- **Authorization**: Most routes enforce owner-only access by comparing `req.user.id` to `req.params.id`, with an override for `admin`.

## Deployment Notes

`setup-server.sh` is a Bash script for Ubuntu that:
1. Installs Node.js 20.
2. Installs PostgreSQL and creates a database.
3. Installs Nginx and Certbot.
4. Configures an Nginx reverse proxy to `localhost:3000`.
5. Installs PM2 globally.

After setup, typical production workflow:
```bash
pm2 start server.js --name "aktiv-api"
```

The static frontend files are served directly by Express (`express.static(__dirname)`), so no separate frontend server is needed.

## Common Tasks for Agents

- **Add a new API endpoint**: Create the route handler in the appropriate `routes/*.js` file, reuse or add a `db/queries.js` method, and apply `authenticateToken` / `authorizeRole` as needed.
- **Change the PostgreSQL schema**: Write a new SQL script; do not edit `init.sql` for migrations on existing data.
- **Update frontend navigation**: Run `node update_menu.js` after modifying the menu template inside that script.
- **Add a new HTML page**: Follow existing pages' structure (sidebar, CSS variables, include `user-sync.js`). Register the page in `update_menu.js` if it should appear in the nav.
- **Handle file uploads**: Use the existing `/api/upload` endpoint or extend `routes/upload.js`. Keep the magic-byte verification pattern.
