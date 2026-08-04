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

// TonConnect для главного меню
var tonConnectUI = null;
var isWalletConnected = false;
var walletAddress = null;

var MANIFEST_URL = 'https://bets-telegram-mini-app.vercel.app/tonconnect-manifest.json';
var OWNER_WALLET = 'UQC5ZUl4Qobq69CgLi7tg-8y6aOwVilc5b82jJFZShtnetrw';

// Состояние депозита
var depositState = {
    amount: 0,
    currency: 'ton',
    step: 'input',
    error: null,
    isWalletConnected: false,
    isProcessing: false
};

// ============================================================
// TON CONNECT ИНИЦИАЛИЗАЦИЯ
// ============================================================

function initTonConnect() {
    try {
        if (typeof window.TON_CONNECT_UI === 'undefined') {
            console.warn('⚠️ TonConnectUI not loaded, waiting...');
            var script = document.createElement('script');
            script.src = 'https://unpkg.com/@tonconnect/ui@2.0.0/dist/tonconnect-ui.min.js';
            script.onload = function() {
                console.log('✅ TonConnectUI loaded from CDN');
                createTonConnectInstance();
            };
            script.onerror = function() {
                console.error('❌ Failed to load TonConnectUI');
            };
            document.head.appendChild(script);
            return;
        }
        createTonConnectInstance();
    } catch (error) {
        console.error('❌ initTonConnect error:', error);
    }
}

function createTonConnectInstance() {
    try {
        var TonConnectUI = window.TON_CONNECT_UI.TonConnectUI;
        
        tonConnectUI = new TonConnectUI({
            manifestUrl: MANIFEST_URL,
            actionsConfiguration: {
                twaReturnUrl: 'https://t.me/betsgambles_bot/betsgambles'
            },
            uiPreferences: {
                theme: 'DARK'
            }
        });
        
        tonConnectUI.onStatusChange(function(wallet) {
            if (wallet) {
                isWalletConnected = true;
                walletAddress = wallet.account.address;
                console.log('💰 Wallet connected:', walletAddress);
                updateWalletUI(true, walletAddress);
                if (document.getElementById('depositModal').classList.contains('show')) {
                    updateDepositModalUI();
                }
            } else {
                isWalletConnected = false;
                walletAddress = null;
                updateWalletUI(false);
                if (document.getElementById('depositModal').classList.contains('show')) {
                    updateDepositModalUI();
                }
            }
        });
        
        console.log('✅ TonConnect initialized successfully');
        
    } catch (error) {
        console.error('❌ createTonConnectInstance error:', error);
    }
}

function updateWalletUI(connected, address) {
    var container = document.getElementById('ton-connect-container');
    if (!container) return;
    
    if (connected && address) {
        container.style.display = 'none';
        container.innerHTML = '';
    } else {
        container.innerHTML = 
            '<button class="ton-connect-btn" id="tonConnectBtn" style="' +
                'width: 100%;' +
                'padding: 14px;' +
                'background: #0ceb0f;' +
                'color: #000000;' +
                'border: none;' +
                'border-radius: 12px;' +
                'font-size: 16px;' +
                'font-weight: 600;' +
                'cursor: pointer;' +
                'transition: all 0.3s ease;' +
                'display: flex;' +
                'align-items: center;' +
                'justify-content: center;' +
                'gap: 8px;' +
            '">' +
                '🔗 Connect wallet' +
            '</button>' +
            '<p style="font-size: 12px; color: rgba(255,255,255,0.35); margin-top: 8px; text-align: center;">' +
                'Подключите кошелек для пополнения в TON' +
            '</p>';
        container.style.display = 'block';
        
        var btn = document.getElementById('tonConnectBtn');
        if (btn) {
            btn.onclick = function() {
                try {
                    if (!tonConnectUI) {
                        tg.showAlert('❌ TON кошелек не загружен. Обновите страницу.');
                        return;
                    }
                    tonConnectUI.openModal();
                } catch (error) {
                    console.error('Connection error:', error);
                    tg.showAlert('❌ Ошибка подключения кошелька');
                }
            };
        }
    }
}

// ============================================================
// МОДАЛЬНОЕ ОКНО ДЕПОЗИТА
// ============================================================

function openDepositModal() {
    depositState.step = 'input';
    depositState.error = null;
    depositState.amount = 0;
    depositState.currency = 'ton';
    depositState.isProcessing = false;
    
    var modal = document.getElementById('depositModal');
    if (modal) {
        modal.classList.add('show');
        updateDepositModalUI();
    }
}

function closeDepositModal() {
    var modal = document.getElementById('depositModal');
    if (modal) {
        modal.classList.remove('show');
    }
    depositState.step = 'input';
    depositState.error = null;
    depositState.isProcessing = false;
}

function updateDepositModalUI() {
    var modal = document.getElementById('depositModal');
    if (!modal) return;
    
    var titleEl = document.getElementById('depositModalTitle');
    var bodyEl = document.getElementById('depositModalBody');
    var footerEl = document.getElementById('depositModalFooter');
    var tonContainer = document.getElementById('ton-connect-container');
    
    if (!titleEl || !bodyEl || !footerEl) return;
    
    if (tonConnectUI) {
        isWalletConnected = !!tonConnectUI.wallet;
        depositState.isWalletConnected = isWalletConnected;
        if (isWalletConnected && tonConnectUI.wallet) {
            walletAddress = tonConnectUI.wallet.account.address;
        }
    }
    
    if (depositState.step === 'input') {
        titleEl.textContent = 'Пополнение баланса';
        
        if (tonContainer) {
            if (depositState.currency === 'ton') {
                if (!isWalletConnected) {
                    updateWalletUI(false);
                } else {
                    updateWalletUI(true, walletAddress);
                }
            } else {
                tonContainer.style.display = 'none';
            }
        }
        
        bodyEl.innerHTML = 
            '<div class="deposit-currency-toggle">' +
                '<button class="deposit-currency-btn ' + (depositState.currency === 'ton' ? 'active' : '') + '" data-currency="ton">' +
                    '<img src="assets/ton.png" alt="TON" class="deposit-currency-icon"> TON' +
                '</button>' +
                '<button class="deposit-currency-btn ' + (depositState.currency === 'stars' ? 'active' : '') + '" data-currency="stars">' +
                    '<img src="assets/stars.png" alt="Stars" class="deposit-currency-icon"> Stars' +
                '</button>' +
            '</div>' +
            '<div class="deposit-balance-info">Ваш баланс: ' + (depositState.currency === 'ton' ? 
                (state.user ? state.user.ton_balance.toFixed(1) : '0.0') + ' TON' : 
                (state.user ? Math.floor(state.user.stars_balance) : '0') + ' Stars') + 
            '</div>' +
            '<input type="number" class="deposit-input" id="depositAmountInput" placeholder="Введите сумму в ' + (depositState.currency === 'ton' ? 'TON' : 'Stars') + '" min="0">' +
            (depositState.error ? '<div class="deposit-error">' + depositState.error + '</div>' : '');
        
        footerEl.innerHTML = 
            '<button class="deposit-button" id="depositConfirmBtn">' +
                (depositState.currency === 'ton' ? '💰 Пополнить TON' : '⭐ Оплатить Stars') +
            '</button>' +
            '<button class="deposit-cancel-btn" id="depositCancelBtn">Отмена</button>';
        
        setTimeout(function() {
            document.querySelectorAll('.deposit-currency-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    depositState.currency = this.dataset.currency;
                    depositState.error = null;
                    updateDepositModalUI();
                });
            });
            
            var confirmBtn = document.getElementById('depositConfirmBtn');
            if (confirmBtn) {
                confirmBtn.addEventListener('click', handleDepositConfirm);
            }
            
            var cancelBtn = document.getElementById('depositCancelBtn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', closeDepositModal);
            }
            
            var amountInput = document.getElementById('depositAmountInput');
            if (amountInput) {
                amountInput.addEventListener('input', function() {
                    depositState.amount = parseFloat(this.value) || 0;
                });
            }
        }, 50);
        
    } else if (depositState.step === 'sending') {
        if (tonContainer) tonContainer.style.display = 'none';
        titleEl.textContent = depositState.currency === 'ton' ? 'Подтверждение в кошельке' : 'Оплата Stars...';
        bodyEl.innerHTML = 
            '<div class="deposit-sending">' +
                '<div class="deposit-spinner"></div>' +
                '<p>' + (depositState.currency === 'ton' 
                    ? 'Пожалуйста, подтвердите транзакцию в вашем TON кошельке...' 
                    : 'Открытие счета для оплаты Stars...') + 
                '</p>' +
            '</div>';
        footerEl.innerHTML = '';
        
    } else if (depositState.step === 'success') {
        if (tonContainer) tonContainer.style.display = 'none';
        titleEl.textContent = 'Успешно!';
        bodyEl.innerHTML = 
            '<div class="deposit-success">' +
                '<p>✅ Пополнено ' + depositState.amount + ' ' + (depositState.currency === 'ton' ? 'TON' : 'Stars') + '</p>' +
                '<p>Ваш баланс обновлен</p>' +
            '</div>';
        footerEl.innerHTML = 
            '<button class="deposit-close-btn" id="depositCloseBtn">Закрыть</button>';
        
        setTimeout(function() {
            var closeBtn = document.getElementById('depositCloseBtn');
            if (closeBtn) {
                closeBtn.addEventListener('click', closeDepositModal);
            }
        }, 50);
    }
}

// ============================================================
// ОБРАБОТЧИК ДЕПОЗИТА
// ============================================================

function toNano(amount) {
    return Math.floor(amount * 1000000000).toString();
}

async function handleDepositConfirm() {
    if (depositState.isProcessing) return;
    
    var amount = depositState.amount;
    var currency = depositState.currency;
    
    if (!amount || amount <= 0) {
        depositState.error = 'Пожалуйста, введите корректную сумму';
        updateDepositModalUI();
        return;
    }
    
    depositState.isProcessing = true;
    depositState.step = 'sending';
    depositState.error = null;
    updateDepositModalUI();
    
    try {
        if (currency === 'ton') {
            if (!tonConnectUI || !tonConnectUI.wallet) {
                depositState.error = 'Пожалуйста, подключите TON кошелек';
                depositState.step = 'input';
                depositState.isProcessing = false;
                updateDepositModalUI();
                return;
            }
            
            try {
                var transaction = {
                    validUntil: Math.floor(Date.now() / 1000) + 300,
                    messages: [
                        {
                            address: OWNER_WALLET,
                            amount: toNano(amount),
                        }
                    ]
                };
                
                await tonConnectUI.sendTransaction(transaction);
                
                // Добавляем через UserManager
                if (UserManager) {
                    var added = await UserManager.addTon(amount, '', 'Deposit from Main Menu');
                    if (added) {
                        var updatedUser = UserManager.getUser();
                        state.user = updatedUser;
                        updateBalanceUI(updatedUser);
                    }
                }
                
                depositState.step = 'success';
                depositState.isProcessing = false;
                updateDepositModalUI();
                
                tg.showAlert('✅ ' + amount + ' TON успешно пополнены!');
                
            } catch (txError) {
                console.error('Transaction error:', txError);
                if (txError.message && (txError.message.includes('cancelled') || txError.message.includes('rejected'))) {
                    depositState.error = 'Транзакция отменена';
                } else if (txError.message && txError.message.includes('insufficient')) {
                    depositState.error = 'Недостаточно средств на кошельке';
                } else {
                    depositState.error = 'Транзакция не удалась. Попробуйте снова.';
                }
                depositState.step = 'input';
                depositState.isProcessing = false;
                updateDepositModalUI();
                return;
            }
            
        } else if (currency === 'stars') {
            var starsAmount = Math.floor(amount);
            
            try {
                var response = await fetch('/api/create-invoice', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount: starsAmount })
                });
                
                var data = await response.json();
                
                if (!data.success || !data.invoiceLink) {
                    throw new Error(data.error || 'Не удалось создать счет');
                }
                
                tg.openInvoice(data.invoiceLink, function(status) {
                    depositState.isProcessing = false;
                    
                    if (status === 'paid') {
                        if (UserManager) {
                            UserManager.addStars(amount, 'Deposit from Main Menu').then(function(added) {
                                if (added) {
                                    var updatedUser = UserManager.getUser();
                                    state.user = updatedUser;
                                    updateBalanceUI(updatedUser);
                                }
                            });
                        }
                        
                        depositState.step = 'success';
                        updateDepositModalUI();
                        tg.showAlert('✅ ' + amount + ' Stars успешно пополнены!');
                        
                    } else if (status === 'cancelled') {
                        depositState.error = 'Оплата отменена';
                        depositState.step = 'input';
                        updateDepositModalUI();
                    } else {
                        depositState.error = 'Оплата не удалась. Попробуйте снова.';
                        depositState.step = 'input';
                        updateDepositModalUI();
                    }
                });
            } catch (err) {
                console.error('Stars invoice error:', err);
                depositState.error = 'Не удалось создать счет для оплаты';
                depositState.step = 'input';
                depositState.isProcessing = false;
                updateDepositModalUI();
            }
        }
    } catch (err) {
        console.error('Deposit error:', err);
        depositState.error = err.message || 'Транзакция не удалась';
        depositState.step = 'input';
        depositState.isProcessing = false;
        updateDepositModalUI();
    }
}

// ============================================================
// Initialize app
// ============================================================

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
    
    // Инициализируем TonConnect
    initTonConnect();
    
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

    // ИНИЦИАЛИЗИРУЕМ НАСТРОЙКИ (НОВОЕ)
    initSettings();
    
    // Закрытие модалки по клику на крестик
    var depositModalClose = document.getElementById('depositModalClose');
    if (depositModalClose) {
        depositModalClose.addEventListener('click', closeDepositModal);
    }
    
    // Закрытие модалки по клику на оверлей
    var depositModal = document.getElementById('depositModal');
    if (depositModal) {
        depositModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeDepositModal();
            }
        });
    }
    
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
        var user = await UserManager.loadUser();
        
        if (user) {
            console.log('✅ User loaded:', user);
            state.user = user;
            state.userId = user.user_id;
            
            updateUserUI(user);
            updateBalanceUI(user);
        } else {
            console.warn('⚠️ No user loaded, using fallback');
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
            state.user = user;
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
    
    if (userAvatar) {
        if (user.photo_url) {
            userAvatar.src = user.photo_url;
        } else {
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
    
    if (userNameElement) {
        userNameElement.textContent = '@' + (user.username || 'user');
    }
    
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

    // Депозит - открывает модалку
    var depositBtn = document.getElementById('depositBtn');
    if (depositBtn) {
        depositBtn.addEventListener('click', function() {
            openDepositModal();
        });
    }

    // Закрытие
    tg.onEvent('backButtonClicked', function() {
        tg.close();
    });
}

// ============================================================
// ВКЛАДКА НАСТРОЙКИ - АДМИН-ПАНЕЛЬ
// ============================================================

var adminState = {
    selectedUser: null,
    searchResults: [],
    isProcessing: false
};

// Показать/скрыть админ-панель
function updateSettingsUI() {
    var settingsContent = document.getElementById('settingsContent');
    if (!settingsContent) return;

    var user = UserManager.getUser();
    var isAdmin = UserManager.isAdmin();

    // Обновляем ID пользователя
    var userIdEl = document.getElementById('settingsUserId');
    if (userIdEl && user) {
        userIdEl.textContent = user.user_id;
    }

    // Показываем/скрываем админ-панель
    var adminSection = document.getElementById('adminSection');
    if (adminSection) {
        if (isAdmin) {
            adminSection.style.display = 'block';
        } else {
            adminSection.style.display = 'none';
        }
    }
}

// Поиск пользователей
async function searchUsers() {
    var input = document.getElementById('adminSearchInput');
    var results = document.getElementById('adminResults');
    var query = input.value.trim();

    if (!query || query.length < 1) {
        results.innerHTML = '<div class="admin-no-results">Введите ID или имя для поиска</div>';
        return;
    }

    results.innerHTML = '<div class="admin-no-results">🔍 Поиск...</div>';

    try {
        var users = await UserManager.searchUsers(query);
        adminState.searchResults = users;

        if (users.length === 0) {
            results.innerHTML = '<div class="admin-no-results">👤 Пользователь не найден</div>';
            return;
        }

        results.innerHTML = users.map(function(user) {
            var name = user.first_name || user.username || 'User';
            var avatar = user.photo_url || 'assets/avatar.png';
            var balance = user.ton_balance || 0;
            var stars = user.stars_balance || 0;
            var isCurrent = user.user_id === UserManager.getUser()?.user_id;

            return '<div class="admin-user-result" data-userid="' + user.user_id + '">' +
                '<div class="admin-user-result-info">' +
                    '<img src="' + avatar + '" alt="' + name + '" class="admin-result-avatar" onerror="this.src=\'assets/avatar.png\'">' +
                    '<div>' +
                        '<div class="admin-result-name">' + name + (isCurrent ? ' (Вы)' : '') + '</div>' +
                        '<div class="admin-result-id">ID: ' + user.user_id + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="admin-result-balance">' + balance.toFixed(2) + ' TON | ' + Math.floor(stars) + ' Stars</div>' +
                '<button class="admin-result-select" data-userid="' + user.user_id + '">Выбрать</button>' +
            '</div>';
        }).join('');

        // Обработчики кликов
        document.querySelectorAll('.admin-result-select').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var userId = this.dataset.userid;
                var user = adminState.searchResults.find(function(u) { return u.user_id === userId; });
                if (user) {
                    selectUser(user);
                }
            });
        });

        document.querySelectorAll('.admin-user-result').forEach(function(el) {
            el.addEventListener('click', function() {
                var userId = this.dataset.userid;
                var user = adminState.searchResults.find(function(u) { return u.user_id === userId; });
                if (user) {
                    selectUser(user);
                }
            });
        });

    } catch (error) {
        console.error('Search error:', error);
        results.innerHTML = '<div class="admin-no-results">❌ Ошибка поиска</div>';
    }
}

// Выбор пользователя
function selectUser(user) {
    adminState.selectedUser = user;

    var form = document.getElementById('adminDepositForm');
    var avatar = document.getElementById('adminUserAvatar');
    var name = document.getElementById('adminUserName');
    var id = document.getElementById('adminUserId');
    var balance = document.getElementById('adminUserBalance');

    if (avatar) avatar.src = user.photo_url || 'assets/avatar.png';
    if (name) name.textContent = user.first_name || user.username || 'User';
    if (id) id.textContent = 'ID: ' + user.user_id;
    if (balance) {
        var ton = user.ton_balance || 0;
        var stars = user.stars_balance || 0;
        balance.textContent = 'Баланс: ' + ton.toFixed(2) + ' TON | ' + Math.floor(stars) + ' Stars';
    }

    form.style.display = 'block';

    // Очищаем сообщение
    var msg = document.getElementById('adminMessage');
    if (msg) {
        msg.className = 'admin-message';
        msg.style.display = 'none';
        msg.textContent = '';
    }

    // Скрываем результаты поиска
    var results = document.getElementById('adminResults');
    if (results) {
        results.innerHTML = '<div class="admin-no-results">✅ Пользователь выбран</div>';
    }

    document.getElementById('adminAmountInput').focus();
}

// Пополнение баланса (админ)
async function adminAddBalance() {
    if (adminState.isProcessing) return;
    if (!adminState.selectedUser) {
        showAdminMessage('Сначала выберите пользователя', 'error');
        return;
    }

    var amountInput = document.getElementById('adminAmountInput');
    var amount = parseFloat(amountInput.value);

    if (!amount || amount <= 0) {
        showAdminMessage('Введите корректную сумму', 'error');
        return;
    }

    var currencyBtn = document.querySelector('.admin-currency-btn.active');
    var currency = currencyBtn ? currencyBtn.dataset.currency : 'ton';

    adminState.isProcessing = true;
    showAdminMessage('⏳ Пополнение...', 'loading');

    try {
        var result = await UserManager.adminAddBalance(
            adminState.selectedUser.user_id,
            amount,
            currency,
            'Admin deposit from panel'
        );

        if (result.success) {
            showAdminMessage(
                '✅ Пополнено ' + amount + ' ' + (currency === 'ton' ? 'TON' : 'Stars') + 
                ' пользователю ' + (adminState.selectedUser.first_name || adminState.selectedUser.username || 'User'),
                'success'
            );

            // Обновляем баланс в UI
            var balanceEl = document.getElementById('adminUserBalance');
            if (balanceEl && adminState.selectedUser) {
                adminState.selectedUser.ton_balance = result.newBalance || adminState.selectedUser.ton_balance;
                adminState.selectedUser.stars_balance = result.newBalance || adminState.selectedUser.stars_balance;
                var ton = adminState.selectedUser.ton_balance || 0;
                var stars = adminState.selectedUser.stars_balance || 0;
                balanceEl.textContent = 'Баланс: ' + ton.toFixed(2) + ' TON | ' + Math.floor(stars) + ' Stars';
            }

            amountInput.value = '';
            adminState.selectedUser = null;
            document.getElementById('adminDepositForm').style.display = 'none';
            document.getElementById('adminResults').innerHTML = '<div class="admin-no-results">✅ Операция выполнена успешно</div>';

            // Обновляем список пользователей
            setTimeout(function() {
                document.getElementById('adminResults').innerHTML = '<div class="admin-no-results">Введите ID или имя для поиска</div>';
            }, 3000);

        } else {
            showAdminMessage('❌ ' + (result.error || 'Ошибка пополнения'), 'error');
        }

    } catch (error) {
        console.error('Admin add balance error:', error);
        showAdminMessage('❌ Ошибка: ' + (error.message || 'Неизвестная ошибка'), 'error');
    }

    adminState.isProcessing = false;
}

function showAdminMessage(text, type) {
    var msg = document.getElementById('adminMessage');
    if (!msg) return;
    msg.textContent = text;
    msg.className = 'admin-message ' + type;
    msg.style.display = 'block';
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ НАСТРОЕК
// ============================================================

function initSettings() {
    updateSettingsUI();

    // Подписываемся на изменения пользователя
    UserManager.subscribe(function(user) {
        updateSettingsUI();
    });

    // Поиск
    var searchBtn = document.getElementById('adminSearchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', searchUsers);
    }

    var searchInput = document.getElementById('adminSearchInput');
    if (searchInput) {
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                searchUsers();
            }
        });
    }

    // Переключатель валют
    document.querySelectorAll('.admin-currency-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.admin-currency-btn').forEach(function(b) {
                b.classList.remove('active');
            });
            this.classList.add('active');
        });
    });

    // Кнопка пополнения
    var addBtn = document.getElementById('adminAddBtn');
    if (addBtn) {
        addBtn.addEventListener('click', adminAddBalance);
    }

    // Enter на поле суммы
    var amountInput = document.getElementById('adminAmountInput');
    if (amountInput) {
        amountInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                adminAddBalance();
            }
        });
    }

    // Обновляем при переключении на вкладку настроек
    var settingsTab = document.querySelector('.nav-item[data-page="settings"]');
    if (settingsTab) {
        settingsTab.addEventListener('click', function() {
            setTimeout(updateSettingsUI, 100);
        });
    }
}

// Экспорт
window.betsApp = {
    state: state,
    showTab: showTab,
    goToSlide: goToSlide,
    nextSlide: nextSlide,
    initializeUser: initializeUser,
    UserManager: UserManager,
    openDepositModal: openDepositModal,
    closeDepositModal: closeDepositModal,
    tonConnectUI: tonConnectUI
};

console.log('✅ App initialized');