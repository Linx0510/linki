const db = require('../config/database');

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 2000;

const ensureFeedbackTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.feedback
    (
      id serial NOT NULL,
      name character varying(100) COLLATE pg_catalog."default" NOT NULL,
      email character varying(100) COLLATE pg_catalog."default" NOT NULL,
      message text COLLATE pg_catalog."default" NOT NULL,
      created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT feedback_pkey PRIMARY KEY (id)
    )
  `);
};

const normalizeInput = (value) => String(value || '').trim();

const validateFeedback = ({ name, email, message }) => {
  const errors = {};
  const emailRegex = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;

  if (!name) {
    errors.name = 'Пожалуйста, введите ваше имя';
  } else if (name.length < 2) {
    errors.name = 'Имя должно содержать не менее 2 символов';
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Имя должно быть не длиннее ${MAX_NAME_LENGTH} символов`;
  }

  if (!email) {
    errors.email = 'Пожалуйста, введите email';
  } else if (email.length > MAX_EMAIL_LENGTH) {
    errors.email = `Email должен быть не длиннее ${MAX_EMAIL_LENGTH} символов`;
  } else if (!emailRegex.test(email)) {
    errors.email = 'Введите корректный email (example@domain.com)';
  }

  if (!message) {
    errors.message = 'Пожалуйста, введите ваше сообщение';
  } else if (message.length < 10) {
    errors.message = 'Сообщение должно содержать не менее 10 символов';
  } else if (message.length > MAX_MESSAGE_LENGTH) {
    errors.message = `Сообщение должно быть не длиннее ${MAX_MESSAGE_LENGTH} символов`;
  }

  return errors;
};

const createFeedback = async (req, res) => {
  const feedback = {
    name: normalizeInput(req.body.name),
    email: normalizeInput(req.body.email).toLowerCase(),
    message: normalizeInput(req.body.message),
  };
  const errors = validateFeedback(feedback);

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ success: false, errors });
  }

  try {
    await ensureFeedbackTable();
    await db.query(
      `INSERT INTO public.feedback (name, email, message) VALUES ($1, $2, $3)`,
      [feedback.name, feedback.email, feedback.message]
    );

    return res.status(201).json({ success: true, message: 'Сообщение отправлено' });
  } catch (error) {
    console.error('Create feedback error:', error);
    return res.status(500).json({ success: false, error: 'Ошибка при отправке сообщения' });
  }
};

module.exports = {
  createFeedback,
  ensureFeedbackTable,
  validateFeedback,
};
