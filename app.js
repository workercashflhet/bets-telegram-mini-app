// Telegram Web App initialization
const tg = window.Telegram.WebApp;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Расширяем приложение на весь экран
    tg.expand();
    
    // Устанавливаем полноэкранный режим
    try {
        tg.requestFullscreen();
    } catch (e) {
        console.log('Fullscreen not available immediately');
    }
    
    // Уведомляем Telegram, что приложение готово
    tg.ready();
    
    // Настройка внешнего вида
    tg.setBackgroundColor('#000000');
    tg.setHeaderColor('#000000');
    
    // Setup event listeners
    setupEventListeners();
    
    // Обработчик изменения размера
    window.addEventListener('resize', () => {
        if (tg.isExpanded) {
            tg.expand();
        }
    });
    
    // Обработчик события изменения вьюпорта
    tg.onEvent('viewportChanged', () => {
        if (!tg.isExpanded) {
            tg.expand();
        }
    });
});

// Setup event listeners
function setupEventListeners() {
    // Bottom navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const page = item.dataset.page;
            if (page === 'profile') {
                showToast('Profile page');
            } else if (page === 'game') {
                showToast('Game page');
            } else if (page === 'settings') {
                showToast('Settings page');
            }
        });
    });

    // Close app on back button
    tg.onEvent('backButtonClicked', () => {
        tg.close();
    });
}

// Show toast notification
function showToast(message, duration = 3000) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, duration);
}

// Export functions for debugging
window.betsApp = {};