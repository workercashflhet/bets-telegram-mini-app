// ============================================================
// PvP КОЛЕСО - ПОЛНАЯ ЛОГИКА С SUPABASE И TON CONNECT
// ============================================================

var tg = window.Telegram.WebApp;

// ============================================================
// ПОДКЛЮЧЕНИЕ USERMANAGER И СИНХРОНИЗАЦИЯ
// ============================================================

var UserManager = window.UserManager;

function getUserData() {
    if (UserManager && UserManager.getUser()) {
        return UserManager.getUser();
    }
    return null;
}

// Подписываемся на изменения из UserManager
if (UserManager) {
    UserManager.subscribe(function(user) {
        console.log('🔄 PvP: Balance updated from UserManager');
        gameState.balance.ton = user.ton_balance || 0;
        gameState.balance.stars = user.stars_balance || 0;
        updatePvPBalanceUI();
    });
}

// ============================================================
// TON CONNECT - ИНИЦИАЛИЗАЦИЯ
// ============================================================

var MANIFEST_URL = 'https://bets-telegram-mini-app.vercel.app/tonconnect-manifest.json';

var tonConnectUI = null;
var isWalletConnected = false;
var walletAddress = null;

// Инициализация TonConnect
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
                showTonConnectError();
            };
            document.head.appendChild(script);
            return;
        }
        createTonConnectInstance();
    } catch (error) {
        console.error('❌ initTonConnect error:', error);
        showTonConnectError();
    }
}

function createTonConnectInstance() {
    try {
        var TonConnectUI = window.TON_CONNECT_UI.TonConnectUI;
        
        fetch(MANIFEST_URL)
            .then(function(response) {
                if (!response.ok) {
                    console.warn('⚠️ Manifest status:', response.status);
                }
                return response.json();
            })
            .then(function(data) {
                console.log('✅ Manifest loaded:', data);
            })
            .catch(function(err) {
                console.warn('⚠️ Manifest check error:', err.message);
            });
        
        tonConnectUI = new TonConnectUI({
            manifestUrl: MANIFEST_URL,
            actionsConfiguration: {
                twaReturnUrl: 'https://t.me/betsgambles_bot/betsgambles'
            },
            uiPreferences: {
                theme: 'DARK'
            }
        });
        
        ensureTonConnectZIndex();
        
        tonConnectUI.onStatusChange(function(wallet) {
            console.log('💰 Status change:', wallet ? 'connected' : 'disconnected');
            if (wallet) {
                isWalletConnected = true;
                walletAddress = wallet.account.address;
                console.log('💰 Wallet address:', walletAddress);
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
        showTonConnectError();
    }
}

function ensureTonConnectZIndex() {
    var style = document.getElementById('tc-z-index-style');
    if (!style) {
        style = document.createElement('style');
        style.id = 'tc-z-index-style';
        style.textContent = `
            .tc-root {
                z-index: 99999 !important;
                position: relative !important;
            }
            .tc-wallets-modal,
            .tc-modal-overlay,
            .tc-actions-modal,
            .ton-connect-modal,
            .ton-connect-modal-overlay,
            [data-tc-modal="true"],
            [data-tc-wallets-modal-container="true"],
            [data-tc-actions-modal-container="true"] {
                z-index: 99999 !important;
            }
            .deposit-modal {
                z-index: 1000 !important;
            }
            .deposit-modal.show {
                z-index: 1000 !important;
            }
            .winner-modal {
                z-index: 9000 !important;
            }
        `;
        document.head.appendChild(style);
        console.log('✅ TonConnect z-index style added');
    }
}

function showTonConnectError() {
    var container = document.getElementById('ton-connect-container');
    if (container) {
        container.innerHTML = 
            '<div style="color: #ff6b6b; padding: 12px; border: 1px solid rgba(255,107,107,0.2); border-radius: 8px; text-align: center;">' +
                '⚠️ Не удалось загрузить TON кошелек<br>' +
                '<button onclick="location.reload()" style="' +
                    'margin-top: 8px;' +
                    'padding: 6px 16px;' +
                    'background: #0ceb0f;' +
                    'color: #000;' +
                    'border: none;' +
                    'border-radius: 6px;' +
                    'cursor: pointer;' +
                '">Обновить</button>' +
            '</div>';
        container.style.display = 'block';
    }
}

function updateWalletUI(connected, address) {
    var container = document.getElementById('ton-connect-container');
    if (!container) return;
    
    ensureTonConnectZIndex();
    
    if (connected && address) {
        container.style.display = 'none';
        container.innerHTML = '';
        console.log('✅ Wallet connected, container hidden');
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
                    console.log('🔗 Opening TonConnect modal...');
                    tonConnectUI.openModal().catch(function(err) {
                        console.error('Open modal error:', err);
                        if (tonConnectUI.open) {
                            tonConnectUI.open();
                        }
                    });
                } catch (error) {
                    console.error('Connection error:', error);
                    tg.showAlert('❌ Ошибка подключения кошелька');
                }
            };
        }
    }
}

// ============================================================
// SUPABASE КОНФИГУРАЦИЯ (для pvp_rounds)
// ============================================================
var SUPABASE_URL = 'https://siibxynvgrrsktyihuby.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpaWJ4eW52Z3Jyc2t0eWlodWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MDE0MzUsImV4cCI6MjEwMTI3NzQzNX0.k8bdNQPeB8lDkw_1XKVtFB-u3NjyHmyr2L7zE4mhN6I';

var supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    global: {
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY
        }
    }
});

// ============================================================
// СОСТОЯНИЕ ИГРЫ
// ============================================================
var gameState = {
    players: [],
    totalPoolTon: 0,
    totalPoolStars: 0,
    betAmount: 1,
    selectedCurrency: 'ton',
    balance: { ton: 0.00, stars: 0 },
    playerBets: [],
    roundPhase: 'waiting',
    timeLeft: 20,
    timer: null,
    isSpinning: false,
    rotationAngle: 0,
    winner: null,
    roundId: 0,
    spinTimer: null,
    history: [],
    topGame: null,
    currentRoundId: null
};

var TON_TO_STARS_RATE = 76;
var MIN_PLAYERS = 2;
var MIN_BET_TON = 0.1;
var MIN_BET_STARS = 10;
var ROUND_DURATION = 20;
var SPIN_DURATION = 5000;

var OWNER_WALLET = 'UQC5ZUl4Qobq69CgLi7tg-8y6aOwVilc5b82jJFZShtnetrw';

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    tg.expand();
    tg.ready();
    tg.setBackgroundColor('#121216');
    tg.setHeaderColor('#121216');
    
    tg.BackButton.show();
    tg.BackButton.onClick(function() {
        window.location.href = 'index.html';
    });
    
    initTonConnect();
    
    // Загружаем баланс с ожиданием UserManager
    loadBalance();
    
    loadHistoryFromDB();
    initializePvPUser();
    setupUI();
    addDemoPlayers();
    startWaitingPhase();
    updateUI();
    
    document.addEventListener('click', function(e) {
        var input = document.getElementById('betInput');
        if (input && e.target !== input) {
            input.blur();
        }
    });
});

// ============================================================
// БАЛАНС - СИНХРОНИЗАЦИЯ С USERMANAGER
// ============================================================

function loadBalance() {
    var user = getUserData();
    
    if (user) {
        gameState.balance.ton = user.ton_balance || 0;
        gameState.balance.stars = user.stars_balance || 0;
        console.log('💰 Balance loaded from UserManager:', gameState.balance.ton, gameState.balance.stars);
        updatePvPBalanceUI();
        return;
    }
    
    console.warn('⚠️ UserManager not ready, waiting for sync...');
    
    // Ждем загрузку UserManager с повторными попытками
    var attempts = 0;
    var maxAttempts = 30;
    
    var checkInterval = setInterval(function() {
        attempts++;
        var retryUser = getUserData();
        
        if (retryUser) {
            clearInterval(checkInterval);
            gameState.balance.ton = retryUser.ton_balance || 0;
            gameState.balance.stars = retryUser.stars_balance || 0;
            updatePvPBalanceUI();
            console.log('💰 Balance loaded from UserManager (retry after', attempts, 'attempts):', gameState.balance.ton, gameState.balance.stars);
        } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            console.warn('⚠️ Could not load from UserManager after', maxAttempts, 'attempts, using localStorage');
            var saved = localStorage.getItem('bets_data');
            if (saved) {
                var data = JSON.parse(saved);
                gameState.balance.ton = data.balance || 0;
                gameState.balance.stars = data.inventory || 0;
                updatePvPBalanceUI();
                console.log('💰 Balance loaded from localStorage:', gameState.balance.ton, gameState.balance.stars);
            }
        }
    }, 300);
}

function updatePvPBalanceUI() {
    var tonEl = document.getElementById('pvpTonBalance');
    var starsEl = document.getElementById('pvpStarsBalance');
    if (tonEl) tonEl.textContent = gameState.balance.ton.toFixed(2);
    if (starsEl) starsEl.textContent = Math.floor(gameState.balance.stars);
    console.log('📊 PvP Balance UI updated:', gameState.balance.ton, gameState.balance.stars);
}

// Обновление баланса из UserManager (вызывается из app.js)
function updateBalanceFromDB(user) {
    if (!user) user = getUserData();
    if (!user) return;
    
    gameState.balance.ton = user.ton_balance || 0;
    gameState.balance.stars = user.stars_balance || 0;
    updatePvPBalanceUI();
    console.log('🔄 PvP balance updated from DB:', gameState.balance.ton, gameState.balance.stars);
}

// ============================================================
// ИСТОРИЯ - РАБОТА С БД (SUPABASE)
// ============================================================

async function loadHistoryFromDB() {
    try {
        var { data: lastRound, error: roundError } = await supabaseClient
            .from('pvp_rounds')
            .select('round_number')
            .order('round_number', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        if (roundError) {
            console.warn('Round error (using default):', roundError.message);
        }
        
        if (lastRound) {
            gameState.roundId = lastRound.round_number;
        } else {
            gameState.roundId = 0;
        }
        
        var { data: historyData, error: historyError } = await supabaseClient
            .from('pvp_rounds')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (historyError) {
            console.warn('History error (using default):', historyError.message);
        }
        
        if (historyData) {
            gameState.history = historyData.map(function(round) {
                return {
                    roundId: round.round_number,
                    winner: round.winner_name,
                    prize: round.prize,
                    multiplier: round.multiplier,
                    players: round.players_count,
                    timestamp: new Date(round.created_at).getTime()
                };
            });
        }
        
        var { data: topData, error: topError } = await supabaseClient
            .from('pvp_rounds')
            .select('winner_name, prize, round_number')
            .order('prize', { ascending: false })
            .limit(1)
            .maybeSingle();
        
        if (topError) {
            console.warn('Top game error (using default):', topError.message);
        }
        
        if (topData) {
            gameState.topGame = {
                winner: topData.winner_name,
                prize: topData.prize,
                roundId: topData.round_number
            };
        }
        
        updateRoundDisplay();
        updateTopGameDisplay();
        updateHeaderInfo();
        
    } catch (error) {
        console.warn('loadHistoryFromDB error (using defaults):', error.message);
        gameState.roundId = 0;
        gameState.history = [];
        gameState.topGame = null;
        updateRoundDisplay();
        updateTopGameDisplay();
        updateHeaderInfo();
    }
}

async function saveRoundToDB(roundId, winnerName, prize, multiplier, playersCount, playerDetails) {
    try {
        var { data, error } = await supabaseClient
            .from('pvp_rounds')
            .insert({
                round_number: roundId,
                winner_name: winnerName,
                prize: prize,
                multiplier: multiplier,
                players_count: playersCount,
                player_details: playerDetails,
                created_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (error) {
            console.error('Error saving round to DB:', error);
            return null;
        }
        return data;
    } catch (error) {
        console.error('Error in saveRoundToDB:', error);
        return null;
    }
}

// ============================================================
// ПОЛЬЗОВАТЕЛЬ
// ============================================================

function initializePvPUser() {
    var user = tg.initDataUnsafe?.user;
    
    var userNameDisplay = document.getElementById('pvpUserNameDisplay');
    var userAvatar = document.getElementById('pvpUserAvatar');
    
    if (user) {
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
                var avatarUrl = 'https://t.me/i/userpic/320/' + user.id + '.jpg';
                userAvatar.src = avatarUrl;
                userAvatar.onerror = function() {
                    this.style.display = 'none';
                    var fallbackText = document.createElement('span');
                    fallbackText.className = 'user-avatar-fallback';
                    var firstLetter = (user.first_name || user.username || 'U')[0].toUpperCase();
                    fallbackText.textContent = firstLetter;
                    this.parentNode.insertBefore(fallbackText, this);
                    this.style.display = 'none';
                };
            }
        }
        
        loadPlayerStats(user.id);
    } else {
        if (userNameDisplay) {
            userNameDisplay.textContent = 'Demo User';
        }
    }
}

// ============================================================
// НАСТРОЙКА UI
// ============================================================

function setupUI() {
    document.getElementById('historyBtn').addEventListener('click', function() {
        showHistoryModal();
    });
    
    document.getElementById('chatBtn').addEventListener('click', function() {
        tg.showAlert('💬 Чат пока не доступен');
    });
    
    document.getElementById('pvpDepositBtn').addEventListener('click', function() {
        openDepositModal();
    });
    
    document.getElementById('betDec').addEventListener('click', function() {
        var step = gameState.selectedCurrency === 'ton' ? 0.1 : 25;
        var min = gameState.selectedCurrency === 'ton' ? MIN_BET_TON : MIN_BET_STARS;
        var newAmount = gameState.betAmount - step;
        if (newAmount < min) newAmount = min;
        gameState.betAmount = parseFloat(newAmount.toFixed(2));
        updateBetUI();
        updatePlaceBetButton();
        updateQuickBetButtons();
    });
    
    document.getElementById('betInc').addEventListener('click', function() {
        var step = gameState.selectedCurrency === 'ton' ? 0.1 : 25;
        var max = gameState.selectedCurrency === 'ton' ? gameState.balance.ton : gameState.balance.stars;
        var newAmount = gameState.betAmount + step;
        if (newAmount > max) newAmount = max;
        gameState.betAmount = parseFloat(newAmount.toFixed(2));
        updateBetUI();
        updatePlaceBetButton();
        updateQuickBetButtons();
    });
    
    var betInput = document.getElementById('betInput');
    betInput.addEventListener('input', function(e) {
        var value = this.value.replace(/[^0-9.]/g, '');
        
        var parts = value.split('.');
        if (parts.length > 2) {
            value = parts[0] + '.' + parts.slice(1).join('');
        }
        
        if (value !== '' && value !== '.') {
            this.value = value;
            var val = parseFloat(value);
            if (!isNaN(val) && val >= 0) {
                var max = gameState.selectedCurrency === 'ton' ? gameState.balance.ton : gameState.balance.stars;
                var min = gameState.selectedCurrency === 'ton' ? MIN_BET_TON : MIN_BET_STARS;
                gameState.betAmount = Math.min(max, Math.max(min, val));
                updatePlaceBetButton();
                updateQuickBetButtons();
            }
        } else if (value === '.') {
            this.value = '0.';
            gameState.betAmount = 0;
        } else {
            var min = gameState.selectedCurrency === 'ton' ? MIN_BET_TON : MIN_BET_STARS;
            gameState.betAmount = min;
            this.value = min;
            updatePlaceBetButton();
            updateQuickBetButtons();
        }
    });
    
    betInput.addEventListener('blur', function() {
        var min = gameState.selectedCurrency === 'ton' ? MIN_BET_TON : MIN_BET_STARS;
        if (this.value === '' || this.value === '.' || parseFloat(this.value) < min) {
            this.value = min;
            gameState.betAmount = min;
            updateBetUI();
            updatePlaceBetButton();
            updateQuickBetButtons();
        } else if (this.value.endsWith('.')) {
            this.value = this.value.slice(0, -1);
            gameState.betAmount = parseFloat(this.value) || min;
            updateBetUI();
            updatePlaceBetButton();
            updateQuickBetButtons();
        }
    });
    
    document.getElementById('placeBetBtn').addEventListener('click', placeBet);
    
    document.getElementById('winnerModalBtn').addEventListener('click', function() {
        document.getElementById('winnerModal').classList.remove('show');
        startNewRound();
    });
    
    var newRoundBtn = document.getElementById('newRoundBtn');
    if (newRoundBtn) {
        newRoundBtn.addEventListener('click', function() {
            document.getElementById('winnerSection').style.display = 'none';
            startNewRound();
        });
    }
    
    document.querySelectorAll('.currency-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.currency-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            gameState.selectedCurrency = btn.dataset.currency;
            updateBetUI();
            updatePlaceBetButton();
            updateQuickBetButtons();
        });
    });
    
    setupQuickBets();
    
    var depositModalClose = document.getElementById('depositModalClose');
    if (depositModalClose) {
        depositModalClose.addEventListener('click', closeDepositModal);
    }
    
    var depositModal = document.getElementById('depositModal');
    if (depositModal) {
        depositModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeDepositModal();
            }
        });
    }
}

// ============================================================
// ИСТОРИЯ - МОДАЛЬНОЕ ОКНО
// ============================================================

function showHistoryModal() {
    if (gameState.history.length === 0) {
        tg.showAlert('📊 История игр пуста');
        return;
    }
    
    var recentGames = gameState.history.slice(0, 10);
    var message = '📊 ПОСЛЕДНИЕ ИГРЫ\n\n';
    
    recentGames.forEach(function(game) {
        var date = new Date(game.timestamp);
        var timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        message += '#' + game.roundId + ' | ' + game.winner + ' +' + game.prize.toFixed(2) + ' TON | ×' + game.multiplier.toFixed(1) + ' | ' + timeStr + '\n';
    });
    
    if (gameState.topGame) {
        message += '\n🏆 ТОП ИГРА: #' + gameState.topGame.roundId + ' | ' + gameState.topGame.winner + ' +' + gameState.topGame.prize.toFixed(2) + ' TON';
    }
    
    tg.showAlert(message);
}

// ============================================================
// UI ОБНОВЛЕНИЯ
// ============================================================

function updateBetUI() {
    var input = document.getElementById('betInput');
    if (!input) return;
    
    var display;
    if (gameState.selectedCurrency === 'ton') {
        display = Math.round(gameState.betAmount * 10) / 10;
        display = display.toFixed(1);
    } else {
        display = Math.floor(gameState.betAmount);
    }
    input.value = display;
    
    updateQuickBetIcons();
    updateQuickBetButtons();
}

function updatePlaceBetButton() {
    var btn = document.getElementById('placeBetBtn');
    if (!btn) return;
    
    var user = getUserData();
    var max = gameState.selectedCurrency === 'ton' ? 
        (user ? user.ton_balance : gameState.balance.ton) : 
        (user ? user.stars_balance : gameState.balance.stars);
    var min = gameState.selectedCurrency === 'ton' ? MIN_BET_TON : MIN_BET_STARS;
    btn.disabled = gameState.betAmount > max || gameState.betAmount < min || gameState.isSpinning || gameState.roundPhase === 'finished';
}

function updateHub(type, data) {
    var hubContent = document.getElementById('hubContent');
    var timerEl = document.querySelector('.hub-timer');
    var statusEl = document.querySelector('.hub-status');
    
    if (type === 'timer') {
        if (timerEl) {
            var activePlayers = getActivePlayers().length;
            if (activePlayers > 1 && gameState.roundPhase !== 'waiting') {
                timerEl.textContent = data;
                timerEl.classList.remove('hidden');
                if (data <= 5) {
                    timerEl.classList.add('warning');
                } else {
                    timerEl.classList.remove('warning');
                }
            } else {
                timerEl.classList.add('hidden');
            }
        }
    } else if (type === 'status') {
        if (statusEl) statusEl.textContent = data;
    } else if (type === 'avatar') {
        if (hubContent) {
            hubContent.innerHTML = '<img src="' + getAvatarUrl(data) + '" alt="' + data.firstName + '" class="hub-avatar"><div class="hub-player-name">' + data.firstName + '</div>';
        }
    }
}

function updateUI() {
    var totalInTon = gameState.totalPoolTon + (gameState.totalPoolStars / TON_TO_STARS_RATE);
    var poolEl = document.getElementById('poolTotal');
    if (poolEl) {
        poolEl.innerHTML = totalInTon.toFixed(2) + ' <img src="assets/ton.png" alt="TON" class="pool-icon">';
    }
    
    var activePlayers = getActivePlayers();
    var playersCountEl = document.getElementById('playersCount');
    if (playersCountEl) playersCountEl.textContent = activePlayers.length;
    
    updateRoundDisplay();
    
    var list = document.getElementById('playersListCompact');
    if (list) {
        if (activePlayers.length === 0) {
            list.innerHTML = '<div class="no-players-compact">Нет игроков</div>';
        } else {
            list.innerHTML = activePlayers.map(function(player) {
                var isWinner = gameState.winner && gameState.winner.userId === player.userId;
                var betText = formatPlayerBets(player);
                var share = calculateWinChance(player);
                
                return '<div class="player-row ' + (isWinner ? 'winner-row' : '') + '">' +
                    '<div class="player-row-color" style="background-color: ' + player.color + '"></div>' +
                    '<img src="' + getAvatarUrl(player) + '" alt="' + player.firstName + '" class="player-row-avatar">' +
                    '<span class="player-row-name">' + player.firstName + (isWinner ? ' 👑' : '') + '</span>' +
                    '<span class="player-row-bet">' + betText + '</span>' +
                    '<span class="player-row-share">' + share + '</span>' +
                    '</div>';
            }).join('');
        }
    }
    
    updateHeaderInfo();
    updateTopGameDisplay();
}

function updateHeaderInfo() {
    var prevGameText = document.getElementById('prevGameText');
    if (prevGameText) {
        if (gameState.history.length > 0) {
            var last = gameState.history[0];
            prevGameText.textContent = last.winner + ' +' + last.prize.toFixed(2);
            prevGameText.className = 'info-value win';
        } else {
            prevGameText.textContent = '—';
            prevGameText.className = 'info-value';
        }
    }
}

function updateTimerUI() {
    var timerText = document.getElementById('hubTimer');
    if (timerText) {
        timerText.textContent = gameState.timeLeft;
        if (gameState.timeLeft <= 5) {
            timerText.classList.add('warning');
        } else {
            timerText.classList.remove('warning');
        }
    }
}

function updateRoundDisplay() {
    var roundEl = document.getElementById('roundNumber');
    if (roundEl) {
        roundEl.textContent = '#' + gameState.roundId;
    }
}

function updateTopGameDisplay() {
    var topGameEl = document.getElementById('topGameText');
    if (topGameEl && gameState.topGame) {
        topGameEl.textContent = gameState.topGame.winner + ' +' + gameState.topGame.prize.toFixed(2);
        topGameEl.className = 'info-value win';
    } else if (topGameEl) {
        topGameEl.textContent = '—';
        topGameEl.className = 'info-value';
    }
}

// ============================================================
// РЕЖИМ ОЖИДАНИЯ - ВРАЩЕНИЕ КОЛЕСА
// ============================================================

function startWaitingSpin() {
    var wheel = document.getElementById('wheel');
    if (!wheel) return;
    
    wheel.classList.add('waiting-pattern');
    wheel.classList.add('waiting-spin');
    wheel.style.transition = 'none';
}

function stopWaitingSpin() {
    var wheel = document.getElementById('wheel');
    if (!wheel) return;
    
    wheel.classList.remove('waiting-pattern');
    wheel.classList.remove('waiting-spin');
    wheel.style.transition = 'transform 5s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
}

// ============================================================
// БЫСТРЫЕ СТАВКИ
// ============================================================

function setupQuickBets() {
    var quickBtns = document.querySelectorAll('.quick-bet-btn');
    quickBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var amount = parseFloat(this.dataset.amount);
            if (isNaN(amount) || amount <= 0) return;
            
            var user = getUserData();
            var max = gameState.selectedCurrency === 'ton' ? 
                (user ? user.ton_balance : gameState.balance.ton) : 
                (user ? user.stars_balance : gameState.balance.stars);
            var min = gameState.selectedCurrency === 'ton' ? MIN_BET_TON : MIN_BET_STARS;
            
            var finalAmount = amount;
            if (finalAmount > max) finalAmount = max;
            if (finalAmount < min) finalAmount = min;
            
            gameState.betAmount = parseFloat(finalAmount.toFixed(2));
            updateBetUI();
            updatePlaceBetButton();
            updateQuickBetButtons();
        });
    });
    
    updateQuickBetIcons();
}

function updateQuickBetIcons() {
    var quickBtns = document.querySelectorAll('.quick-bet-btn');
    var isTon = gameState.selectedCurrency === 'ton';
    var iconSrc = isTon ? 'assets/ton.png' : 'assets/stars.png';
    var iconAlt = isTon ? 'TON' : 'Stars';
    
    quickBtns.forEach(function(btn, index) {
        var oldIcon = btn.querySelector('.quick-bet-icon');
        if (oldIcon) oldIcon.remove();
        
        var icon = document.createElement('img');
        icon.className = 'quick-bet-icon';
        icon.src = iconSrc;
        icon.alt = iconAlt;
        
        btn.prepend(icon);
        
        var values = isTon ? [0.1, 0.5, 1.0] : [25, 50, 100];
        btn.dataset.amount = values[index] || values[0];
        
        btn.childNodes.forEach(function(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                node.textContent = values[index] || values[0];
            }
        });
    });
}

function updateQuickBetButtons() {
    var quickBtns = document.querySelectorAll('.quick-bet-btn');
    var tolerance = gameState.selectedCurrency === 'ton' ? 0.01 : 0.5;
    
    quickBtns.forEach(function(btn) {
        var amount = parseFloat(btn.dataset.amount);
        var isActive = Math.abs(gameState.betAmount - amount) < tolerance;
        btn.classList.toggle('active', isActive);
    });
}

// ============================================================
// ТОН КОННЕКТ - УТИЛИТЫ
// ============================================================

function toNano(amount) {
    return Math.floor(amount * 1000000000).toString();
}

function fromNano(nano) {
    return Number(nano) / 1000000000;
}

// ============================================================
// ДЕПОЗИТЫ - С ИНТЕГРАЦИЕЙ USERMANAGER
// ============================================================

var depositState = {
    amount: 0,
    currency: 'ton',
    step: 'input',
    error: null,
    isWalletConnected: false,
    isProcessing: false,
    tonConnectInitialized: false
};

// ============================================================
// ФУНКЦИЯ ДЛЯ ОБНОВЛЕНИЯ UI ДЕПОЗИТА
// ============================================================

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
        
        var user = UserManager.getUser();
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
                (user ? user.ton_balance.toFixed(1) : '0.0') + ' TON' : 
                (user ? Math.floor(user.stars_balance) : '0') + ' Stars') + 
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
// ОБРАБОТЧИК ПОДТВЕРЖДЕНИЯ ДЕПОЗИТА С USERMANAGER
// ============================================================

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
                
                if (UserManager) {
                    var added = await UserManager.addTon(amount, '', 'Deposit from PvP');
                    if (added) {
                        var updatedUser = UserManager.getUser();
                        gameState.balance.ton = updatedUser.ton_balance;
                        updatePvPBalanceUI();
                        if (window.betsApp && window.betsApp.refreshBalance) {
                            window.betsApp.refreshBalance();
                        }
                        console.log('✅ TON balance updated to:', updatedUser.ton_balance);
                    }
                }
                
                depositState.step = 'success';
                depositState.isProcessing = false;
                updateDepositModalUI();
                
                var tonEl = document.getElementById('pvpTonBalance');
                if (tonEl) tonEl.textContent = gameState.balance.ton.toFixed(2);
                
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
                            UserManager.addStars(amount, 'Deposit from PvP').then(function(added) {
                                if (added) {
                                    var updatedUser = UserManager.getUser();
                                    gameState.balance.stars = updatedUser.stars_balance;
                                    updatePvPBalanceUI();
                                    if (window.betsApp && window.betsApp.refreshBalance) {
                                        window.betsApp.refreshBalance();
                                    }
                                    console.log('✅ Stars balance updated to:', updatedUser.stars_balance);
                                }
                            });
                        }
                        
                        depositState.step = 'success';
                        updateDepositModalUI();
                        
                        var starsEl = document.getElementById('pvpStarsBalance');
                        if (starsEl) starsEl.textContent = Math.floor(gameState.balance.stars);
                        
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
// ОТКРЫТИЕ / ЗАКРЫТИЕ МОДАЛЬНОГО ОКНА
// ============================================================

function openDepositModal() {
    depositState.step = 'input';
    depositState.error = null;
    depositState.amount = 0;
    depositState.currency = gameState.selectedCurrency || 'ton';
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

// ============================================================
// ИГРОВАЯ ЛОГИКА
// ============================================================

function getActivePlayers() {
    return gameState.players.filter(function(p) { return p.bets && p.bets.length > 0; });
}

function addDemoPlayers() {
    var user = tg.initDataUnsafe?.user;
    
    var demoPlayers = [
        {
            userId: user?.id || 1,
            firstName: user?.first_name || 'Вы',
            username: user?.username || 'you',
            avatar: user?.photo_url || '',
            color: '#0ceb0f',
            bets: []
        },
        {
            userId: 2,
            firstName: 'Алексей',
            username: 'alex_win',
            avatar: '',
            color: '#ff6b6b',
            bets: []
        },
        {
            userId: 3,
            firstName: 'Мария',
            username: 'maria_luck',
            avatar: '',
            color: '#4ecdc4',
            bets: []
        }
    ];
    
    gameState.players = demoPlayers;
}

// ============================================================
// ФАЗЫ ИГРЫ
// ============================================================

function startWaitingPhase() {
    gameState.roundPhase = 'waiting';
    gameState.timeLeft = ROUND_DURATION;
    gameState.isSpinning = false;
    
    if (gameState.timer) clearInterval(gameState.timer);
    
    startWaitingSpin();
    
    updateHub('timer', ROUND_DURATION);
    updateHub('status', 'Ожидание');
    
    var placeBtn = document.getElementById('placeBetBtn');
    if (placeBtn) placeBtn.disabled = false;
    
    var winnerModal = document.getElementById('winnerModal');
    if (winnerModal) winnerModal.classList.remove('show');
    
    var winnerSection = document.getElementById('winnerSection');
    if (winnerSection) winnerSection.style.display = 'none';
    
    var spinningStatus = document.getElementById('spinningStatus');
    if (spinningStatus) spinningStatus.style.display = 'none';
    
    var betSection = document.getElementById('betSection');
    if (betSection) betSection.style.display = 'block';
    
    updateUI();
    updateBetUI();
    updateTimerUI();
    updatePlaceBetButton();
}

function startCountdown() {
    var activePlayers = getActivePlayers();
    if (activePlayers.length < MIN_PLAYERS) {
        startWaitingPhase();
        return;
    }
    
    stopWaitingSpin();
    
    gameState.roundPhase = 'countdown';
    gameState.timeLeft = ROUND_DURATION;
    
    if (gameState.timer) clearInterval(gameState.timer);
    
    updateHub('timer', ROUND_DURATION);
    updateHub('status', 'До вращения');
    
    var placeBtn = document.getElementById('placeBetBtn');
    if (placeBtn) placeBtn.disabled = false;
    
    gameState.timer = setInterval(function() {
        gameState.timeLeft--;
        updateTimerUI();
        updateHub('timer', gameState.timeLeft);
        
        if (gameState.timeLeft <= 0) {
            clearInterval(gameState.timer);
            startSpin();
        }
    }, 1000);
    
    updateUI();
}

// ============================================================
// СТАВКА - С ИНТЕГРАЦИЕЙ USERMANAGER
// ============================================================

async function placeBet() {
    var user = tg.initDataUnsafe?.user;
    if (!user) {
        tg.showAlert('❌ Откройте приложение через Telegram');
        return;
    }
    
    if (gameState.roundPhase === 'finished') {
        tg.showAlert('⏳ Раунд завершен! Начните новый раунд.');
        return;
    }
    
    if (gameState.isSpinning) {
        tg.showAlert('⏳ Колесо крутится!');
        return;
    }
    
    var currency = gameState.selectedCurrency;
    var amount = gameState.betAmount;
    
    var currentUser = getUserData();
    var max = 0;
    if (currentUser) {
        max = currency === 'ton' ? currentUser.ton_balance : currentUser.stars_balance;
        gameState.balance.ton = currentUser.ton_balance || 0;
        gameState.balance.stars = currentUser.stars_balance || 0;
        updatePvPBalanceUI();
    } else {
        max = currency === 'ton' ? gameState.balance.ton : gameState.balance.stars;
    }
    
    var min = currency === 'ton' ? MIN_BET_TON : MIN_BET_STARS;
    
    if (amount > max) {
        tg.showAlert('❌ Недостаточно средств! Баланс: ' + max + ' ' + (currency === 'ton' ? 'TON' : 'Stars'));
        return;
    }
    
    if (amount < min) {
        tg.showAlert('❌ Минимальная ставка: ' + min + ' ' + (currency === 'ton' ? 'TON' : 'Stars'));
        return;
    }
    
    if (UserManager) {
        var success;
        if (currency === 'ton') {
            success = await UserManager.subtractTon(amount, 'Bet in PvP');
        } else {
            success = await UserManager.subtractStars(amount, 'Bet in PvP');
        }
        
        if (!success) {
            tg.showAlert('❌ Не удалось списать средства');
            return;
        }
        
        var updatedUser = UserManager.getUser();
        gameState.balance.ton = updatedUser.ton_balance;
        gameState.balance.stars = updatedUser.stars_balance;
        updatePvPBalanceUI();
        
        if (window.betsApp && window.betsApp.refreshBalance) {
            window.betsApp.refreshBalance();
        }
        
    } else {
        if (currency === 'ton') {
            if (gameState.balance.ton < amount) {
                tg.showAlert('❌ Недостаточно средств!');
                return;
            }
            gameState.balance.ton -= amount;
        } else {
            if (gameState.balance.stars < amount) {
                tg.showAlert('❌ Недостаточно средств!');
                return;
            }
            gameState.balance.stars -= amount;
        }
        localStorage.setItem('bets_data', JSON.stringify({
            balance: gameState.balance.ton,
            inventory: gameState.balance.stars
        }));
        updatePvPBalanceUI();
    }
    
    var player = gameState.players.find(function(p) { return p.userId === user.id; });
    if (!player) {
        player = {
            userId: user.id,
            firstName: user.first_name || 'Игрок',
            username: user.username || 'user',
            avatar: user.photo_url || '',
            color: getRandomColor(),
            bets: []
        };
        gameState.players.push(player);
    }
    
    player.bets.push({ amount: amount, currency: currency });
    gameState.playerBets.push({ amount: amount, currency: currency });
    
    if (currency === 'ton') {
        gameState.totalPoolTon += amount;
    } else {
        gameState.totalPoolStars += amount;
    }
    
    var activePlayers = getActivePlayers();
    if (activePlayers.length >= MIN_PLAYERS && (gameState.roundPhase === 'waiting' || gameState.roundPhase === 'countdown')) {
        startCountdown();
    }
    
    updateUI();
    updateBetUI();
    updateTimerUI();
    updatePlaceBetButton();
    
    tg.showAlert('✅ Ставка ' + amount + ' ' + (currency === 'ton' ? 'TON' : 'Stars') + ' принята!');
}

// ============================================================
// ВРАЩЕНИЕ КОЛЕСА
// ============================================================

function startSpin() {
    var activePlayers = getActivePlayers();
    if (activePlayers.length < MIN_PLAYERS) {
        tg.showAlert('❌ Недостаточно игроков! Нужно минимум ' + MIN_PLAYERS + '.');
        startWaitingPhase();
        return;
    }
    
    gameState.roundPhase = 'spinning';
    gameState.isSpinning = true;
    gameState.roundId++;
    updateRoundDisplay();
    
    var placeBtn = document.getElementById('placeBetBtn');
    if (placeBtn) placeBtn.disabled = true;
    
    var betSection = document.getElementById('betSection');
    if (betSection) betSection.style.display = 'none';
    
    var spinningStatus = document.getElementById('spinningStatus');
    if (spinningStatus) spinningStatus.style.display = 'block';
    
    updateHub('status', 'ИГРА');
    
    createWheelSegments();
    
    var winner = selectWinner();
    gameState.winner = winner;
    
    var spins = 5 + Math.random() * 5;
    var targetAngle = 360 * spins + (Math.random() * 360);
    gameState.rotationAngle += targetAngle;
    
    var wheel = document.getElementById('wheel');
    if (wheel) {
        wheel.style.transform = 'rotate(' + gameState.rotationAngle + 'deg)';
        wheel.classList.add('spinning');
    }
    
    updateHub('avatar', winner);
    
    gameState.spinTimer = setTimeout(function() {
        if (wheel) wheel.classList.remove('spinning');
        gameState.isSpinning = false;
        gameState.roundPhase = 'finished';
        
        if (spinningStatus) spinningStatus.style.display = 'none';
        
        showWinner(winner);
        updateUI();
        updatePlaceBetButton();
    }, SPIN_DURATION);
}

// ============================================================
// КОЛЕСО - СЕГМЕНТЫ
// ============================================================

function createWheelSegments() {
    var wheel = document.getElementById('wheel');
    var activePlayers = getActivePlayers();
    
    if (!wheel) return;
    
    if (activePlayers.length === 0) {
        wheel.innerHTML = '<div style="width:100%;height:100%;border-radius:50%;background:#1a1a2e;"></div>';
        return;
    }
    
    var totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
    var startAngle = 0;
    var segmentsHTML = '';
    
    activePlayers.forEach(function(player) {
        var playerValue = (player.bets.filter(function(b) { return b.currency === 'ton'; }).reduce(function(s, b) { return s + b.amount; }, 0) * TON_TO_STARS_RATE) +
                          player.bets.filter(function(b) { return b.currency === 'stars'; }).reduce(function(s, b) { return s + b.amount; }, 0);
        var angle = totalValue > 0 ? (playerValue / totalValue) * 360 : 360 / activePlayers.length;
        var midAngle = startAngle + angle / 2;
        
        segmentsHTML += '<div class="wheel-avatar-container" style="transform: rotate(' + midAngle + 'deg);">' +
            '<div class="avatar-position">' +
            '<img src="' + getAvatarUrl(player) + '" alt="' + player.firstName + '" class="wheel-player-avatar">' +
            '</div></div>';
        
        startAngle += angle;
    });
    
    var gradientColors = activePlayers.map(function(player, index) {
        var playerValue = (player.bets.filter(function(b) { return b.currency === 'ton'; }).reduce(function(s, b) { return s + b.amount; }, 0) * TON_TO_STARS_RATE) +
                          player.bets.filter(function(b) { return b.currency === 'stars'; }).reduce(function(s, b) { return s + b.amount; }, 0);
        var angle = totalValue > 0 ? (playerValue / totalValue) * 360 : 360 / activePlayers.length;
        var startPercent = (index / activePlayers.length) * 100;
        var endPercent = ((index + 1) / activePlayers.length) * 100;
        return player.color + ' ' + startPercent + '% ' + endPercent + '%';
    });
    
    var gradient = 'conic-gradient(from 0deg, ' + gradientColors.join(', ') + ')';
    
    wheel.innerHTML = '<div style="width:100%;height:100%;border-radius:50%;background:' + gradient + ';position:relative;">' +
        segmentsHTML +
        '</div>';
}

// ============================================================
// ПОБЕДИТЕЛЬ - С ИНТЕГРАЦИЕЙ USERMANAGER
// ============================================================

function selectWinner() {
    var activePlayers = getActivePlayers();
    var totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
    
    if (totalValue === 0) {
        return activePlayers[Math.floor(Math.random() * activePlayers.length)];
    }
    
    var random = Math.random() * totalValue;
    var cumulative = 0;
    
    for (var i = 0; i < activePlayers.length; i++) {
        var player = activePlayers[i];
        var playerValue = (player.bets.filter(function(b) { return b.currency === 'ton'; }).reduce(function(s, b) { return s + b.amount; }, 0) * TON_TO_STARS_RATE) +
                          player.bets.filter(function(b) { return b.currency === 'stars'; }).reduce(function(s, b) { return s + b.amount; }, 0);
        cumulative += playerValue;
        if (random <= cumulative) {
            return player;
        }
    }
    
    return activePlayers[0];
}

async function showWinner(winner) {
    var modal = document.getElementById('winnerModal');
    if (!modal) return;
    
    var totalInTon = gameState.totalPoolTon + (gameState.totalPoolStars / TON_TO_STARS_RATE);
    var playerValue = (winner.bets.filter(function(b) { return b.currency === 'ton'; }).reduce(function(s, b) { return s + b.amount; }, 0) * TON_TO_STARS_RATE) +
                       winner.bets.filter(function(b) { return b.currency === 'stars'; }).reduce(function(s, b) { return s + b.amount; }, 0);
    var totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
    var multiplier = totalValue > 0 && playerValue > 0 ? totalValue / playerValue : 0;
    
    var nameEl = document.getElementById('winnerModalName');
    var roundEl = document.getElementById('winnerModalRound');
    var prizeEl = document.getElementById('winnerModalPrize');
    var multiEl = document.getElementById('winnerModalMultiplier');
    
    if (nameEl) nameEl.textContent = winner.firstName;
    if (roundEl) roundEl.textContent = '#' + String(gameState.roundId).padStart(4, '0');
    if (prizeEl) prizeEl.innerHTML = totalInTon.toFixed(2) + ' <img src="assets/ton.png" alt="TON" class="winner-modal-icon-small">';
    if (multiEl) multiEl.textContent = '×' + multiplier.toFixed(1);
    
    var playerDetails = getActivePlayers().map(function(p) {
        return {
            name: p.firstName,
            bets: p.bets,
            share: calculateWinChance(p)
        };
    });
    
    var savedRound = await saveRoundToDB(
        gameState.roundId,
        winner.firstName,
        totalInTon,
        multiplier,
        getActivePlayers().length,
        playerDetails
    );
    
    if (savedRound) {
        gameState.history.unshift({
            roundId: gameState.roundId,
            winner: winner.firstName,
            prize: totalInTon,
            multiplier: multiplier,
            players: getActivePlayers().length,
            timestamp: Date.now()
        });
        
        if (!gameState.topGame || totalInTon > gameState.topGame.prize) {
            gameState.topGame = {
                winner: winner.firstName,
                prize: totalInTon,
                roundId: gameState.roundId
            };
        }
        
        var user = tg.initDataUnsafe?.user;
        if (user && winner.userId === user.id && totalInTon > 0) {
            if (UserManager) {
                var added = await UserManager.addWin(totalInTon, 'ton', 'Win in PvP Round #' + gameState.roundId);
                if (added) {
                    var updatedUser = UserManager.getUser();
                    gameState.balance.ton = updatedUser.ton_balance;
                    updatePvPBalanceUI();
                    console.log('🏆 Win added:', totalInTon, 'TON');
                    
                    if (window.betsApp && window.betsApp.refreshBalance) {
                        window.betsApp.refreshBalance();
                    }
                }
            } else {
                gameState.balance.ton += totalInTon;
                localStorage.setItem('bets_data', JSON.stringify({
                    balance: gameState.balance.ton,
                    inventory: gameState.balance.stars
                }));
                updatePvPBalanceUI();
            }
        }
        
        if (user) {
            var stats = await loadPlayerStats(user.id);
            var totalBets = (stats?.total_bets || 0) + gameState.playerBets.length;
            var totalWins = (stats?.total_wins || 0) + (winner.userId === user.id ? 1 : 0);
            var totalPrize = (stats?.total_prize || 0) + (winner.userId === user.id ? totalInTon : 0);
            
            await updatePlayerStats(
                user.id,
                user.username || '',
                user.first_name || '',
                totalBets,
                totalWins,
                totalPrize
            );
        }
        
        updateTopGameDisplay();
        updateHeaderInfo();
    }
    
    modal.classList.add('show');
}

// ============================================================
// СТАТИСТИКА ИГРОКОВ
// ============================================================

async function updatePlayerStats(userId, username, firstName, totalBets, totalWins, totalPrize) {
    try {
        var { data: existing, error: checkError } = await supabaseClient
            .from('pvp_players')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle();
        
        if (checkError) {
            console.warn('updatePlayerStats check error:', checkError.message);
            return;
        }
        
        if (existing) {
            var { error: updateError } = await supabaseClient
                .from('pvp_players')
                .update({
                    username: username,
                    first_name: firstName,
                    total_bets: totalBets,
                    total_wins: totalWins,
                    total_prize: totalPrize,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', userId);
            
            if (updateError) {
                console.warn('updatePlayerStats update error:', updateError.message);
            }
        } else {
            var { error: insertError } = await supabaseClient
                .from('pvp_players')
                .insert({
                    user_id: userId,
                    username: username,
                    first_name: firstName,
                    total_bets: totalBets,
                    total_wins: totalWins,
                    total_prize: totalPrize,
                    created_at: new Date().toISOString()
                });
            
            if (insertError) {
                console.warn('updatePlayerStats insert error:', insertError.message);
            }
        }
    } catch (error) {
        console.warn('updatePlayerStats error:', error.message);
    }
}

async function loadPlayerStats(userId) {
    try {
        var { data, error } = await supabaseClient
            .from('pvp_players')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();
        
        if (error) {
            console.warn('loadPlayerStats error:', error.message);
            return null;
        }
        return data;
    } catch (error) {
        console.warn('loadPlayerStats error:', error.message);
        return null;
    }
}

// ============================================================
// НОВЫЙ РАУНД
// ============================================================

function startNewRound() {
    if (gameState.timer) clearInterval(gameState.timer);
    if (gameState.spinTimer) clearTimeout(gameState.spinTimer);
    
    gameState.players.forEach(function(p) { p.bets = []; });
    gameState.playerBets = [];
    gameState.totalPoolTon = 0;
    gameState.totalPoolStars = 0;
    gameState.winner = null;
    gameState.isSpinning = false;
    
    var hubContent = document.getElementById('hubContent');
    if (hubContent) {
        hubContent.innerHTML = '<div class="hub-timer" id="hubTimer">20</div><div class="hub-status" id="hubStatus">Ожидание</div>';
    }
    
    var winnerModal = document.getElementById('winnerModal');
    if (winnerModal) winnerModal.classList.remove('show');
    
    var winnerSection = document.getElementById('winnerSection');
    if (winnerSection) winnerSection.style.display = 'none';
    
    var spinningStatus = document.getElementById('spinningStatus');
    if (spinningStatus) spinningStatus.style.display = 'none';
    
    var betSection = document.getElementById('betSection');
    if (betSection) betSection.style.display = 'block';
    
    var placeBtn = document.getElementById('placeBetBtn');
    if (placeBtn) placeBtn.disabled = false;
    
    startWaitingPhase();
    updateUI();
    updateBetUI();
    updateTimerUI();
    updatePlaceBetButton();
    
    tg.showAlert('🔄 Новый раунд начался! Делайте ставки!');
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

function formatPlayerBets(player) {
    if (!player || !player.bets) return '0';
    var tonTotal = player.bets.filter(function(b) { return b.currency === 'ton'; }).reduce(function(s, b) { return s + b.amount; }, 0);
    var starsTotal = player.bets.filter(function(b) { return b.currency === 'stars'; }).reduce(function(s, b) { return s + b.amount; }, 0);
    var parts = [];
    if (tonTotal > 0) parts.push(tonTotal.toFixed(1) + ' TON');
    if (starsTotal > 0) parts.push(Math.floor(starsTotal) + ' Stars');
    return parts.join(' + ') || '0';
}

function calculateWinChance(player) {
    if (!player || !player.bets) return '0%';
    var tonBets = player.bets.filter(function(b) { return b.currency === 'ton'; }).reduce(function(s, b) { return s + b.amount; }, 0);
    var starsBets = player.bets.filter(function(b) { return b.currency === 'stars'; }).reduce(function(s, b) { return s + b.amount; }, 0);
    var playerValue = (tonBets * TON_TO_STARS_RATE) + starsBets;
    var totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
    if (totalValue === 0) return '0%';
    return ((playerValue / totalValue) * 100).toFixed(1) + '%';
}

function getAvatarUrl(player) {
    if (!player) return '';
    if (player.avatar) return player.avatar;
    return 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + player.userId;
}

function getRandomColor() {
    var colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#a29bfe', '#fd79a8', '#fdcb6e', '#e17055', '#00cec9'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// ============================================================
// ЭКСПОРТ
// ============================================================

window.pvpGame = {
    state: gameState,
    placeBet: placeBet,
    startNewRound: startNewRound,
    getActivePlayers: getActivePlayers,
    updateUI: updateUI,
    openDepositModal: openDepositModal,
    updateBalanceFromDB: updateBalanceFromDB
};

console.log('✅ PvP game loaded');