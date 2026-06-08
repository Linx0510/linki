const cards = [...document.querySelectorAll('.intelligence_card')];

const setActiveCard = () => {
  const triggerY = window.innerHeight * 0.58;

  cards.forEach((card, index) => {
    const rect = card.getBoundingClientRect();
    const isCurrent = rect.top <= triggerY && rect.bottom > triggerY;
    const isPast = rect.bottom <= triggerY;

    card.classList.toggle('is-active', isCurrent);
    card.classList.toggle('is-past', isPast && !isCurrent);

    if (!isCurrent && !isPast) {
      card.classList.remove('is-active', 'is-past');
    }

    if (window.scrollY < 10 && index === 0) {
      card.classList.add('is-active');
    }
  });
};

setActiveCard();
window.addEventListener('scroll', setActiveCard, { passive: true });
window.addEventListener('resize', setActiveCard);
