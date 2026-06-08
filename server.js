require('dotenv').config();

// Fail fast: validate required env vars before anything else
// On Vercel, DATABASE_URL replaces individual DB_* vars
const hasDatabaseUrl = !!process.env.DATABASE_URL;
const REQUIRED_ENV = hasDatabaseUrl
  ? ['JWT_SECRET']
  : ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_NAME', 'DB_PASSWORD'];
const missing = REQUIRED_ENV.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}
if (process.env.JWT_SECRET === 'fallback_secret' || process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be a secure random string of at least 32 characters.');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const questRoutes = require('./routes/quests');
const userRoutes = require('./routes/users');
const expertRoutes = require('./routes/experts');
const adminRoutes = require('./routes/admin');
const chatRoutes = require('./routes/chat');
const uploadRoutes = require('./routes/upload');
const supportRoutes = require('./routes/support');
const aiRoutes = require('./routes/ai');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_DEV = process.env.NODE_ENV !== 'production';

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:3000',
  /\.vercel\.app$/,
  /jasmin-ochre\.vercel\.app$/
];

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false, // CRITICAL: prevent Helmet from injecting upgrade-insecure-requests
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      mediaSrc: ["'self'", "https://videos.pexels.com", "blob:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: false
}));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = allowedOrigins.some(o =>
      typeof o === 'string' ? o === origin : o.test(origin)
    );
    if (allowed) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(morgan(IS_DEV ? 'dev' : 'combined'));
app.use(express.static(__dirname));
app.use('/uploads', express.static('uploads'));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Попробуйте позже.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_DEV ? 200 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток входа. Попробуйте через 15 минут.' }
});

app.use(globalLimiter);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/quests', questRoutes);
app.use('/api/user', userRoutes);
app.use('/api/experts', expertRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/ai', aiRoutes);

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  res.status(404).json({ error: 'Маршрут не найден' });
});

// Never expose internal error details to clients
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: IS_DEV ? err.message : 'Внутренняя ошибка сервера'
  });
});

const pool = require('./db/pool');

(async function runMigrations() {
  try {
    await pool.query('ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reply_text TEXT');
  } catch (err) {
    console.error('Migration reply_text failed:', err.message);
  }
  try {
    await pool.query("ALTER TABLE quests ADD COLUMN IF NOT EXISTS quest_type VARCHAR(20) DEFAULT 'expert'");
  } catch (err) {
    console.error('Migration quest_type failed:', err.message);
  }
  try {
    await pool.query("UPDATE quests SET quest_type = 'expert' WHERE quest_type IS NULL");
  } catch (err) {
    console.error('Migration quest_type backfill failed:', err.message);
  }
})();

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 AKTIV API running on http://localhost:${PORT}`);
  });
}

module.exports = app;
