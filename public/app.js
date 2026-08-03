// Telegram Web App initialization
const tg = window.Telegram.WebApp;

// App state
const state = {
    user: null,
    userId: null,
    balance: 0.00,
    inventory: 0,
    currentTab: 'promocodes',
    calcValue: '0',
    calcOperation: null,
    calcPrevious: null
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Показываем прелоадер минимум 3 секунды
    const preloader = document.getElementById('preloader');
    const app = document.getElementById('app');
    
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
    
    // Показываем прелоадер минимум 3 секунды
    setTimeout(() => {
        // Скрываем прелоадер
        preloader.classList.add('hidden');
        
        // Показываем приложение
        app.style.display = 'block';
        
        // Инициализируем приложение
        initializeApp();
    }, 3000);
});

function initializeApp() {
    // Initialize user first
    initializeUser();
    
    // Setup event listeners
    setupEventListeners();
    
    // Инициализируем карусель
    initializeCarousel();
    
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
}

// Initialize user from Telegram
function initializeUser() {
    try {
        // Получаем данные пользователя из Telegram
        const user = tg.initDataUnsafe?.user;
        
        console.log('Telegram user data:', user);
        
        if (user) {
            state.user = user;
            state.userId = user.id || Math.floor(Math.random() * 10000);
            
            // Обновляем имя пользователя в левом островке
            const userNameDisplay = document.getElementById('userNameDisplay');
            if (userNameDisplay) {
                const firstName = user.first_name || '';
                const lastName = user.last_name || '';
                const username = user.username || '';
                
                if (firstName) {
                    userNameDisplay.textContent = firstName + (lastName ? ' ' + lastName : '');
                } else if (username) {
                    userNameDisplay.textContent = '@' + username;
                } else {
                    userNameDisplay.textContent = 'User';
                }
            }
            
            // Обновляем аватарку пользователя
            const userAvatar = document.getElementById('userAvatar');
            if (userAvatar) {
                if (user.photo_url) {
                    userAvatar.src = user.photo_url;
                } else {
                    const avatarUrl = `https://t.me/i/userpic/320/${user.id}.jpg`;
                    userAvatar.src = avatarUrl;
                    userAvatar.onerror = function() {
                        this.style.display = 'none';
                        const fallbackText = document.createElement('span');
                        fallbackText.className = 'user-avatar-fallback';
                        const firstLetter = (user.first_name || user.username || 'U')[0].toUpperCase();
                        fallbackText.textContent = firstLetter;
                        this.parentNode.insertBefore(fallbackText, this);
                        this.style.display = 'none';
                    };
                }
            }
            
            // Обновляем данные в шапке
            const userNameElement = document.getElementById('userName');
            if (userNameElement) {
                userNameElement.textContent = `@${user.username || 'user'}`;
            }
            const userIdElement = document.getElementById('userId');
            if (userIdElement) {
                userIdElement.textContent = `id: ${state.userId}`;
            }
            
            // Сохраняем в localStorage
            localStorage.setItem('bets_user', JSON.stringify({
                username: user.username || 'user',
                userId: state.userId,
                firstName: user.first_name || '',
                lastName: user.last_name || '',
                photoUrl: user.photo_url || ''
            }));
        } else {
            console.warn('No Telegram user data available, using fallback');
            const savedUser = localStorage.getItem('bets_user');
            if (savedUser) {
                const userData = JSON.parse(savedUser);
                const userNameDisplay = document.getElementById('userNameDisplay');
                if (userNameDisplay) {
                    userNameDisplay.textContent = userData.firstName || userData.username || 'User';
                }
                state.userId = userData.userId;
            } else {
                const userNameDisplay = document.getElementById('userNameDisplay');
                if (userNameDisplay) {
                    userNameDisplay.textContent = 'Demo User';
                }
                state.userId = Math.floor(Math.random() * 10000);
            }
        }
    } catch (error) {
        console.error('Error initializing user:', error);
    }
}

// Carousel state
let currentSlide = 0;
let totalSlides = 0;
let autoPlayInterval = null;
let isTransitioning = false;
let startX = 0;
let currentX = 0;
let isDragging = false;

// Initialize carousel
function initializeCarousel() {
    const track = document.getElementById('carouselTrack');
    const dots = document.querySelectorAll('.dot');
    
    if (!track) return;
    
    totalSlides = track.children.length;
    
    // Set initial position
    updateCarousel(0);
    
    // Start autoplay
    startAutoPlay();
    
    // Add touch/click events for dots
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            goToSlide(index);
        });
    });
    
    // Touch events for swipe
    track.parentElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    track.parentElement.addEventListener('touchmove', handleTouchMove, { passive: true });
    track.parentElement.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    // Mouse events for desktop swipe
    track.parentElement.addEventListener('mousedown', handleMouseDown);
    track.parentElement.addEventListener('mouseleave', handleMouseLeave);
    track.parentElement.addEventListener('mouseup', handleMouseUp);
    track.parentElement.addEventListener('mousemove', handleMouseMove);
}

// Update carousel position
function updateCarousel(index) {
    const track = document.getElementById('carouselTrack');
    const dots = document.querySelectorAll('.dot');
    
    if (!track) return;
    
    currentSlide = index;
    const offset = -index * 100;
    track.style.transform = `translateX(${offset}%)`;
    
    // Update dots
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
    });
}

// Go to specific slide
function goToSlide(index) {
    if (isTransitioning || index === currentSlide) return;
    if (index < 0) index = totalSlides - 1;
    if (index >= totalSlides) index = 0;
    
    isTransitioning = true;
    updateCarousel(index);
    setTimeout(() => {
        isTransitioning = false;
    }, 500);
    
    resetAutoPlay();
}

// Next slide
function nextSlide() {
    goToSlide((currentSlide + 1) % totalSlides);
}

// Start autoplay
function startAutoPlay() {
    stopAutoPlay();
    autoPlayInterval = setInterval(nextSlide, 7000);
}

// Stop autoplay
function stopAutoPlay() {
    if (autoPlayInterval) {
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
    }
}

// Reset autoplay
function resetAutoPlay() {
    startAutoPlay();
}

// Touch handlers
function handleTouchStart(e) {
    startX = e.touches[0].clientX;
    isDragging = true;
    stopAutoPlay();
}

function handleTouchMove(e) {
    if (!isDragging) return;
    currentX = e.touches[0].clientX;
}

function handleTouchEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    
    const diff = startX - currentX;
    const threshold = 50;
    
    if (Math.abs(diff) > threshold) {
        if (diff > 0) {
            goToSlide(currentSlide + 1);
        } else {
            goToSlide(currentSlide - 1);
        }
    } else {
        resetAutoPlay();
    }
    
    startX = 0;
    currentX = 0;
}

// Mouse handlers for desktop
function handleMouseDown(e) {
    startX = e.clientX;
    isDragging = true;
    stopAutoPlay();
}

function handleMouseMove(e) {
    if (!isDragging) return;
    currentX = e.clientX;
}

function handleMouseUp(e) {
    if (!isDragging) return;
    isDragging = false;
    
    const diff = startX - currentX;
    const threshold = 50;
    
    if (Math.abs(diff) > threshold) {
        if (diff > 0) {
            goToSlide(currentSlide + 1);
        } else {
            goToSlide(currentSlide - 1);
        }
    } else {
        resetAutoPlay();
    }
    
    startX = 0;
    currentX = 0;
}

function handleMouseLeave() {
    if (isDragging) {
        isDragging = false;
        startX = 0;
        currentX = 0;
        resetAutoPlay();
    }
}

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
    
    // Если переключились на вкладку Game, возобновляем автоплей
    if (page === 'game') {
        resetAutoPlay();
    } else {
        stopAutoPlay();
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

    // Free spin button
    const freeSpinBtn = document.getElementById('freeSpinBtn');
    if (freeSpinBtn) {
        freeSpinBtn.addEventListener('click', () => {
            tg.showPopup({
                title: '🎰 Бесплатный спин',
                message: 'Вы получили бесплатный спин! Крутите колесо удачи!',
                buttons: [
                    { id: 'spin', text: '🎰 Крутить!' },
                    { id: 'cancel', text: 'Отмена', type: 'cancel' }
                ]
            }, (buttonId) => {
                if (buttonId === 'spin') {
                    tg.showAlert('🎉 Поздравляем! Вы выиграли 100 ₽!');
                }
            });
        });
    }

    // Deposit button in balance island
    const depositBtn = document.getElementById('depositBtn');
    if (depositBtn) {
        depositBtn.addEventListener('click', () => {
            tg.showPopup({
                title: '💰 Deposit',
                message: 'Select deposit method',
                buttons: [
                    { id: 'crypto', text: 'Crypto' },
                    { id: 'card', text: 'Card' },
                    { id: 'cancel', text: 'Cancel', type: 'cancel' }
                ]
            }, (buttonId) => {
                if (buttonId === 'crypto') {
                    tg.showAlert('Crypto deposit selected');
                } else if (buttonId === 'card') {
                    tg.showAlert('Card deposit selected');
                }
            });
        });
    }

    // Close app on back button
    tg.onEvent('backButtonClicked', () => {
        tg.close();
    });
}

// Export functions for debugging
window.betsApp = {
    state,
    showTab,
    goToSlide,
    nextSlide,
    initializeUser
};