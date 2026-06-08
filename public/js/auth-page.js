(() => {
  const sidePanel = document.getElementById('sidePanel');
  const registerContainer = document.getElementById('registerContainer');
  const sideText = document.getElementById('sideText');
  const switchButton = document.getElementById('switchButton');
  const registerForm = document.getElementById('registerForm');
  const loginForm = document.getElementById('loginForm');

  if (!sidePanel || !registerContainer || !switchButton || !registerForm || !loginForm) {
    return;
  }

  const initialMode = document.body.dataset.initialMode || 'login';
  let isLoginMode = initialMode !== 'register';

  const logoLink = document.getElementById('logoLink');
  const svgRects = document.querySelectorAll('.logo-svg rect');

  const originalPositions = [
    { x: 76.6035, y: 13.1301 },
    { x: 105.049, y: 13.1301 },
    { x: 76.6001, y: 50.3345 },
    { x: 105.057, y: 50.3345 },
  ];

  const rotatedPositions = [
    { x: 105.049, y: 13.1301 },
    { x: 105.057, y: 50.3345 },
    { x: 76.6035, y: 13.1301 },
    { x: 76.6001, y: 50.3345 },
  ];

  const animateRects = (positions) => {
    svgRects.forEach((rect, index) => {
      rect.setAttribute('x', positions[index].x);
      rect.setAttribute('y', positions[index].y);
    });
  };

  if (logoLink) {
    logoLink.addEventListener('mouseenter', () => animateRects(rotatedPositions));
    logoLink.addEventListener('mouseleave', () => animateRects(originalPositions));
  }

  const setAuthMode = (mode) => {
    const shouldShowRegister = mode === 'register';

    sidePanel.classList.toggle('slide-to-register', shouldShowRegister);
    sidePanel.classList.toggle('slide-to-login', !shouldShowRegister);
    registerContainer.classList.toggle('open', shouldShowRegister);

    sideText.textContent = shouldShowRegister ? 'Есть аккаунт?' : 'Нет аккаунта?';
    switchButton.textContent = shouldShowRegister ? 'Войти' : 'Зарегистрироваться';
    isLoginMode = !shouldShowRegister;
  };

  const switchForms = () => {
    setAuthMode(isLoginMode ? 'register' : 'login');
  };

  const showError = (input, message) => {
    const formGroup = input.closest('.form-group');
    if (!formGroup) return;

    formGroup.classList.add('error');
    let errorDiv = formGroup.querySelector('.error-message:not(#passwordError)');
    if (!errorDiv) {
      errorDiv = document.createElement('div');
      errorDiv.className = 'error-message';
      formGroup.appendChild(errorDiv);
    }

    errorDiv.textContent = message;
    input.style.borderBottomColor = '#ff6b6b';
  };

  const clearErrors = (form) => {
    form.querySelectorAll('.form-group').forEach((group) => {
      group.classList.remove('error');
      group.querySelectorAll('.error-message').forEach((div) => {
        if (div.id !== 'passwordError') div.remove();
      });

      const input = group.querySelector('input, textarea');
      if (input) input.style.borderBottomColor = '';
    });
  };

  const validateLogin = () => {
    clearErrors(loginForm);
    const emailInput = document.getElementById('login_email');
    const passwordInput = document.getElementById('login_password');
    const emailRegex = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;

    let isValid = true;

    if (!emailInput.value.trim()) {
      showError(emailInput, 'Пожалуйста, введите email');
      isValid = false;
    } else if (!emailRegex.test(emailInput.value.trim())) {
      showError(emailInput, 'Введите корректный email (example@domain.com)');
      isValid = false;
    }

    if (!passwordInput.value.trim()) {
      showError(passwordInput, 'Пожалуйста, введите пароль');
      isValid = false;
    }

    return isValid;
  };

  const validateRegister = () => {
    clearErrors(registerForm);

    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('reg_email');
    const passwordInput = document.getElementById('reg_password');
    const confirmInput = document.getElementById('confirm_password');
    const agreeTerms = document.getElementById('agreeTerms');
    const emailRegex = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;

    const passwordErrorDiv = document.getElementById('passwordError');
    passwordErrorDiv.style.display = 'none';

    let isValid = true;

    if (!nameInput.value.trim()) {
      showError(nameInput, 'Пожалуйста, введите ваше имя');
      isValid = false;
    }

    if (!emailInput.value.trim()) {
      showError(emailInput, 'Пожалуйста, введите email');
      isValid = false;
    } else if (!emailRegex.test(emailInput.value.trim())) {
      showError(emailInput, 'Введите корректный email (example@domain.com)');
      isValid = false;
    }

    if (!passwordInput.value.trim()) {
      showError(passwordInput, 'Пожалуйста, введите пароль');
      isValid = false;
    }

    if (!confirmInput.value.trim()) {
      showError(confirmInput, 'Пожалуйста, повторите пароль');
      isValid = false;
    } else if (passwordInput.value !== confirmInput.value) {
      passwordErrorDiv.style.display = 'block';
      passwordInput.style.borderBottomColor = '#ff6b6b';
      confirmInput.style.borderBottomColor = '#ff6b6b';
      isValid = false;
    }

    if (!agreeTerms.checked) {
      const checkboxLabel = document.querySelector('.custom-checkbox');
      checkboxLabel.style.border = '1px solid #ff6b6b';
      checkboxLabel.style.borderRadius = '8px';
      checkboxLabel.style.padding = '8px 12px';
      checkboxLabel.style.backgroundColor = 'rgba(255, 107, 107, 0.05)';
      setTimeout(() => {
        checkboxLabel.style.border = '';
        checkboxLabel.style.padding = '';
        checkboxLabel.style.backgroundColor = '';
      }, 2000);
      isValid = false;
    }

    if (isValid) {
      const fullName = nameInput.value.trim();
      const [firstName, ...lastNameParts] = fullName.split(/\s+/);
      document.getElementById('first_name').value = firstName || '';
      document.getElementById('last_name').value = lastNameParts.join(' ') || '-';
    }

    return isValid;
  };

  loginForm.addEventListener('submit', (event) => {
    if (!validateLogin()) {
      event.preventDefault();
    }
  });

  registerForm.addEventListener('submit', (event) => {
    if (!validateRegister()) {
      event.preventDefault();
    }
  });

  switchButton.addEventListener('click', switchForms);
  setAuthMode(initialMode === 'register' ? 'register' : 'login');
})();
