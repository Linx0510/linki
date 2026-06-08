const bcrypt = require('bcrypt');
const userModel = require('../models/userModel');

const getAuthPage = (req, res) => {
  const mode = req.query.mode === 'register' ? 'register' : 'login';

  return res.render('auth', {
    error: req.query.error || '',
    success: req.query.success || '',
    mode,
  });
};

const buildSessionUser = (user) => ({
  id: user.id,
  first_name: user.first_name,
  last_name: user.last_name,
  email: user.email,
});

const register = async (req, res) => {
  const { first_name, last_name, name, email, password, confirm_password } = req.body;

  const fullName = (name || '').trim();
  const [parsedFirstName, ...parsedLastName] = fullName.split(/\s+/).filter(Boolean);

  const normalizedFirstName = (first_name || parsedFirstName || '').trim();
  const normalizedLastName = (last_name || parsedLastName.join(' ') || '-').trim();
  const normalizedEmail = (email || '').trim().toLowerCase();

  if (!normalizedFirstName || !normalizedLastName || !normalizedEmail || !password || !confirm_password) {
    return res.redirect('/auth?mode=register&error=Заполните все поля');
  }

  if (password !== confirm_password) {
    return res.redirect('/auth?mode=register&error=Пароли не совпадают');
  }

  try {
    const existingUser = await userModel.findByEmail(normalizedEmail);
    if (existingUser) {
      return res.redirect('/auth?mode=register&error=Пользователь с таким email уже существует');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await userModel.createUser({
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      email: normalizedEmail,
      passwordHash,
    });

    req.session.user = buildSessionUser(user);
    return res.redirect('/lenta');
  } catch (error) {
    console.error('Register error:', error);
    return res.redirect('/auth?mode=register&error=Не удалось создать аккаунт');
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = (email || '').trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return res.redirect('/auth?error=Введите email и пароль');
  }

  try {
    const user = await userModel.findByEmail(normalizedEmail);

    if (!user) {
      return res.redirect('/auth?error=Неверный email или пароль');
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.redirect('/auth?error=Неверный email или пароль');
    }

    req.session.user = buildSessionUser(user);
    return res.redirect('/lenta');
  } catch (error) {
    console.error('Login error:', error);
    return res.redirect('/auth?error=Ошибка при входе');
  }
};

const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/auth?success=Вы вышли из аккаунта');
  });
};

module.exports = {
  getAuthPage,
  register,
  login,
  logout,
};
