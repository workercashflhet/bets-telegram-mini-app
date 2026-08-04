// Telegram Web App initialization
var tg = window.Telegram.WebApp;

// App state
var state = {
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
document.addEventListener('DOMContentLoaded', function() {
    // Показываем прелоадер минимум 3 секунды
    var preloader = document.getElementById('preloader');
    var app = document.getElementById('app');
    
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
    setTimeout(function() {
        // Скрываем прелоадер
        preloader.classList.add('hidden');
        
        // Показываем приложение
        app.style.display = 'block';
        
        // Инициализируем приложение
        initializeApp();
    }, 3000);
});

function initializeApp() {
    // Initialize user from DB first
    initializeUserFromDB();
    
    // Setup event listeners
    setupEventListeners();
    
    // Инициализируем карусель
    initializeCarousel();
    
    // Обработчик изменения размера
    window.addEventListener('resize', function() {
        if (tg.isExpanded) {
            tg.expand();
        }
    });
    
    // Обработчик события изменения вьюпорта
    tg.onEvent('viewportChanged', function() {
        if (!tg.isExpanded) {
            tg.expand();
        }
    });
}

// Initialize user from Telegram and Supabase
async function initializeUserFromDB() {
    try {
        // Загружаем пользователя из БД
        var userData = await UserManager.getOrCreateUser();
        
        if (userData) {
            console.log('✅ User loaded from DB:', userData);
            
            // Обновляем состояние
            state.user = userData;
            state.userId = userData.user_id;
            state.balance = userData.ton_balance;
            state.inventory = userData.stars_balance;
            
            // Синхронизируем с localStorage
            UserManager.syncFromLocalStorage();
            
            // Обновляем UI
            updateUserUI(userData);
            updateBalanceUI();
        } else {
            // Fallback на localStorage
            console.warn('⚠️ Using localStorage fallback');
            var savedUser = localStorage.getItem('bets_user');
            if (savedUser) {
                var userData = JSON.parse(savedUser);
                state.userId = userData.userId;
                var userNameDisplay = document.getElementById('userNameDisplay');
                if (userNameDisplay) {
                    userNameDisplay.textContent = userData.firstName || userData.username || 'User';
                }
            } else {
                var userNameDisplay = document.getElementById('userNameDisplay');
                if (userNameDisplay) {
                    userNameDisplay.textContent = 'Demo User';
                }
                state.userId = Math.floor(Math.random() * 10000);
            }
            
            // Загружаем баланс из localStorage
            var saved = localStorage.getItem('bets_data');
            if (saved) {
                var data = JSON.parse(saved);
                state.balance = data.balance || 0;
                state.inventory = data.inventory || 0;
                updateBalanceUI();
            }
        }
        
    } catch (error) {
        console.error('Error initializing user from DB:', error);
    }
}

// Update user UI
function updateUserUI(userData) {
    var userNameDisplay = document.getElementById('userNameDisplay');
    var userAvatar = document.getElementById('userAvatar');
    var userNameElement = document.getElementById('userName');
    var userIdElement = document.getElementById('userId');
    
    if (userNameDisplay) {
        var firstName = userData.first_name || '';
        var lastName = userData.last_name || '';
        var username = userData.username || '';
        
        if (firstName) {
            userNameDisplay.textContent = firstName + (lastName ? ' ' + lastName : '');
        } else if (username) {
            userNameDisplay.textContent = '@' + username;
        } else {
            userNameDisplay.textContent = 'User';
        }
    }
    
    if (userAvatar) {
        if (userData.photo_url) {
            userAvatar.src = userData.photo_url;
        } else {
            userAvatar.onerror = function() {
                this.style.display = 'none';
                var fallbackText = document.createElement('span');
                fallbackText.className = 'user-avatar-fallback';
                var firstLetter = (userData.first_name || userData.username || 'U')[0].toUpperCase();
                fallbackText.textContent = firstLetter;
                this.parentNode.insertBefore(fallbackText, this);
                this.style.display = 'none';
            };
        }
    }
    
    if (userNameElement) {
        userNameElement.textContent = '@' + (userData.username || 'user');
    }
    
    if (userIdElement) {
        userIdElement.textContent = 'id: ' + userData.user_id;
    }
}

// Update balance UI
function updateBalanceUI() {
    var tonBalanceEl = document.getElementById('tonBalance');
    var starsBalanceEl = document.getElementById('starsBalance');
    
    if (tonBalanceEl) {
        tonBalanceEl.textContent = state.balance.toFixed(2);
    }
    if (starsBalanceEl) {
        starsBalanceEl.textContent = Math.floor(state.inventory);
    }
    
    // Сохраняем в localStorage для обратной совместимости
    localStorage.setItem('bets_data', JSON.stringify({
        balance: state.balance,
        inventory: state.inventory
    }));
}

// Update balance from DB
async function refreshBalance() {
    try {
        var userData = await UserManager.getOrCreateUser();
        if (userData) {
            state.balance = userData.ton_balance;
            state.inventory = userData.stars_balance;
            updateBalanceUI();
            console.log('✅ Balance refreshed:', state.balance, state.inventory);
        }
    } catch (error) {
        console.error('Error refreshing balance:', error);
    }
}

// Carousel state
var currentSlide = 0;
var totalSlides = 0;
var autoPlayInterval = null;
var isTransitioning = false;
var startX = 0;
var currentX = 0;
var isDragging = false;

// Initialize carousel
function initializeCarousel() {
    var track = document.getElementById('carouselTrack');
    var dots = document.querySelectorAll('.dot');
    
    if (!track) return;
    
    totalSlides = track.children.length;
    
    // Set initial position
    updateCarousel(0);
    
    // Start autoplay
    startAutoPlay();
    
    // Add touch/click events for dots
    dots.forEach(function(dot, index) {
        dot.addEventListener('click', function() {
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
    var track = document.getElementById('carouselTrack');
    var dots = document.querySelectorAll('.dot');
    
    if (!track) return;
    
    currentSlide = index;
    var offset = -index * 100;
    track.style.transform = 'translateX(' + offset + '%)';
    
    // Update dots
    dots.forEach(function(dot, i) {
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
    setTimeout(function() {
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
    
    var diff = startX - currentX;
    var threshold = 50;
    
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
    
    var diff = startX - currentX;
    var threshold = 50;
    
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
    document.querySelectorAll('.tab-content').forEach(function(tab) {
        tab.classList.remove('active');
    });
    
    // Показываем выбранный таб
    var targetTab = document.getElementById('tab-' + page);
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
    document.querySelectorAll('.nav-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
            document.querySelectorAll('.nav-item').forEach(function(i) { i.classList.remove('active'); });
            item.classList.add('active');
            
            var page = item.dataset.page;
            showTab(page);
        });
    });

    // Free spin button
    var freeSpinBtn = document.getElementById('freeSpinBtn');
    if (freeSpinBtn) {
        freeSpinBtn.addEventListener('click', function() {
            tg.showPopup({
                title: '🎰 Бесплатный спин',
                message: 'Вы получили бесплатный спин! Крутите колесо удачи!',
                buttons: [
                    { id: 'spin', text: '🎰 Крутить!' },
                    { id: 'cancel', text: 'Отмена', type: 'cancel' }
                ]
            }, function(buttonId) {
                if (buttonId === 'spin') {
                    tg.showAlert('🎉 Поздравляем! Вы выиграли 100 ₽!');
                }
            });
        });
    }

    // Deposit button in balance island
    var depositBtn = document.getElementById('depositBtn');
    if (depositBtn) {
        depositBtn.addEventListener('click', function() {
            // Открываем модалку депозита из pvp.js
            if (window.pvpGame && window.pvpGame.openDepositModal) {
                window.pvpGame.openDepositModal();
            } else {
                // Fallback: показываем попап
                tg.showPopup({
                    title: '💰 Deposit',
                    message: 'Выберите способ пополнения',
                    buttons: [
                        { id: 'ton', text: 'TON' },
                        { id: 'stars', text: 'Stars' },
                        { id: 'cancel', text: 'Отмена', type: 'cancel' }
                    ]
                }, function(buttonId) {
                    if (buttonId === 'ton') {
                        tg.showAlert('💰 Пополнение TON');
                    } else if (buttonId === 'stars') {
                        tg.showAlert('⭐ Пополнение Stars');
                    }
                });
            }
        });
    }

    // Close app on back button
    tg.onEvent('backButtonClicked', function() {
        tg.close();
    });
}

// Refresh balance periodically
setInterval(function() {
    refreshBalance();
}, 30000); // Каждые 30 секунд

// Export functions for debugging
window.betsApp = {
    state: state,
    showTab: showTab,
    goToSlide: goToSlide,
    nextSlide: nextSlide,
    initializeUserFromDB: initializeUserFromDB,
    refreshBalance: refreshBalance,
    UserManager: UserManager
};

console.log('✅ App initialized');