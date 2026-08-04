// Telegram Web App initialization
var tg = window.Telegram.WebApp;

// App state
var state = {
    user: null,
    userId: null,
    currentTab: 'promocodes',
    calcValue: '0',
    calcOperation: null,
    calcPrevious: null
};

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    var preloader = document.getElementById('preloader');
    var app = document.getElementById('app');
    
    tg.expand();
    
    try {
        tg.requestFullscreen();
    } catch (e) {
        console.log('Fullscreen not available immediately');
    }
    
    tg.ready();
    tg.setBackgroundColor('#000000');
    tg.setHeaderColor('#000000');
    
    setTimeout(function() {
        preloader.classList.add('hidden');
        app.style.display = 'block';
        initializeApp();
    }, 3000);
});

function initializeApp() {
    // Загружаем пользователя из БД
    initializeUser();
    
    // Setup event listeners
    setupEventListeners();
    
    // Инициализируем карусель
    initializeCarousel();
    
    window.addEventListener('resize', function() {
        if (tg.isExpanded) {
            tg.expand();
        }
    });
    
    tg.onEvent('viewportChanged', function() {
        if (!tg.isExpanded) {
            tg.expand();
        }
    });
}

// ============================================================
// ПОЛЬЗОВАТЕЛЬ - ЗАГРУЗКА ИЗ БД
// ============================================================

async function initializeUser() {
    try {
        // Загружаем пользователя из БД
        var user = await UserManager.loadUser();
        
        if (user) {
            console.log('✅ User loaded:', user);
            state.user = user;
            state.userId = user.user_id;
            
            // Обновляем UI
            updateUserUI(user);
            updateBalanceUI(user);
        } else {
            console.warn('⚠️ No user loaded, using fallback');
            // Fallback для демо
            var demoUser = {
                user_id: 'demo_' + Date.now(),
                username: 'demo_user',
                first_name: 'Demo',
                ton_balance: 0,
                stars_balance: 0
            };
            state.user = demoUser;
            state.userId = demoUser.user_id;
            updateUserUI(demoUser);
            updateBalanceUI(demoUser);
        }
        
        // Подписываемся на изменения баланса
        UserManager.subscribe(function(user) {
            console.log('🔄 Balance updated:', user.ton_balance, user.stars_balance);
            updateBalanceUI(user);
            // Обновляем PvP если открыт
            if (window.pvpGame) {
                window.pvpGame.updateBalanceFromDB(user);
            }
        });
        
    } catch (error) {
        console.error('Error initializing user:', error);
    }
}

// ============================================================
// UI ОБНОВЛЕНИЯ
// ============================================================

function updateUserUI(user) {
    var userNameDisplay = document.getElementById('userNameDisplay');
    var userAvatar = document.getElementById('userAvatar');
    var userNameElement = document.getElementById('userName');
    var userIdElement = document.getElementById('userId');
    
    // Имя
    if (userNameDisplay) {
        var firstName = user.first_name || '';
        var lastName = user.last_name || '';
        var username = user.username || '';
        
        if (firstName) {
            userNameDisplay.textContent = firstName + (lastName ? ' ' + lastName : '');
        } else if (username) {
            userNameDisplay.textContent = '@' + username;
        } else {
            userNameDisplay.textContent = 'User';
        }
    }
    
    // Аватар
    if (userAvatar) {
        if (user.photo_url) {
            userAvatar.src = user.photo_url;
        } else {
            // Пробуем загрузить через Telegram
            var tgUser = UserManager.getTelegramUser();
            if (tgUser && tgUser.id) {
                var avatarUrl = 'https://t.me/i/userpic/320/' + tgUser.id + '.jpg';
                userAvatar.src = avatarUrl;
                userAvatar.onerror = function() {
                    this.style.display = 'none';
                    var fallback = document.createElement('span');
                    fallback.className = 'user-avatar-fallback';
                    var letter = (user.first_name || user.username || 'U')[0].toUpperCase();
                    fallback.textContent = letter;
                    this.parentNode.insertBefore(fallback, this);
                };
            }
        }
    }
    
    // Username
    if (userNameElement) {
        userNameElement.textContent = '@' + (user.username || 'user');
    }
    
    // ID
    if (userIdElement) {
        userIdElement.textContent = 'id: ' + (user.user_id || '');
    }
}

function updateBalanceUI(user) {
    if (!user) return;
    
    var tonBalanceEl = document.getElementById('tonBalance');
    var starsBalanceEl = document.getElementById('starsBalance');
    
    if (tonBalanceEl) {
        tonBalanceEl.textContent = (user.ton_balance || 0).toFixed(2);
    }
    if (starsBalanceEl) {
        starsBalanceEl.textContent = Math.floor(user.stars_balance || 0);
    }
}

// ============================================================
// КАРУСЕЛЬ
// ============================================================

var currentSlide = 0;
var totalSlides = 0;
var autoPlayInterval = null;
var isTransitioning = false;
var startX = 0;
var currentX = 0;
var isDragging = false;

function initializeCarousel() {
    var track = document.getElementById('carouselTrack');
    var dots = document.querySelectorAll('.dot');
    
    if (!track) return;
    
    totalSlides = track.children.length;
    updateCarousel(0);
    startAutoPlay();
    
    dots.forEach(function(dot, index) {
        dot.addEventListener('click', function() {
            goToSlide(index);
        });
    });
    
    track.parentElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    track.parentElement.addEventListener('touchmove', handleTouchMove, { passive: true });
    track.parentElement.addEventListener('touchend', handleTouchEnd, { passive: true });
    track.parentElement.addEventListener('mousedown', handleMouseDown);
    track.parentElement.addEventListener('mouseleave', handleMouseLeave);
    track.parentElement.addEventListener('mouseup', handleMouseUp);
    track.parentElement.addEventListener('mousemove', handleMouseMove);
}

function updateCarousel(index) {
    var track = document.getElementById('carouselTrack');
    var dots = document.querySelectorAll('.dot');
    
    if (!track) return;
    
    currentSlide = index;
    var offset = -index * 100;
    track.style.transform = 'translateX(' + offset + '%)';
    
    dots.forEach(function(dot, i) {
        dot.classList.toggle('active', i === index);
    });
}

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

function nextSlide() {
    goToSlide((currentSlide + 1) % totalSlides);
}

function startAutoPlay() {
    stopAutoPlay();
    autoPlayInterval = setInterval(nextSlide, 7000);
}

function stopAutoPlay() {
    if (autoPlayInterval) {
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
    }
}

function resetAutoPlay() {
    startAutoPlay();
}

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

// ============================================================
// ВКЛАДКИ
// ============================================================

function showTab(page) {
    document.querySelectorAll('.tab-content').forEach(function(tab) {
        tab.classList.remove('active');
    });
    
    var targetTab = document.getElementById('tab-' + page);
    if (targetTab) {
        targetTab.classList.add('active');
    }
    
    if (page === 'game') {
        resetAutoPlay();
    } else {
        stopAutoPlay();
    }
}

// ============================================================
// СОБЫТИЯ
// ============================================================

function setupEventListeners() {
    // Навигация
    document.querySelectorAll('.nav-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
            document.querySelectorAll('.nav-item').forEach(function(i) { i.classList.remove('active'); });
            item.classList.add('active');
            var page = item.dataset.page;
            showTab(page);
        });
    });

    // Бесплатный спин
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

    // Депозит
    var depositBtn = document.getElementById('depositBtn');
    if (depositBtn) {
        depositBtn.addEventListener('click', function() {
            if (window.pvpGame && window.pvpGame.openDepositModal) {
                window.pvpGame.openDepositModal();
            } else {
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

    // Закрытие
    tg.onEvent('backButtonClicked', function() {
        tg.close();
    });
}

// Экспорт
window.betsApp = {
    state: state,
    showTab: showTab,
    goToSlide: goToSlide,
    nextSlide: nextSlide,
    initializeUser: initializeUser,
    UserManager: UserManager
};

console.log('✅ App initialized');