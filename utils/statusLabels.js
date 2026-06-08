const STATUS_LABELS = {
  active: 'Активно',
  pending: 'На рассмотрении',
  in_progress: 'В работе',
  completed: 'Завершено',
  cancelled: 'Отменено',
  canceled: 'Отменено',
  blocked: 'Заблокировано',
  rejected: 'Отклонено',
  resolved: 'Решено',
  approved: 'Одобрено',
  accepted: 'Принято',
  archived: 'В архиве',
  succeeded: 'Выполнено',
  processing: 'В обработке',
  held: 'Заморожено',
  paid: 'Оплачено',
  refunded: 'Возвращено',
  failed: 'Ошибка',
  draft: 'Черновик',
  published: 'Опубликовано',
  hidden: 'Скрыто',
  open: 'Открыто',
  closed: 'Закрыто',
};

const STATUS_LABELS_BY_CONTEXT = {
  user: {
    active: 'Активен',
    blocked: 'Заблокирован',
  },
  work: {
    pending: 'На модерации',
    active: 'Опубликована',
    cancelled: 'Отклонена',
    blocked: 'Заблокирована',
    archived: 'В архиве',
  },
  order: {
    active: 'Активна',
    in_progress: 'В работе',
    completed: 'Выполнена',
    cancelled: 'Отменена',
  },
  service: {
    active: 'Активна',
    archived: 'В архиве',
    in_progress: 'В работе',
    completed: 'Выполнена',
    cancelled: 'Отменена',
  },
  deal: {
    active: 'Открыта',
    in_progress: 'В работе',
    completed: 'Завершена',
    cancelled: 'Отменена',
  },
  proposal: {
    pending: 'Ожидает ответа',
    accepted: 'Принято',
    rejected: 'Отклонено',
    cancelled: 'Отменено',
  },
  complaint: {
    pending: 'На рассмотрении',
    resolved: 'Решена',
    rejected: 'Отклонена',
  },
  withdrawal: {
    pending: 'На рассмотрении',
    approved: 'Выполнена',
    rejected: 'Отклонена',
  },
  payment: {
    pending: 'Ожидает оплаты',
    held: 'Средства заморожены',
    paid: 'Оплачено',
    refunded: 'Возвращено',
    cancelled: 'Отменено',
    canceled: 'Отменено',
    succeeded: 'Выполнено',
    processing: 'В обработке',
    failed: 'Ошибка оплаты',
  },
  transaction: {
    succeeded: 'Выполнено',
    canceled: 'Отменено',
    pending: 'В обработке',
    processing: 'В обработке',
    failed: 'Ошибка',
  },
};

const statusLabel = (status, context) => {
  const key = String(status || '').trim();
  if (!key) {
    return 'Не указан';
  }

  return STATUS_LABELS_BY_CONTEXT[context]?.[key] || STATUS_LABELS[key] || key;
};

module.exports = {
  STATUS_LABELS,
  STATUS_LABELS_BY_CONTEXT,
  statusLabel,
};
