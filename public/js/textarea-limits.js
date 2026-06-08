(() => {
  const TEXTAREA_LIMIT = 2000;
  const COUNTER_SELECTOR = '.textarea-char-badge, .char-counter, .review-char-count, [data-textarea-counter]';

  const formatCounter = (count) => `${count} / ${TEXTAREA_LIMIT} символов`;

  const getCounter = (textarea) => {
    const next = textarea.nextElementSibling;
    if (next && next.matches(COUNTER_SELECTOR)) {
      return next;
    }

    const container = textarea.closest('.form-group, .form-group-work, .review-comment-block, .service-review-form, label, .input-stack');
    const existing = container?.querySelector(COUNTER_SELECTOR);
    if (existing) {
      return existing;
    }

    const counter = document.createElement('small');
    counter.className = 'textarea-char-badge';
    counter.setAttribute('aria-live', 'polite');
    textarea.insertAdjacentElement('afterend', counter);
    return counter;
  };

  const updateTextarea = (textarea, counter) => {
    if (textarea.value.length > TEXTAREA_LIMIT) {
      const selectionStart = textarea.selectionStart;
      textarea.value = textarea.value.slice(0, TEXTAREA_LIMIT);
      const nextPosition = Math.min(selectionStart, TEXTAREA_LIMIT);
      textarea.setSelectionRange(nextPosition, nextPosition);
    }

    const count = textarea.value.length;
    counter.textContent = formatCounter(count);
    counter.classList.toggle('is-warning', count >= TEXTAREA_LIMIT * 0.9 && count < TEXTAREA_LIMIT);
    counter.classList.toggle('is-limit', count >= TEXTAREA_LIMIT);
    counter.classList.toggle('warning', count >= TEXTAREA_LIMIT * 0.9 && count < TEXTAREA_LIMIT);
    counter.classList.toggle('danger', count >= TEXTAREA_LIMIT);
  };

  const initTextarea = (textarea) => {
    textarea.setAttribute('maxlength', String(TEXTAREA_LIMIT));
    const counter = getCounter(textarea);
    counter.classList.add('textarea-char-badge');
    counter.setAttribute('aria-live', 'polite');

    updateTextarea(textarea, counter);
    textarea.addEventListener('input', () => updateTextarea(textarea, counter));
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('textarea').forEach(initTextarea);
  });
})();
