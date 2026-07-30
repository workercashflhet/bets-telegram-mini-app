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
    
    // Show initial tab
    showTab('profile');
    
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

// Show tab content
function showTab(page) {
    // Скрываем все табы
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Показываем выбранный таб
    const targetTab = document.getElementById(`tab-${page}`);
    if (targetTab) {
        targetTab.classList.add('active');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Bottom navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            const page = item.dataset.page;
            showTab(page);
        });
    });

    // Close app on back button
    tg.onEvent('backButtonClicked', () => {
        tg.close();
    });
}

// Export functions for debugging
window.betsApp = {
    showTab
};