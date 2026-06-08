const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Недействительный или просроченный токен' });
    }
    req.user = user;
    next();
  });
};

const authorizeRole = (role) => (req, res, next) => {
  if (req.user.role !== role && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещен' });
  }
  next();
};

const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session || !req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Доступ запрещен');
  }
  next();
};

const requireExpert = (req, res, next) => {
  if (!req.session || !req.session.user || (req.session.user.role !== 'expert' && req.session.user.role !== 'admin')) {
    return res.status(403).send('Доступ запрещен');
  }
  next();
};

module.exports = { authenticateToken, authorizeRole, requireAuth, requireAdmin, requireExpert };
