const calculateLevel = (xp) => {
  return Math.floor(xp / 100) + 1;
};

const calculateProgress = (completed, total) => {
  if (total === 0) return 0;
  return Math.floor((completed / total) * 100);
};

const formatDate = (date) => {
  return new Date(date).toLocaleDateString('ru-RU');
};

module.exports = { calculateLevel, calculateProgress, formatDate };
