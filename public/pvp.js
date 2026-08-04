// ============================================================
// PvP КОЛЕСО - ОПТИМИЗИРОВАННАЯ ВЕРСИЯ
// ============================================================

var tg = window.Telegram.WebApp;

// ============================================================
// ПОДКЛЮЧЕНИЕ USERMANAGER И PVP ROOM
// ============================================================

var UserManager = window.UserManager;
var PvPRoomManager = window.PvPRoomManager;

function getUserData() {
    if (UserManager && UserManager.getUser()) {
        return UserManager.getUser();
    }
    return null;
}

// Подписываемся на изменения из UserManager
if (UserManager) {
    UserManager.subscribe(function(user) {
        gameState.balance.ton = user.ton_balance || 0;
        gameState.balance.stars = user.stars_balance || 0;
        updatePvPBalanceUI();
        updatePvPUserUI();
    });
}

// ============================================================
// SUPABASE КОНФИГУРАЦИЯ
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
// КОНСТАНТЫ
// ============================================================
var ROUND_DURATION = 20;
var SPIN_DURATION = 5000;
var NEW_ROUND_DELAY = 5000;
var FORCE_RESET_TIMEOUT = 30000;
var TON_TO_STARS_RATE = 76;
var MIN_PLAYERS = 2;
var MIN_BET_TON = 0.1;
var MIN_BET_STARS = 10;
var OWNER_WALLET = 'UQC5ZUl4Qobq69CgLi7tg-8y6aOwVilc5b82jJFZShtnetrw';

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
    timeLeft: ROUND_DURATION,
    timer: null,
    isSpinning: false,
    rotationAngle: 0,
    winner: null,
    roundId: 0,
    spinTimer: null,
    newRoundTimer: null,
    history: [],
    topGame: null,
    currentRoundId: null,
    wheelSegments: [],
    isSyncing: false,
    isResultLoaded: false,
    _lastSync: 0
};

var forceResetTimer = null;
var isBetting = false;
var isSyncing = false;

// ============================================================
// TON CONNECT - ИНИЦИАЛИЗАЦИЯ (ОПТИМИЗИРОВАННАЯ)
// ============================================================

var MANIFEST_URL = 'https://bets-telegram-mini-app.vercel.app/tonconnect-manifest.json';
var tonConnectUI = null;
var isWalletConnected = false;
var walletAddress = null;
var _tonConnectInitialized = false;

function initTonConnect() {
    if (_tonConnectInitialized) return;
    _tonConnectInitialized = true;
    
    try {
        if (typeof window.TON_CONNECT_UI === 'undefined') {
            console.warn('⚠️ TonConnectUI not loaded, waiting...');
            var script = document.createElement('script');
            script.src = 'https://unpkg.com/@tonconnect/ui@2.0.0/dist/tonconnect-ui.min.js';
            script.async = true;
            script.onload = function() {
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
        
        ensureTonConnectZIndex();
        
        tonConnectUI.onStatusChange(function(wallet) {
            if (wallet) {
                isWalletConnected = true;
                walletAddress = wallet.account.address;
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
        
        console.log('✅ TonConnect initialized');
        
    } catch (error) {
        console.error('❌ createTonConnectInstance error:', error);
    }
}

function ensureTonConnectZIndex() {
    var style = document.getElementById('tc-z-index-style');
    if (!style) {
        style = document.createElement('style');
        style.id = 'tc-z-index-style';
        style.textContent = `
            .tc-root { z-index: 99999 !important; position: relative !important; }
            .tc-wallets-modal, .tc-modal-overlay, .tc-actions-modal,
            .ton-connect-modal, .ton-connect-modal-overlay,
            [data-tc-modal="true"], [data-tc-wallets-modal-container="true"],
            [data-tc-actions-modal-container="true"] { z-index: 99999 !important; }
            .deposit-modal { z-index: 1000 !important; }
            .deposit-modal.show { z-index: 1000 !important; }
            .winner-modal { z-index: 9000 !important; }
        `;
        document.head.appendChild(style);
    }
}

function updateWalletUI(connected, address) {
    var container = document.getElementById('ton-connect-container');
    if (!container) return;
    ensureTonConnectZIndex();
    
    if (connected && address) {
        container.style.display = 'none';
        container.innerHTML = '';
    } else {
        container.innerHTML = 
            '<button class="ton-connect-btn" id="tonConnectBtn" style="width:100%;padding:14px;background:#0ceb0f;color:#000000;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;transition:all 0.3s ease;display:flex;align-items:center;justify-content:center;gap:8px;">' +
                '🔗 Connect wallet' +
            '</button>' +
            '<p style="font-size:12px;color:rgba(255,255,255,0.35);margin-top:8px;text-align:center;">Подключите кошелек для пополнения в TON</p>';
        container.style.display = 'block';
        
        var btn = document.getElementById('tonConnectBtn');
        if (btn) {
            btn.onclick = function() {
                try {
                    if (!tonConnectUI) {
                        tg.showAlert('❌ TON кошелек не загружен. Обновите страницу.');
                        return;
                    }
                    tonConnectUI.openModal().catch(function(err) {
                        if (tonConnectUI.open) {
                            tonConnectUI.open();
                        }
                    });
                } catch (error) {
                    tg.showAlert('❌ Ошибка подключения кошелька');
                }
            };
        }
    }
}

function showTonConnectError() {
    var container = document.getElementById('ton-connect-container');
    if (container) {
        container.innerHTML = 
            '<div style="color: #ff6b6b; padding: 12px; border: 1px solid rgba(255,107,107,0.2); border-radius: 8px; text-align: center;">' +
                '⚠️ Не удалось загрузить TON кошелек<br>' +
                '<button onclick="location.reload()" style="margin-top:8px;padding:6px 16px;background:#0ceb0f;color:#000;border:none;border-radius:6px;cursor:pointer;">Обновить</button>' +
            '</div>';
        container.style.display = 'block';
    }
}

// ============================================================
// СИНХРОНИЗАЦИЯ СОСТОЯНИЯ С БД (ОПТИМИЗИРОВАННАЯ)
// ============================================================

async function syncRoomStateToDB() {
    try {
        var { error } = await supabaseClient
            .from('pvp_rooms')
            .update({
                phase: gameState.roundPhase,
                time_left: gameState.timeLeft,
                round_number: gameState.roundId,
                updated_at: new Date().toISOString()
            })
            .eq('room_id', 'pvp_main_room');
        
        if (error) {
            console.error('Sync state error:', error);
        }
    } catch (error) {
        console.error('Sync state error:', error);
    }
}

async function loadRoomStateFromDB() {
    try {
        var { data, error } = await supabaseClient
            .from('pvp_rooms')
            .select('*')
            .eq('room_id', 'pvp_main_room')
            .single();
        
        if (error) {
            console.error('Load state error:', error);
            return null;
        }
        return data;
    } catch (error) {
        console.error('Load state error:', error);
        return null;
    }
}

// ============================================================
// СЕРВЕРНЫЙ ВЫБОР ПОБЕДИТЕЛЯ
// ============================================================

async function selectWinnerOnServer() {
    try {
        var activePlayers = getActivePlayers();
        if (activePlayers.length === 0) {
            return null;
        }
        
        var totalValue = 0;
        var playerValues = activePlayers.map(function(player) {
            var value = calculatePlayerTotalValue(player);
            totalValue += value;
            return {
                player: player,
                value: value
            };
        });
        
        if (totalValue === 0) {
            return activePlayers[Math.floor(Math.random() * activePlayers.length)];
        }
        
        var random = Math.random() * totalValue;
        var cumulative = 0;
        
        for (var i = 0; i < playerValues.length; i++) {
            cumulative += playerValues[i].value;
            if (random <= cumulative) {
                return playerValues[i].player;
            }
        }
        
        return activePlayers[activePlayers.length - 1];
        
    } catch (error) {
        console.error('Select winner error:', error);
        return null;
    }
}

async function saveSpinResultToDB(winner, prize, roundId, players) {
    try {
        var { error } = await supabaseClient
            .from('pvp_rooms')
            .update({
                phase: 'finished',
                winner_id: winner.userId,
                winner_name: winner.firstName,
                prize_amount: prize,
                spin_result: {
                    winner: winner,
                    prize: prize,
                    roundId: roundId,
                    timestamp: new Date().toISOString()
                },
                round_players: players.map(function(p) {
                    return {
                        user_id: p.userId,
                        name: p.firstName,
                        bets: p.bets,
                        value: calculatePlayerTotalValue(p)
                    };
                })
            })
            .eq('room_id', 'pvp_main_room');
        
        if (error) {
            console.error('Save spin result error:', error);
            return false;
        }
        return true;
        
    } catch (error) {
        console.error('Save spin result error:', error);
        return false;
    }
}

async function loadSpinResultFromDB() {
    try {
        var { data, error } = await supabaseClient
            .from('pvp_rooms')
            .select('winner_id, winner_name, prize_amount, spin_result, phase, round_number')
            .eq('room_id', 'pvp_main_room')
            .single();
        
        if (error) {
            console.error('Load spin result error:', error);
            return null;
        }
        return data;
    } catch (error) {
        console.error('Load spin result error:', error);
        return null;
    }
}

// ============================================================
// ПРИНУДИТЕЛЬНЫЙ СБРОС
// ============================================================

function startForceResetTimer() {
    clearForceResetTimer();
    forceResetTimer = setTimeout(function() {
        console.log('⚠️ Force reset triggered!');
        forceResetRound();
    }, FORCE_RESET_TIMEOUT);
}

function clearForceResetTimer() {
    if (forceResetTimer) {
        clearTimeout(forceResetTimer);
        forceResetTimer = null;
    }
}

async function forceResetRound() {
    console.log('🔄 Force resetting round');
    
    if (gameState.timer) {
        clearInterval(gameState.timer);
        gameState.timer = null;
    }
    if (gameState.spinTimer) {
        clearTimeout(gameState.spinTimer);
        gameState.spinTimer = null;
    }
    if (gameState.newRoundTimer) {
        clearTimeout(gameState.newRoundTimer);
        gameState.newRoundTimer = null;
    }
    
    gameState.isSpinning = false;
    gameState.roundPhase = 'waiting';
    gameState.winner = null;
    gameState.timeLeft = ROUND_DURATION;
    gameState.rotationAngle = 0;
    gameState.isResultLoaded = false;
    
    var spinningStatus = document.getElementById('spinningStatus');
    if (spinningStatus) spinningStatus.style.display = 'none';
    var winnerSection = document.getElementById('winnerSection');
    if (winnerSection) winnerSection.style.display = 'none';
    var winnerModal = document.getElementById('winnerModal');
    if (winnerModal) winnerModal.classList.remove('show');
    var betSection = document.getElementById('betSection');
    if (betSection) betSection.style.display = 'block';
    var placeBtn = document.getElementById('placeBetBtn');
    if (placeBtn) placeBtn.disabled = false;
    
    var wheel = document.getElementById('wheel');
    if (wheel) {
        wheel.style.transform = 'rotate(0deg)';
        wheel.style.transition = 'none';
        wheel.classList.remove('spinning');
        wheel.classList.add('waiting-pattern');
        wheel.classList.add('waiting-spin');
    }
    
    var hubContent = document.getElementById('hubContent');
    if (hubContent) {
        hubContent.innerHTML = '<div class="hub-timer" id="hubTimer">' + ROUND_DURATION + '</div><div class="hub-status" id="hubStatus">Ожидание</div>';
    }
    
    await clearRoomPlayers();
    await syncRoomStateToDB();
    
    updateUI();
    updateBetUI();
    updateTimerUI();
    updatePlaceBetButton();
    updatePlayersList();
    updateRoomStatus();
    updateHubCurrentPlayer();
    
    clearForceResetTimer();
    
    if (tg) {
        tg.showAlert('🔄 Раунд принудительно сброшен! Делайте ставки.');
    }
    console.log('✅ Force reset complete');
}

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
    
    // Загружаем TonConnect асинхронно
    setTimeout(initTonConnect, 500);
    
    initializeUserInPvP();
    loadHistoryFromDB();
    setupUI();
    addDemoPlayers();
    
    loadRoomStateFromDB().then(function(state) {
        if (state) {
            gameState.roundPhase = state.phase || 'waiting';
            gameState.timeLeft = state.time_left || ROUND_DURATION;
            gameState.roundId = state.round_number || 0;
            
            if (state.phase === 'finished' && state.winner_id) {
                gameState.isResultLoaded = true;
                var winner = {
                    userId: state.winner_id,
                    firstName: state.winner_name || 'Winner'
                };
                gameState.winner = winner;
                gameState.roundPhase = 'finished';
                
                var totalInTon = state.prize_amount || 0;
                
                var winnerSection = document.getElementById('winnerSection');
                if (winnerSection) {
                    winnerSection.style.display = 'block';
                    document.getElementById('winnerName').textContent = winner.firstName;
                    document.getElementById('winnerPrize').innerHTML = totalInTon.toFixed(2) + ' <img src="assets/ton.png" alt="TON" class="winner-prize-icon">';
                }
                
                var modal = document.getElementById('winnerModal');
                if (modal) {
                    document.getElementById('winnerModalName').textContent = winner.firstName;
                    document.getElementById('winnerModalPrize').innerHTML = totalInTon.toFixed(2) + ' <img src="assets/ton.png" alt="TON" class="winner-modal-icon-small">';
                    modal.classList.add('show');
                }
                
                var betSection = document.getElementById('betSection');
                if (betSection) betSection.style.display = 'none';
                
                setTimeout(function() {
                    startNewRound();
                }, NEW_ROUND_DELAY);
                
            } else if (state.phase === 'spinning' && state.spin_result) {
                gameState.isResultLoaded = true;
                var winner = {
                    userId: state.spin_result.winner.userId,
                    firstName: state.spin_result.winner.firstName || 'Winner'
                };
                gameState.winner = winner;
                gameState.roundPhase = 'finished';
                
                var totalInTon = state.spin_result.prize || 0;
                
                var winnerSection = document.getElementById('winnerSection');
                if (winnerSection) {
                    winnerSection.style.display = 'block';
                    document.getElementById('winnerName').textContent = winner.firstName;
                    document.getElementById('winnerPrize').innerHTML = totalInTon.toFixed(2) + ' <img src="assets/ton.png" alt="TON" class="winner-prize-icon">';
                }
                
                var modal = document.getElementById('winnerModal');
                if (modal) {
                    document.getElementById('winnerModalName').textContent = winner.firstName;
                    document.getElementById('winnerModalPrize').innerHTML = totalInTon.toFixed(2) + ' <img src="assets/ton.png" alt="TON" class="winner-modal-icon-small">';
                    modal.classList.add('show');
                }
                
                var betSection = document.getElementById('betSection');
                if (betSection) betSection.style.display = 'none';
                
                setTimeout(function() {
                    startNewRound();
                }, NEW_ROUND_DELAY);
                
            } else if (state.phase === 'spinning') {
                gameState.isSpinning = true;
                gameState.roundPhase = 'spinning';
                document.getElementById('spinningStatus').style.display = 'block';
                document.getElementById('betSection').style.display = 'none';
                document.getElementById('placeBetBtn').disabled = true;
            } else if (state.phase === 'countdown' && state.time_left > 0) {
                startCountdownFrom(state.time_left);
            }
        }
        
        if (gameState.roundPhase === 'waiting' || !gameState.roundPhase) {
            startWaitingPhase();
        }
        
        updateUI();
    });
    
    document.addEventListener('click', function(e) {
        var input = document.getElementById('betInput');
        if (input && e.target !== input) {
            input.blur();
        }
    });
    
    var resetBtn = document.getElementById('forceResetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            var user = UserManager ? UserManager.getUser() : null;
            if (user && user.is_admin) {
                forceResetRound();
            } else {
                tg.showAlert('⛔ Только для администратора');
            }
        });
    }
    
    var user = UserManager ? UserManager.getUser() : null;
    var adminSection = document.getElementById('adminResetSection');
    if (adminSection && user && user.is_admin) {
        adminSection.style.display = 'block';
    }
});

// ============================================================
// ПОЛЬЗОВАТЕЛЬ
// ============================================================

async function initializeUserInPvP() {
    try {
        if (!UserManager) {
            console.error('❌ UserManager is undefined');
            return null;
        }
        
        var user = await UserManager.loadUser();
        if (user) {
            gameState.balance.ton = user.ton_balance || 0;
            gameState.balance.stars = user.stars_balance || 0;
            updatePvPBalanceUI();
            updatePvPUserUI();
            
            await initPvPRoom();
            
            setTimeout(function() {
                updateWheelImmediately();
            }, 300);
            
            return user;
        }
        return null;
    } catch (error) {
        console.error('❌ Error loading user in PvP:', error);
        return null;
    }
}

function updatePvPUserUI() {
    var user = getUserData();
    if (!user) return;
    
    var nameDisplay = document.getElementById('pvpUserNameDisplay');
    if (nameDisplay) {
        var firstName = user.first_name || '';
        var lastName = user.last_name || '';
        var username = user.username || '';
        
        if (firstName) {
            nameDisplay.textContent = firstName + (lastName ? ' ' + lastName : '');
        } else if (username) {
            nameDisplay.textContent = '@' + username;
        } else {
            nameDisplay.textContent = 'User';
        }
    }
    
    var avatar = document.getElementById('pvpUserAvatar');
    if (avatar) {
        var tgUser = UserManager.getTelegramUser();
        
        if (tgUser && tgUser.id) {
            var avatarUrl = 'https://t.me/i/userpic/320/' + tgUser.id + '.jpg';
            avatar.src = avatarUrl;
            avatar.onerror = function() {
                this.src = 'assets/avatar.png';
                this.onerror = null;
            };
            avatar.style.display = 'block';
            
            var fallback = document.querySelector('.user-avatar-fallback');
            if (fallback) {
                fallback.style.display = 'none';
            }
        } else if (user.photo_url) {
            avatar.src = user.photo_url;
            avatar.onerror = function() {
                this.src = 'assets/avatar.png';
                this.onerror = null;
            };
            avatar.style.display = 'block';
            
            var fallback = document.querySelector('.user-avatar-fallback');
            if (fallback) {
                fallback.style.display = 'none';
            }
        } else {
            avatar.style.display = 'none';
            var fallback = document.querySelector('.user-avatar-fallback');
            if (!fallback) {
                fallback = document.createElement('span');
                fallback.className = 'user-avatar-fallback';
                var letter = (user.first_name || user.username || 'U')[0].toUpperCase();
                fallback.textContent = letter;
                avatar.parentNode.insertBefore(fallback, avatar);
            } else {
                fallback.style.display = 'flex';
                var letter = (user.first_name || user.username || 'U')[0].toUpperCase();
                fallback.textContent = letter;
            }
        }
    }
}

// ============================================================
// PVP ROOM MANAGER - ИНТЕГРАЦИЯ
// ============================================================

async function initPvPRoom() {
    try {
        var user = UserManager.getUser();
        if (!user) {
            console.warn('⚠️ No user for room');
            return false;
        }
        
        await PvPRoomManager.initRoom();
        setupRealtimeHandlers();
        
        var players = PvPRoomManager.getPlayers();
        var pool = PvPRoomManager.getPool();
        
        gameState.players = players.map(function(p) {
            return {
                userId: p.user_id,
                firstName: p.first_name,
                username: p.username,
                avatar: p.photo_url,
                color: p.color,
                bets: p.bets || []
            };
        });
        
        gameState.totalPoolTon = pool.ton;
        gameState.totalPoolStars = pool.stars;
        
        updateUI();
        updatePlayersList();
        updateWheelImmediately();
        
        return true;
        
    } catch (error) {
        console.error('Init room error:', error);
        return false;
    }
}

function setupRealtimeHandlers() {
    if (!PvPRoomManager) return;
    
    if (window._pvpUnsubscribe) {
        window._pvpUnsubscribe();
    }
    
    window._pvpUnsubscribe = PvPRoomManager.subscribe(function(event, data) {
        switch(event) {
            case 'players_loaded':
            case 'players_updated':
                if (data && data.length !== undefined) {
                    updatePlayersFromRoom(data);
                } else {
                    syncRoomData();
                }
                updateWheelImmediately();
                break;
                
            case 'pool_updated':
                if (data) {
                    gameState.totalPoolTon = data.ton || 0;
                    gameState.totalPoolStars = data.stars || 0;
                }
                updateUI();
                updateWheelImmediately();
                break;
                
            case 'player_added':
            case 'player_updated':
                syncRoomData();
                updateWheelImmediately();
                break;
                
            case 'room_spinning':
                handleRoomSpin();
                break;
                
            case 'room_finished':
                handleRoomFinishedFromServer(data);
                break;
                
            case 'room_finished_modal':
                handleRoomFinishedFromServer({ ...data, showModal: true });
                break;
                
            case 'room_waiting':
                handleRoomWaiting();
                break;
        }
    });
}

function updatePlayersFromRoom(players) {
    if (!players) return;
    
    gameState.players = players.map(function(p) {
        return {
            userId: p.user_id,
            firstName: p.first_name,
            username: p.username,
            avatar: p.photo_url,
            color: p.color,
            bets: p.bets || []
        };
    });
    
    var pool = PvPRoomManager.getPool();
    gameState.totalPoolTon = pool.ton;
    gameState.totalPoolStars = pool.stars;
    
    updateUI();
    updatePlayersList();
    
    var activePlayers = getActivePlayers();
    if (activePlayers.length >= MIN_PLAYERS && gameState.roundPhase === 'waiting') {
        startCountdown();
    }
}

function updatePlayersList() {
    var list = document.getElementById('playersListCompact');
    if (!list) return;
    
    var activePlayers = getActivePlayers();
    if (activePlayers.length === 0) {
        list.innerHTML = '<div class="no-players-compact">Нет игроков в комнате</div>';
        return;
    }
    
    activePlayers.sort(function(a, b) {
        var aValue = calculatePlayerTotalValue(a);
        var bValue = calculatePlayerTotalValue(b);
        return bValue - aValue;
    });
    
    var totalValue = gameState.totalPoolTon * TON_TO_STARS_RATE + gameState.totalPoolStars;
    
    list.innerHTML = activePlayers.map(function(player) {
        var isWinner = gameState.winner && gameState.winner.userId === player.userId;
        var betText = formatPlayerBets(player);
        var share = totalValue > 0 ? ((calculatePlayerTotalValue(player) / totalValue) * 100).toFixed(1) + '%' : '0%';
        
        return '<div class="player-row ' + (isWinner ? 'winner-row' : '') + '">' +
            '<div class="player-row-color" style="background-color: ' + player.color + '"></div>' +
            '<img src="' + getAvatarUrl(player) + '" alt="' + player.firstName + '" class="player-row-avatar">' +
            '<span class="player-row-name">' + player.firstName + (isWinner ? ' 👑' : '') + '</span>' +
            '<span class="player-row-bet">' + betText + '</span>' +
            '<span class="player-row-share">' + share + '</span>' +
            '</div>';
    }).join('');
}

function calculatePlayerTotalValue(player) {
    if (!player || !player.bets) return 0;
    var value = 0;
    player.bets.forEach(function(bet) {
        if (bet.currency === 'ton') {
            value += bet.amount * TON_TO_STARS_RATE;
        } else {
            value += bet.amount;
        }
    });
    return value;
}

function updateRoomStatus() {
    var roomIdEl = document.getElementById('roomId');
    var playersCountEl = document.getElementById('roomPlayersCount');
    
    if (roomIdEl) {
        roomIdEl.textContent = PvPRoomManager.getRoomId() || '—';
    }
    
    if (playersCountEl) {
        var active = getActivePlayers();
        playersCountEl.textContent = active.length;
    }
}

function handleRoomSpin() {
    gameState.isSpinning = true;
    document.getElementById('spinningStatus').style.display = 'block';
    document.getElementById('betSection').style.display = 'none';
    document.getElementById('placeBetBtn').disabled = true;
}

async function handleRoomFinishedFromServer(data) {
    if (gameState.roundPhase === 'finished' && gameState.winner) {
        return;
    }
    
    if (data && data.winner_id) {
        var winner = {
            userId: data.winner_id,
            firstName: data.winner_name || 'Winner'
        };
        var totalInTon = data.prize || 0;
        
        gameState.winner = winner;
        gameState.isSpinning = false;
        gameState.roundPhase = 'finished';
        gameState.isResultLoaded = true;
        gameState.roundId = data.roundId || gameState.roundId;
        
        var wheel = document.getElementById('wheel');
        if (wheel) {
            wheel.classList.remove('spinning');
            wheel.style.transition = 'none';
        }
        
        var spinningStatus = document.getElementById('spinningStatus');
        if (spinningStatus) spinningStatus.style.display = 'none';
        
        var betSection = document.getElementById('betSection');
        if (betSection) betSection.style.display = 'none';
        
        var placeBtn = document.getElementById('placeBetBtn');
        if (placeBtn) placeBtn.disabled = true;
        
        var winnerSection = document.getElementById('winnerSection');
        if (winnerSection) {
            winnerSection.style.display = 'block';
            document.getElementById('winnerName').textContent = winner.firstName;
            document.getElementById('winnerPrize').innerHTML = totalInTon.toFixed(2) + ' <img src="assets/ton.png" alt="TON" class="winner-prize-icon">';
        }
        
        if (data.showModal !== false) {
            var modal = document.getElementById('winnerModal');
            if (modal) {
                var playerValue = calculatePlayerTotalValue(winner);
                var totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
                var multiplier = totalValue > 0 && playerValue > 0 ? totalValue / playerValue : 0;
                
                document.getElementById('winnerModalName').textContent = winner.firstName;
                document.getElementById('winnerModalRound').textContent = '#' + String(gameState.roundId).padStart(4, '0');
                document.getElementById('winnerModalPrize').innerHTML = totalInTon.toFixed(2) + ' <img src="assets/ton.png" alt="TON" class="winner-modal-icon-small">';
                document.getElementById('winnerModalMultiplier').textContent = '×' + multiplier.toFixed(1);
                modal.classList.add('show');
                
                setTimeout(function() {
                    modal.classList.remove('show');
                }, 3000);
            }
        }
        
        var user = tg.initDataUnsafe?.user;
        if (user && winner.userId === String(user.id) && totalInTon > 0) {
            if (UserManager) {
                var added = await UserManager.addWin(totalInTon, 'ton', 'Win in PvP Round #' + gameState.roundId);
                if (added) {
                    var updatedUser = UserManager.getUser();
                    gameState.balance.ton = updatedUser.ton_balance;
                    updatePvPBalanceUI();
                    if (window.betsApp && window.betsApp.refreshBalance) {
                        window.betsApp.refreshBalance();
                    }
                }
            }
        }
        
        updateUI();
        updatePlayersList();
        updateHubCurrentPlayer();
        
        if (gameState.newRoundTimer) {
            clearTimeout(gameState.newRoundTimer);
        }
        gameState.newRoundTimer = setTimeout(function() {
            startNewRound();
        }, NEW_ROUND_DELAY);
        return;
    }
    
    var result = await loadSpinResultFromDB();
    if (result && result.winner_id) {
        var winner = {
            userId: result.winner_id,
            firstName: result.winner_name || 'Winner'
        };
        var totalInTon = result.prize_amount || 0;
        
        gameState.winner = winner;
        gameState.isSpinning = false;
        gameState.roundPhase = 'finished';
        gameState.isResultLoaded = true;
        gameState.roundId = result.round_number || gameState.roundId;
        
        var wheel = document.getElementById('wheel');
        if (wheel) {
            wheel.classList.remove('spinning');
            wheel.style.transition = 'none';
        }
        
        var spinningStatus = document.getElementById('spinningStatus');
        if (spinningStatus) spinningStatus.style.display = 'none';
        
        var betSection = document.getElementById('betSection');
        if (betSection) betSection.style.display = 'none';
        
        var placeBtn = document.getElementById('placeBetBtn');
        if (placeBtn) placeBtn.disabled = true;
        
        var winnerSection = document.getElementById('winnerSection');
        if (winnerSection) {
            winnerSection.style.display = 'block';
            document.getElementById('winnerName').textContent = winner.firstName;
            document.getElementById('winnerPrize').innerHTML = totalInTon.toFixed(2) + ' <img src="assets/ton.png" alt="TON" class="winner-prize-icon">';
        }
        
        var modal = document.getElementById('winnerModal');
        if (modal) {
            var playerValue = calculatePlayerTotalValue(winner);
            var totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
            var multiplier = totalValue > 0 && playerValue > 0 ? totalValue / playerValue : 0;
            
            document.getElementById('winnerModalName').textContent = winner.firstName;
            document.getElementById('winnerModalRound').textContent = '#' + String(gameState.roundId).padStart(4, '0');
            document.getElementById('winnerModalPrize').innerHTML = totalInTon.toFixed(2) + ' <img src="assets/ton.png" alt="TON" class="winner-modal-icon-small">';
            document.getElementById('winnerModalMultiplier').textContent = '×' + multiplier.toFixed(1);
            modal.classList.add('show');
            
            setTimeout(function() {
                modal.classList.remove('show');
            }, 3000);
        }
        
        updateUI();
        updatePlayersList();
        updateHubCurrentPlayer();
        
        if (gameState.newRoundTimer) {
            clearTimeout(gameState.newRoundTimer);
        }
        gameState.newRoundTimer = setTimeout(function() {
            startNewRound();
        }, NEW_ROUND_DELAY);
    }
}

function handleRoomWaiting() {
    if (gameState.isResultLoaded) return;
    
    gameState.roundPhase = 'waiting';
    gameState.isSpinning = false;
    document.getElementById('betSection').style.display = 'block';
    document.getElementById('placeBetBtn').disabled = false;
    document.getElementById('spinningStatus').style.display = 'none';
}

function updateWheelImmediately() {
    createWheelSegments();
    updatePlayersList();
    updateUI();
    updateRoomStatus();
    updateHubCurrentPlayer();
}

// ============================================================
// ОЧИСТКА ИГРОКОВ
// ============================================================

async function clearRoomPlayers() {
    try {
        var result = await PvPRoomManager.clearAllPlayers();
        if (result) {
            gameState.players = [];
            gameState.totalPoolTon = 0;
            gameState.totalPoolStars = 0;
            gameState.playerBets = [];
            gameState.winner = null;
            gameState.wheelSegments = [];
            updateUI();
            updatePlayersList();
            updateWheelImmediately();
        }
        return result;
    } catch (error) {
        console.error('Clear room players error:', error);
        return false;
    }
}

// ============================================================
// НОВЫЙ РАУНД
// ============================================================

async function startNewRound() {
    clearForceResetTimer();
    if (gameState.timer) clearInterval(gameState.timer);
    if (gameState.spinTimer) clearTimeout(gameState.spinTimer);
    if (gameState.newRoundTimer) {
        clearTimeout(gameState.newRoundTimer);
        gameState.newRoundTimer = null;
    }
    
    gameState.players = [];
    gameState.playerBets = [];
    gameState.totalPoolTon = 0;
    gameState.totalPoolStars = 0;
    gameState.winner = null;
    gameState.isSpinning = false;
    gameState.wheelSegments = [];
    gameState.roundPhase = 'waiting';
    gameState.rotationAngle = 0;
    gameState.timeLeft = ROUND_DURATION;
    gameState.isResultLoaded = false;
    
    await clearRoomPlayers();
    await syncRoomStateToDB();
    
    var wheel = document.getElementById('wheel');
    if (wheel) {
        wheel.style.transform = 'rotate(0deg)';
        wheel.style.transition = 'none';
        wheel.classList.remove('spinning');
        wheel.classList.add('waiting-pattern');
        wheel.classList.add('waiting-spin');
    }
    
    var hubContent = document.getElementById('hubContent');
    if (hubContent) {
        hubContent.innerHTML = '<div class="hub-timer" id="hubTimer">' + ROUND_DURATION + '</div><div class="hub-status" id="hubStatus">Ожидание</div>';
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
    
    updateTimerUI();
    updateUI();
    updateBetUI();
    updatePlaceBetButton();
    updatePlayersList();
    updateRoomStatus();
    updateHubCurrentPlayer();
    updateHub('timer', ROUND_DURATION);
    updateHub('status', 'Ожидание');
    
    startWaitingSpin();
    
    PvPRoomManager.notifyListeners('room_waiting', { status: 'waiting' });
}

// ============================================================
// КОЛЕСО - СЕГМЕНТЫ
// ============================================================

function createWheelSegments() {
    var wheel = document.getElementById('wheel');
    var activePlayers = getActivePlayers();
    if (!wheel) return;
    
    if (activePlayers.length === 0) {
        wheel.innerHTML = '';
        wheel.classList.add('waiting-pattern');
        wheel.classList.add('waiting-spin');
        wheel.style.transition = 'none';
        return;
    }
    
    wheel.classList.remove('waiting-pattern');
    wheel.classList.remove('waiting-spin');
    
    var totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
    
    if (totalValue === 0) {
        var equalAngle = 360 / activePlayers.length;
        var segmentsHTML = '';
        var currentAngle = 0;
        
        activePlayers.forEach(function(player, index) {
            var midAngle = currentAngle + equalAngle / 2;
            segmentsHTML += '<div class="wheel-avatar-container" style="transform: rotate(' + midAngle + 'deg);">' +
                '<div class="avatar-position">' +
                '<img src="' + getAvatarUrl(player) + '" alt="' + player.firstName + '" class="wheel-player-avatar">' +
                '</div></div>';
            currentAngle += equalAngle;
        });
        
        var gradientColors = activePlayers.map(function(player, index) {
            var startPercent = (index / activePlayers.length) * 100;
            var endPercent = ((index + 1) / activePlayers.length) * 100;
            return player.color + ' ' + startPercent + '% ' + endPercent + '%';
        });
        
        var gradient = 'conic-gradient(from 0deg, ' + gradientColors.join(', ') + ')';
        wheel.innerHTML = '<div style="width:100%;height:100%;border-radius:50%;background:' + gradient + ';position:relative;">' +
            segmentsHTML + '</div>';
        return;
    }
    
    var startAngle = 0;
    var segmentsHTML = '';
    var gradientColors = [];
    
    activePlayers.forEach(function(player) {
        var playerValue = calculatePlayerTotalValue(player);
        var angle = (playerValue / totalValue) * 360;
        var midAngle = startAngle + angle / 2;
        var startPercent = (startAngle / 360) * 100;
        var endPercent = ((startAngle + angle) / 360) * 100;
        
        segmentsHTML += '<div class="wheel-avatar-container" style="transform: rotate(' + midAngle + 'deg);">' +
            '<div class="avatar-position">' +
            '<img src="' + getAvatarUrl(player) + '" alt="' + player.firstName + '" class="wheel-player-avatar">' +
            '</div></div>';
        
        gradientColors.push(player.color + ' ' + startPercent + '% ' + endPercent + '%');
        startAngle += angle;
    });
    
    var gradient = 'conic-gradient(from 0deg, ' + gradientColors.join(', ') + ')';
    wheel.innerHTML = '<div style="width:100%;height:100%;border-radius:50%;background:' + gradient + ';position:relative;">' +
        segmentsHTML + '</div>';
}

// ============================================================
// ВРАЩЕНИЕ КОЛЕСА
// ============================================================

async function startSpin() {
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
    
    var winner = await selectWinnerOnServer();
    if (!winner) {
        tg.showAlert('❌ Ошибка выбора победителя');
        startWaitingPhase();
        return;
    }
    
    gameState.winner = winner;
    
    var totalInTon = gameState.totalPoolTon + (gameState.totalPoolStars / TON_TO_STARS_RATE);
    
    await saveSpinResultToDB(winner, totalInTon, gameState.roundId, activePlayers);
    await syncRoomStateToDB();
    
    PvPRoomManager.notifyListeners('room_finished', {
        winner_id: winner.userId,
        winner_name: winner.firstName,
        prize: totalInTon,
        roundId: gameState.roundId,
        showModal: false
    });
    
    var placeBtn = document.getElementById('placeBetBtn');
    if (placeBtn) placeBtn.disabled = true;
    var betSection = document.getElementById('betSection');
    if (betSection) betSection.style.display = 'none';
    var spinningStatus = document.getElementById('spinningStatus');
    if (spinningStatus) spinningStatus.style.display = 'block';
    
    updateHub('status', 'ИГРА');
    createWheelSegments();
    
    var targetAngle = calculateTargetAngleForWinner(winner);
    var spins = 5 + Math.random() * 5;
    var finalAngle = 360 * spins + targetAngle;
    gameState.rotationAngle += finalAngle;
    
    var wheel = document.getElementById('wheel');
    if (wheel) {
        wheel.style.transition = 'transform 5s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
        wheel.style.transform = 'rotate(' + gameState.rotationAngle + 'deg)';
        wheel.classList.add('spinning');
        wheel.classList.remove('waiting-pattern');
        wheel.classList.remove('waiting-spin');
    }
    
    updateHub('avatar', winner);
    updateHubCurrentPlayer();
    
    startForceResetTimer();
    
    gameState.spinTimer = setTimeout(async function() {
        clearForceResetTimer();
        if (wheel) {
            wheel.classList.remove('spinning');
            wheel.style.transition = 'none';
        }
        gameState.isSpinning = false;
        gameState.roundPhase = 'finished';
        gameState.isResultLoaded = true;
        
        if (spinningStatus) spinningStatus.style.display = 'none';
        
        await showWinner(winner);
        updateUI();
        updatePlaceBetButton();
        
        PvPRoomManager.notifyListeners('room_finished_modal', {
            winner_id: winner.userId,
            winner_name: winner.firstName,
            prize: totalInTon,
            roundId: gameState.roundId
        });
        
    }, SPIN_DURATION);
}

function calculateTargetAngleForWinner(winner) {
    var activePlayers = getActivePlayers();
    var totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
    
    if (totalValue === 0 || activePlayers.length === 0) {
        return 0;
    }
    
    var startAngle = 0;
    var winnerSegment = null;
    
    for (var i = 0; i < activePlayers.length; i++) {
        var player = activePlayers[i];
        var playerValue = calculatePlayerTotalValue(player);
        var angle = (playerValue / totalValue) * 360;
        
        if (player.userId === winner.userId) {
            winnerSegment = {
                player: player,
                startAngle: startAngle,
                endAngle: startAngle + angle,
                midAngle: startAngle + angle / 2
            };
            break;
        }
        startAngle += angle;
    }
    
    if (!winnerSegment) {
        return 0;
    }
    
    var midAngle = winnerSegment.midAngle;
    var segmentRange = winnerSegment.endAngle - winnerSegment.startAngle;
    var randomOffset = (Math.random() * 0.6 + 0.2) * segmentRange;
    var targetPoint = winnerSegment.startAngle + randomOffset;
    var targetAngle = 360 - targetPoint;
    targetAngle = ((targetAngle % 360) + 360) % 360;
    
    return targetAngle;
}

// ============================================================
// ОБНОВЛЕНИЕ ЦЕНТРА КОЛЕСА
// ============================================================

function updateHubCurrentPlayer() {
    var hubContent = document.getElementById('hubContent');
    if (!hubContent) return;
    
    var activePlayers = getActivePlayers();
    if (activePlayers.length === 0) {
        hubContent.innerHTML = '<div class="hub-timer" id="hubTimer">' + gameState.timeLeft + '</div>' +
            '<div class="hub-status" id="hubStatus">Ожидание</div>';
        return;
    }
    
    if (gameState.winner) {
        hubContent.innerHTML = '<img src="' + getAvatarUrl(gameState.winner) + '" alt="' + gameState.winner.firstName + '" class="hub-avatar">' +
            '<div class="hub-player-name">' + gameState.winner.firstName + '</div>';
        return;
    }
    
    if (gameState.isSpinning) {
        var currentAngle = gameState.rotationAngle % 360;
        var player = getPlayerAtAngle(currentAngle);
        if (player) {
            hubContent.innerHTML = '<img src="' + getAvatarUrl(player) + '" alt="' + player.firstName + '" class="hub-avatar">' +
                '<div class="hub-player-name">' + player.firstName + '</div>';
        } else {
            hubContent.innerHTML = '<div class="hub-timer" id="hubTimer">' + gameState.timeLeft + '</div>' +
                '<div class="hub-status" id="hubStatus">Вращение...</div>';
        }
        return;
    }
    
    hubContent.innerHTML = '<div class="hub-timer" id="hubTimer">' + gameState.timeLeft + '</div>' +
        '<div class="hub-status" id="hubStatus">Ожидание</div>';
}

function getPlayerAtAngle(angle) {
    var activePlayers = getActivePlayers();
    var totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
    
    if (totalValue === 0 || activePlayers.length === 0) {
        return null;
    }
    
    var normalizedAngle = ((360 - angle) % 360 + 360) % 360;
    var startAngle = 0;
    
    for (var i = 0; i < activePlayers.length; i++) {
        var player = activePlayers[i];
        var playerValue = calculatePlayerTotalValue(player);
        var segmentAngle = (playerValue / totalValue) * 360;
        
        if (normalizedAngle >= startAngle && normalizedAngle < startAngle + segmentAngle) {
            return player;
        }
        startAngle += segmentAngle;
    }
    
    return activePlayers[activePlayers.length - 1];
}

// ============================================================
// БАЛАНС
// ============================================================

function updatePvPBalanceUI() {
    var user = getUserData();
    if (user) {
        gameState.balance.ton = user.ton_balance || 0;
        gameState.balance.stars = user.stars_balance || 0;
    }
    
    var tonEl = document.getElementById('pvpTonBalance');
    var starsEl = document.getElementById('pvpStarsBalance');
    if (tonEl) tonEl.textContent = gameState.balance.ton.toFixed(2);
    if (starsEl) starsEl.textContent = Math.floor(gameState.balance.stars);
}

function updateBalanceFromDB(user) {
    if (!user) {
        user = getUserData();
    }
    if (!user) return;
    gameState.balance.ton = user.ton_balance || 0;
    gameState.balance.stars = user.stars_balance || 0;
    updatePvPBalanceUI();
}

// ============================================================
// ИСТОРИЯ
// ============================================================

async function loadHistoryFromDB() {
    try {
        var { data: lastRound, error: roundError } = await supabaseClient
            .from('pvp_rounds')
            .select('round_number')
            .order('round_number', { ascending: false })
            .limit(1)
            .maybeSingle();
        
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
// UI ОБНОВЛЕНИЯ
// ============================================================

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
    updateRoomStatus();
    updatePlayersList();
    
    var list = document.getElementById('playersListCompact');
    if (list) {
        if (activePlayers.length === 0) {
            list.innerHTML = '<div class="no-players-compact">Нет игроков в комнате</div>';
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
    updateHubCurrentPlayer();
}

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
    
    btn.disabled = isBetting || gameState.betAmount > max || gameState.betAmount < min || gameState.isSpinning || gameState.roundPhase === 'finished';
    
    if (isBetting) {
        btn.textContent = '⏳ Отправка...';
    } else if (gameState.isSpinning) {
        btn.textContent = '⏳ Колесо крутится...';
    } else if (gameState.roundPhase === 'finished') {
        btn.textContent = '⏳ Раунд завершен';
    } else {
        btn.textContent = 'Сделать ставку';
    }
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
            hubContent.innerHTML = '<img src="' + getAvatarUrl(data) + '" alt="' + data.firstName + '" class="hub-avatar">' +
                '<div class="hub-player-name">' + data.firstName + '</div>';
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
    updateHubCurrentPlayer();
}

function updateRoundDisplay() {
    var roundEl = document.getElementById('roundNumber');
    if (roundEl) {
        roundEl.textContent = '#' + gameState.roundId;
    }
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
// ФАЗЫ ИГРЫ
// ============================================================

async function startWaitingPhase() {
    clearForceResetTimer();
    
    gameState.roundPhase = 'waiting';
    gameState.timeLeft = ROUND_DURATION;
    gameState.isSpinning = false;
    gameState.winner = null;
    gameState.isResultLoaded = false;
    
    if (gameState.timer) clearInterval(gameState.timer);
    
    await syncRoomStateToDB();
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
    updateHubCurrentPlayer();
}

function startCountdownFrom(timeLeft) {
    gameState.roundPhase = 'countdown';
    gameState.timeLeft = timeLeft || ROUND_DURATION;
    
    if (gameState.timer) clearInterval(gameState.timer);
    
    updateHub('timer', gameState.timeLeft);
    updateHub('status', 'До вращения');
    
    var placeBtn = document.getElementById('placeBetBtn');
    if (placeBtn) placeBtn.disabled = false;
    
    startForceResetTimer();
    
    var syncCounter = 0;
    gameState.timer = setInterval(function() {
        gameState.timeLeft--;
        updateTimerUI();
        updateHub('timer', gameState.timeLeft);
        
        syncCounter++;
        if (syncCounter % 3 === 0) {
            syncRoomStateToDB();
        }
        
        if (gameState.timeLeft <= 0) {
            clearInterval(gameState.timer);
            clearForceResetTimer();
            startSpin();
        }
    }, 1000);
    
    updateUI();
    updateHubCurrentPlayer();
}

function startCountdown() {
    var activePlayers = getActivePlayers();
    if (activePlayers.length < MIN_PLAYERS) {
        startWaitingPhase();
        return;
    }
    
    stopWaitingSpin();
    startCountdownFrom(ROUND_DURATION);
}

// ============================================================
// РЕЖИМ ОЖИДАНИЯ
// ============================================================

function startWaitingSpin() {
    var wheel = document.getElementById('wheel');
    if (!wheel) return;
    
    gameState.rotationAngle = 0;
    wheel.style.transform = 'rotate(0deg)';
    wheel.style.transition = 'none';
    wheel.classList.remove('spinning');
    wheel.classList.add('waiting-pattern');
    wheel.classList.add('waiting-spin');
}

function stopWaitingSpin() {
    var wheel = document.getElementById('wheel');
    if (!wheel) return;
    
    wheel.classList.remove('waiting-pattern');
    wheel.classList.remove('waiting-spin');
    wheel.style.transition = 'transform 5s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
}

// ============================================================
// ПОБЕДИТЕЛЬ
// ============================================================

async function showWinner(winner) {
    if (!winner) return;
    
    var modal = document.getElementById('winnerModal');
    if (!modal) return;
    
    var totalInTon = gameState.totalPoolTon + (gameState.totalPoolStars / TON_TO_STARS_RATE);
    var playerValue = calculatePlayerTotalValue(winner);
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
    
    var winnerSection = document.getElementById('winnerSection');
    if (winnerSection) {
        winnerSection.style.display = 'block';
        document.getElementById('winnerName').textContent = winner.firstName;
        document.getElementById('winnerPrize').innerHTML = totalInTon.toFixed(2) + ' <img src="assets/ton.png" alt="TON" class="winner-prize-icon">';
    }
    
    var playerDetails = getActivePlayers().map(function(p) {
        return {
            name: p.firstName,
            bets: p.bets,
            share: calculateWinChance(p)
        };
    });
    
    await saveRoundToDB(
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
        if (user && winner.userId === String(user.id) && totalInTon > 0) {
            if (UserManager) {
                var added = await UserManager.addWin(totalInTon, 'ton', 'Win in PvP Round #' + gameState.roundId);
                if (added) {
                    var updatedUser = UserManager.getUser();
                    gameState.balance.ton = updatedUser.ton_balance;
                    updatePvPBalanceUI();
                    if (window.betsApp && window.betsApp.refreshBalance) {
                        window.betsApp.refreshBalance();
                    }
                }
            }
        }
        
        if (user) {
            var stats = await loadPlayerStats(user.id);
            var totalBets = (stats?.total_bets || 0) + gameState.playerBets.length;
            var totalWins = (stats?.total_wins || 0) + (winner.userId === String(user.id) ? 1 : 0);
            var totalPrize = (stats?.total_prize || 0) + (winner.userId === String(user.id) ? totalInTon : 0);
            
            await updatePlayerStats(
                String(user.id),
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
    await syncRoomStateToDB();
    
    setTimeout(function() {
        modal.classList.remove('show');
    }, 3000);
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
        
        if (existing) {
            await supabaseClient
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
        } else {
            await supabaseClient
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
        return data;
    } catch (error) {
        return null;
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
// ИСТОРИЯ
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

// ============================================================
// СТАВКА - С БЛОКИРОВКОЙ ПОВТОРНЫХ НАЖАТИЙ
// ============================================================

async function placeBet() {
    if (isBetting) {
        return;
    }
    
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
    
    var currentUser = UserManager.getUser();
    var max = currency === 'ton' ? currentUser.ton_balance : currentUser.stars_balance;
    var min = currency === 'ton' ? MIN_BET_TON : MIN_BET_STARS;
    
    if (amount > max) {
        tg.showAlert('❌ Недостаточно средств! Баланс: ' + max + ' ' + (currency === 'ton' ? 'TON' : 'Stars'));
        return;
    }
    
    if (amount < min) {
        tg.showAlert('❌ Минимальная ставка: ' + min + ' ' + (currency === 'ton' ? 'TON' : 'Stars'));
        return;
    }
    
    isBetting = true;
    var placeBtn = document.getElementById('placeBetBtn');
    if (placeBtn) {
        placeBtn.disabled = true;
        placeBtn.textContent = '⏳ Отправка...';
    }
    
    try {
        if (UserManager) {
            var success;
            if (currency === 'ton') {
                success = await UserManager.subtractTon(amount, 'Bet in PvP');
            } else {
                success = await UserManager.subtractStars(amount, 'Bet in PvP');
            }
            
            if (!success) {
                tg.showAlert('❌ Не удалось списать средства');
                isBetting = false;
                if (placeBtn) {
                    placeBtn.disabled = false;
                    placeBtn.textContent = 'Сделать ставку';
                }
                return;
            }
            
            var updatedUser = UserManager.getUser();
            gameState.balance.ton = updatedUser.ton_balance;
            gameState.balance.stars = updatedUser.stars_balance;
            updatePvPBalanceUI();
        }
        
        var roomSuccess = await PvPRoomManager.addBet(
            String(user.id),
            user.username || '',
            user.first_name || 'Игрок',
            user.photo_url || '',
            amount,
            currency
        );
        
        if (!roomSuccess) {
            tg.showAlert('❌ Не удалось разместить ставку');
            isBetting = false;
            if (placeBtn) {
                placeBtn.disabled = false;
                placeBtn.textContent = 'Сделать ставку';
            }
            return;
        }
        
        await syncRoomData();
        
        var player = gameState.players.find(function(p) { return p.userId === String(user.id); });
        if (!player) {
            player = {
                userId: String(user.id),
                firstName: user.first_name || 'Игрок',
                username: user.username || 'user',
                avatar: user.photo_url || '',
                color: PvPRoomManager.getRandomColor(),
                bets: []
            };
            gameState.players.push(player);
        }
        
        player.bets.push({ amount: amount, currency: currency });
        gameState.playerBets.push({ amount: amount, currency: currency });
        
        await syncRoomStateToDB();
        
        updateUI();
        updateBetUI();
        updateTimerUI();
        updatePlaceBetButton();
        updatePlayersList();
        updateWheelImmediately();
        
        var activePlayers = getActivePlayers();
        if (activePlayers.length >= MIN_PLAYERS && gameState.roundPhase === 'waiting') {
            startCountdown();
        }
        
        isBetting = false;
        if (placeBtn) {
            placeBtn.disabled = false;
            placeBtn.textContent = 'Сделать ставку';
        }
        
    } catch (error) {
        console.error('❌ Place bet error:', error);
        tg.showAlert('❌ Ошибка при размещении ставки');
        isBetting = false;
        if (placeBtn) {
            placeBtn.disabled = false;
            placeBtn.textContent = 'Сделать ставку';
        }
    }
}

// ============================================================
// СИНХРОНИЗАЦИЯ ДАННЫХ - ОПТИМИЗИРОВАННАЯ
// ============================================================

async function syncRoomData() {
    if (isSyncing) {
        return;
    }
    
    // Не синхронизируем чаще чем раз в 500ms
    var now = Date.now();
    if (now - gameState._lastSync < 500) {
        return;
    }
    gameState._lastSync = now;
    
    isSyncing = true;
    
    try {
        await PvPRoomManager.loadPlayers();
        
        var players = PvPRoomManager.getPlayers();
        var pool = PvPRoomManager.getPool();
        
        gameState.players = players.map(function(p) {
            return {
                userId: p.user_id,
                firstName: p.first_name,
                username: p.username,
                avatar: p.photo_url,
                color: p.color,
                bets: p.bets || []
            };
        });
        
        gameState.totalPoolTon = pool.ton;
        gameState.totalPoolStars = pool.stars;
        
        updateUI();
        updatePlayersList();
        updateWheelImmediately();
        
    } catch (error) {
        console.error('Sync error:', error);
    } finally {
        isSyncing = false;
    }
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
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
    var playerValue = calculatePlayerTotalValue(player);
    var totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
    if (totalValue === 0) return '0%';
    return ((playerValue / totalValue) * 100).toFixed(1) + '%';
}

function getAvatarUrl(player) {
    if (!player) return '';
    if (player.avatar) return player.avatar;
    return 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + player.userId;
}

// ============================================================
// ДЕПОЗИТЫ
// ============================================================

var depositState = {
    amount: 0,
    currency: 'ton',
    step: 'input',
    error: null,
    isWalletConnected: false,
    isProcessing: false
};

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
        
        var user = UserManager ? UserManager.getUser() : null;
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
                            UserManager.addStars(amount, 'Deposit from PvP').then(function(added) {
                                if (added) {
                                    var updatedUser = UserManager.getUser();
                                    gameState.balance.stars = updatedUser.stars_balance;
                                    updatePvPBalanceUI();
                                    if (window.betsApp && window.betsApp.refreshBalance) {
                                        window.betsApp.refreshBalance();
                                    }
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
// ЭКСПОРТ
// ============================================================

window.pvpGame = {
    state: gameState,
    placeBet: placeBet,
    startNewRound: startNewRound,
    getActivePlayers: getActivePlayers,
    updateUI: updateUI,
    openDepositModal: openDepositModal,
    updateBalanceFromDB: updateBalanceFromDB,
    updateWheelImmediately: updateWheelImmediately,
    forceResetRound: forceResetRound,
    syncRoomStateToDB: syncRoomStateToDB
};

console.log('✅ PvP game loaded');