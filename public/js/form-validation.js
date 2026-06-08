(function () {
    const VALIDATION_ERROR_CLASS = 'error';
    const ERROR_SELECTOR = '.error-message, .form-validation-error, .review-error, .service-review-error, .report-validation-error';
    const SKIP_FORM_SELECTOR = '[data-skip-validation], .search-form, .logout-form, .exit, .inline-form, .filters';
    const FIELD_SELECTOR = 'input, textarea, select';

    const defaultMessages = {
        typeMismatch: 'Введите корректное значение',
        tooShort: 'Слишком короткое значение',
        tooLong: 'Слишком длинное значение',
        rangeUnderflow: 'Значение меньше допустимого',
        rangeOverflow: 'Значение больше допустимого',
        stepMismatch: 'Введите корректное значение',
        patternMismatch: 'Введите значение в правильном формате',
        badInput: 'Введите корректное значение',
        customError: 'Проверьте значение',
    };

    const getFieldMessage = (field) => {
        const validity = field.validity;
        const customMessage = field.dataset.validationMessage || field.dataset.errorMessage;

        if (validity.valueMissing) return '';
        if (customMessage && !validity.valid) return customMessage;
        if (validity.typeMismatch && field.type === 'email') return 'Введите корректный email';
        if (validity.rangeUnderflow) {
            const min = field.getAttribute('min');
            return min ? `Минимальное значение — ${min}` : defaultMessages.rangeUnderflow;
        }
        if (validity.rangeOverflow) {
            const max = field.getAttribute('max');
            return max ? `Максимальное значение — ${max}` : defaultMessages.rangeOverflow;
        }
        if (validity.tooShort) {
            return `Минимум ${field.getAttribute('minlength')} символов`;
        }
        if (validity.tooLong) {
            return `Не более ${field.getAttribute('maxlength')} символов`;
        }
        if (validity.patternMismatch) return defaultMessages.patternMismatch;
        if (validity.stepMismatch) return defaultMessages.stepMismatch;
        if (validity.badInput) return defaultMessages.badInput;
        if (validity.customError) return field.validationMessage || defaultMessages.customError;

        return field.validationMessage || defaultMessages.typeMismatch;
    };

    const findFieldContainer = (field) => (
        field.closest('.form-group, .form-group-work, .report-form-group, .review-comment-block, .review-stars-block, .stage-row, label')
        || field.parentElement
    );

    const getErrorTargetKey = (field) => field.id || field.name;

    const findErrorNode = (field, container, form) => {
        const key = getErrorTargetKey(field);
        if (key) {
            const mapped = Array.from(form.querySelectorAll('[data-error-for]'))
                .find((node) => node.dataset.errorFor === key);
            if (mapped) return mapped;
        }

        if (container) {
            const local = container.querySelector(ERROR_SELECTOR);
            if (local) return local;
        }

        if (field.type === 'hidden') {
            const formError = form.querySelector('.form-error-message, .review-error, .service-review-error, .report-validation-error, [data-error-for="form"]');
            if (formError) return formError;
        }

        if (!container) return null;

        const errorNode = document.createElement('div');
        errorNode.className = 'error-message form-validation-error';
        errorNode.setAttribute('role', 'alert');
        if (field.type === 'checkbox' || field.type === 'radio') {
            container.appendChild(errorNode);
        } else {
            field.insertAdjacentElement('afterend', errorNode);
        }
        return errorNode;
    };

    const setFieldError = (field, message) => {
        const form = field.form;
        if (!form) return;
        const container = findFieldContainer(field);
        const errorNode = findErrorNode(field, container, form);

        field.setAttribute('aria-invalid', 'true');
        if (container) container.classList.add(VALIDATION_ERROR_CLASS);
        if (errorNode) {
            errorNode.textContent = message;
            errorNode.style.display = message ? 'block' : 'none';
        }
    };

    const clearFieldError = (field) => {
        const form = field.form;
        if (!form) return;
        const container = findFieldContainer(field);
        const errorNode = findErrorNode(field, container, form);

        field.removeAttribute('aria-invalid');
        if (container) container.classList.remove(VALIDATION_ERROR_CLASS);
        if (errorNode) {
            errorNode.textContent = '';
            errorNode.style.display = 'none';
        }
    };

    const isFieldValid = (field) => {
        if (field.disabled || field.type === 'button' || field.type === 'submit' || field.type === 'reset') return true;
        return field.checkValidity();
    };

    const validateField = (field) => {
        if (isFieldValid(field)) {
            clearFieldError(field);
            return true;
        }

        setFieldError(field, getFieldMessage(field));
        return false;
    };

    const validateForm = (form) => {
        if (!form || form.matches(SKIP_FORM_SELECTOR)) return true;

        const fields = Array.from(form.querySelectorAll(FIELD_SELECTOR))
            .filter((field) => field.willValidate || field.hasAttribute('required'));
        const invalidFields = fields.filter((field) => !validateField(field));

        if (!invalidFields.length) return true;

        const firstVisibleInvalid = invalidFields.find((field) => field.type !== 'hidden' && field.offsetParent !== null) || invalidFields[0];
        if (firstVisibleInvalid && typeof firstVisibleInvalid.focus === 'function' && firstVisibleInvalid.type !== 'hidden') {
            firstVisibleInvalid.focus({ preventScroll: true });
            firstVisibleInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return false;
    };

    const bindLiveValidation = (form) => {
        if (!form || form.dataset.validationBound === 'true' || form.matches(SKIP_FORM_SELECTOR)) return;
        form.dataset.validationBound = 'true';
        form.setAttribute('novalidate', 'novalidate');

        form.addEventListener('input', (event) => {
            const field = event.target.closest?.(FIELD_SELECTOR);
            if (!field || !form.contains(field)) return;
            if (field.getAttribute('aria-invalid') === 'true') validateField(field);
        });

        form.addEventListener('change', (event) => {
            const field = event.target.closest?.(FIELD_SELECTOR);
            if (!field || !form.contains(field)) return;
            validateField(field);
        });
    };

    const initValidation = () => {
        document.querySelectorAll('form').forEach(bindLiveValidation);
    };

    document.addEventListener('submit', (event) => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;
        bindLiveValidation(form);
        if (!validateForm(form)) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }, true);

    document.addEventListener('DOMContentLoaded', initValidation);

    window.LineStokFormValidation = {
        validateForm,
        validateField,
        setFieldError,
        clearFieldError,
        initValidation,
    };
})();
