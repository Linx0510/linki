require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const { attachCurrentUser, ensureCsrfToken } = require('./middleware/authMiddleware');
const { attachAiAssistantWidget } = require('./middleware/aiAssistantWidgetMiddleware');
const pageRoutes = require('./routes/pageRoutes');
const authRoutes = require('./routes/authRoutes');
const apiRoutes = require('./routes/apiRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { STATUS_LABELS, STATUS_LABELS_BY_CONTEXT, statusLabel } = require('./utils/statusLabels');

const createApp = () => {
  if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required');
  }

  const app = express();

  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.use(
    session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      },
    })
  );

  app.use(attachCurrentUser);
  app.use(ensureCsrfToken);
  app.use(attachAiAssistantWidget);
  app.use((req, res, next) => {
    res.locals.STATUS_LABELS = STATUS_LABELS;
    res.locals.STATUS_LABELS_BY_CONTEXT = STATUS_LABELS_BY_CONTEXT;
    res.locals.statusLabel = statusLabel;
    next();
  });

  app.use(pageRoutes);
  app.use(authRoutes);
  app.use(apiRoutes);
  app.use('/admin', adminRoutes);

  app.use((req, res) => {
    res.status(404).send('Страница не найдена');
  });

  return app;
};

const app = createApp();

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
  });
}

module.exports = { createApp };
