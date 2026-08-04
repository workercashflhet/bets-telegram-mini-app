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