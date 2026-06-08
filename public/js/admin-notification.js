/**
 * Admin Notification System
 * Shows modal notifications for AJAX actions in admin panel
 */

const notificationTypes = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info'
};

function showAdminNotification(title, message, type = notificationTypes.SUCCESS, duration = 4000) {
    const modal = document.getElementById('adminNotificationModal');
    if (!modal) return;
    
    const titleElem = document.getElementById('notificationTitle');
    const messageElem = document.getElementById('notificationMessage');
    const iconElem = document.getElementById('notificationIcon');
    const contentElem = modal.querySelector('.admin-notification-content');
    
    // Set content
    titleElem.textContent = title;
    messageElem.textContent = message;
    
    // Update icon based on type
    iconElem.className = 'notification-icon ' + type;
    
    // Set icon SVG based on type
    let svgContent = '';
    switch(type) {
        case notificationTypes.SUCCESS:
            svgContent = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            break;
        case notificationTypes.ERROR:
            svgContent = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
            break;
        case notificationTypes.WARNING:
            svgContent = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
            break;
        case notificationTypes.INFO:
            svgContent = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
            break;
    }
    iconElem.innerHTML = svgContent;
    
    // Update content class for styling
    contentElem.className = 'admin-notification-content ' + type;
    
    // Show modal
    modal.style.display = 'flex';
    
    // Auto-close if duration is specified
    if (duration > 0) {
        setTimeout(() => {
            closeAdminNotification();
        }, duration);
    }
}

function closeAdminNotification() {
    const modal = document.getElementById('adminNotificationModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

const notificationMessages = {
    'user_blocked': 'Пользователь успешно заблокирован',
    'user_unblocked': 'Пользователь разблокирован',
    'work_approved': 'Работа одобрена и опубликована',
    'work_rejected': 'Работа отклонена',
    'complaint_resolved': 'Жалоба рассмотрена',
    'withdrawal_approved': 'Заявка на вывод одобрена',
    'withdrawal_rejected': 'Заявка на вывод отклонена',
};

/**
 * Intercept admin form submissions and handle via AJAX
 */
function setupAdminFormNotifications() {
    document.addEventListener('submit', function(e) {
        const form = e.target;
        
        // Only handle forms in admin sections
        if (!form.closest('.admin-container')) {
            return;
        }
        
        // Only handle POST forms (not filter/search forms)
        if (form.method.toLowerCase() !== 'post') {
            return;
        }
        
        const action = form.getAttribute('action') || '';
        
        // Skip filter forms
        if (action === '/admin/users' || action === '/admin/works' || 
            action === '/admin/complaints' || action === '/admin/feedback') {
            return;
        }
        
        // Prevent default form submission
        e.preventDefault();
        
        // Determine action type and message
        let actionType = 'success';
        let message = 'Действие выполнено успешно';
        let title = 'Успешно';
        
        if (action.includes('/block')) {
            actionType = 'user_blocked';
            message = notificationMessages['user_blocked'];
        } else if (action.includes('/unblock')) {
            actionType = 'user_unblocked';
            message = notificationMessages['user_unblocked'];
        } else if (action.includes('/moderate')) {
            const statusInput = form.querySelector('input[name="status"]');
            if (statusInput && statusInput.value === 'active') {
                actionType = 'work_approved';
                message = notificationMessages['work_approved'];
            } else {
                actionType = 'work_rejected';
                message = notificationMessages['work_rejected'];
            }
        } else if (action.includes('/resolve')) {
            actionType = 'complaint_resolved';
            message = notificationMessages['complaint_resolved'];
        }
        
        // Disable submit button
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
        }
        
        // Submit form via AJAX
        const formData = new FormData(form);
        
        fetch(action, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json().catch(() => ({ success: true })))
        .then(data => {
            // Show notification
            showAdminNotification(title, message, notificationTypes.SUCCESS, 2000);
            
            // Reload page after notification closes
            setTimeout(() => {
                window.location.reload();
            }, 2500);
        })
        .catch(error => {
            console.error('Admin action error:', error);
            showAdminNotification('Ошибка', 'Ошибка при выполнении действия', notificationTypes.ERROR, 0);
            if (submitBtn) {
                submitBtn.disabled = false;
            }
        });
    }, true);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupAdminFormNotifications);
} else {
    setupAdminFormNotifications();
}
