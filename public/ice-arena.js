// ============================================================
// ICE ARENA - ОСНОВНАЯ ЛОГИКА ИГРЫ
// ============================================================

var tg = window.Telegram.WebApp;

// ============================================================
// ПОДКЛЮЧЕНИЕ МЕНЕДЖЕРОВ
// ============================================================

var UserManager = window.UserManager;
var IceArenaRoomManager = window.IceArenaRoomManager;

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
        updateBalanceUI();
        updateUserUI();
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
var PUCK_MOVE_DURATION = 4000;
var NEW_ROUND_DELAY = 3000;
var FORCE_RESET_TIMEOUT = 30000;
var TON_TO_STARS_RATE = 76;
var MIN_PLAYERS = 2;
var MIN_BET_TON = 0.1;
var MIN_BET_STARS = 10;
var OWNER_WALLET = 'UQC5ZUl4Qobq69CgLi7tg-8y6aOwVilc5b82jJFZShtnetrw';

// ============================================================
// ЦВЕТА ЗОН (яркие, различимые цвета)
// ============================================================
var ZONE_COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA94D', '#A29BFE',
    '#FD79A8', '#FDCB6E', '#00B894', '#E17055', '#74B9FF',
    '#55EFC4', '#FAB1A0', '#81ECEC', '#DDA0DD', '#FFD93D',
    '#6C5CE7', '#00CEC9', '#FDA7DF', '#A3CB38', '#ED4C67'
];

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
    winner: null,
    roundId: 0,
    winnerZone: null,
    puckPosition: { x: 0, y: 0 },
    puckAngle: 0,
    puckDirection: 0,
    puckMoving: false,
    moveTimer: null,
    newRoundTimer: null,
    history: [],
    topGame: null,
    isSyncing: false,
    isResultLoaded: false,
    _lastSync: 0,
    _isPlacingBet: false,
    _lastPlayersHash: null,
    _puckAnimationId: null,
    _usedColors: []
};

var forceResetTimer = null;
var isBetting = false;
var isSyncing = false;

// ============================================================
// TON CONNECT - ИНИЦИАЛИЗАЦИЯ
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
                showTonConnectError();
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
// СИНХРОНИЗАЦИЯ СОСТОЯНИЯ С БД
// ============================================================

async function syncRoomStateToDB() {
    try {
        var { error } = await supabaseClient
            .from('ice_arena_rooms')
            .update({
                phase: gameState.roundPhase,
                time_left: gameState.timeLeft,
                round_number: gameState.roundId,
                updated_at: new Date().toISOString()
            })
            .eq('room_id', 'ice_arena_room');
        
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
            .from('ice_arena_rooms')
            .select('*')
            .eq('room_id', 'ice_arena_room')
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
        
        // Выбираем случайную зону
        var zoneIndex = Math.floor(Math.random() * activePlayers.length);
        return activePlayers[zoneIndex];
        
    } catch (error) {
        console.error('Select winner error:', error);
        return null;
    }
}

async function saveSpinResultToDB(winner, prize, roundId, players, winnerZone) {
    try {
        var { error } = await supabaseClient
            .from('ice_arena_rooms')
            .update({
                phase: 'finished',
                winner_id: winner.userId,
                winner_name: winner.firstName,
                prize_amount: prize,
                winner_zone: winnerZone,
                spin_result: {
                    winner: winner,
                    prize: prize,
                    roundId: roundId,
                    winnerZone: winnerZone,
                    timestamp: new Date().toISOString()
                },
                round_players: players.map(function(p) {
                    return {
                        user_id: p.userId,
                        name: p.firstName,
                        bets: p.bets,
                        value: calculatePlayerTotalValue(p)
                    };
                }),
                updated_at: new Date().toISOString()
            })
            .eq('room_id', 'ice_arena_room');
        
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
    console.log('🔄 Force resetting Ice Arena round');
    
    if (gameState.timer) {
        clearInterval(gameState.timer);
        gameState.timer = null;
    }
    if (gameState.moveTimer) {
        clearTimeout(gameState.moveTimer);
        gameState.moveTimer = null;
    }
    if (gameState.newRoundTimer) {
        clearTimeout(gameState.newRoundTimer);
        gameState.newRoundTimer = null;
    }
    if (gameState._puckAnimationId) {
        cancelAnimationFrame(gameState._puckAnimationId);
        gameState._puckAnimationId = null;
    }
    
    gameState.isSpinning = false;
    gameState.roundPhase = 'waiting';
    gameState.winner = null;
    gameState.winnerZone = null;
    gameState.timeLeft = ROUND_DURATION;
    gameState.isResultLoaded = false;
    gameState._isPlacingBet = false;
    gameState.puckMoving = false;
    gameState._usedColors = [];
    
    var gameStatus = document.getElementById('gameStatus');
    if (gameStatus) gameStatus.style.display = 'none';
    var winnerSection = document.getElementById('winnerSection');
    if (winnerSection) winnerSection.style.display = 'none';
    var winnerModal = document.getElementById('winnerModal');
    if (winnerModal) winnerModal.classList.remove('show');
    var betSection = document.getElementById('betSection');
    if (betSection) betSection.style.display = 'block';
    var placeBtn = document.getElementById('placeBetBtn');
    if (placeBtn) {
        placeBtn.disabled = false;
        placeBtn.textContent = 'Сделать ставку';
    }
    
    // Скрываем шайбу
    var puck = document.getElementById('arenaPuck');
    if (puck) {
        puck.style.display = 'none';
        puck.classList.remove('sliding');
        puck.classList.remove('spinning');
    }
    
    // Сбрасываем подсветку зон
    document.querySelectorAll('.arena-zone').forEach(function(zone) {
        zone.classList.remove('winner-zone');
        zone.classList.remove('highlight');
    });
    
    // Показываем центр
    var center = document.getElementById('arenaCenter');
    if (center) {
        center.style.display = 'flex';
    }
    
    // Обновляем статус
    var statusEl = document.getElementById('arenaStatus');
    if (statusEl) {
        statusEl.textContent = 'Ожидание';
        statusEl.className = 'arena-status waiting';
    }
    
    // Обновляем таймер
    var timerEl = document.getElementById('arenaTimer');
    if (timerEl) {
        timerEl.textContent = ROUND_DURATION;
        timerEl.classList.remove('warning');
        timerEl.classList.remove('finished');
    }
    
    await IceArenaRoomManager.clearAllPlayers();
    await syncRoomStateToDB();
    
    updateUI();
    updateBetUI();
    updateTimerUI();
    updatePlaceBetButton();
    updatePlayersList();
    updateRoomStatus();
    
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
    
    setTimeout(initTonConnect, 500);
    
    initializeUserInArena();
    loadHistoryFromDB();
    setupUI();
    
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
                gameState.winnerZone = state.winner_zone || 0;
                gameState.roundPhase = 'finished';
                
                var totalInTon = state.prize_amount || 0;
                
                showWinnerUI(winner, totalInTon, gameState.winnerZone);
                
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
                gameState.winnerZone = state.spin_result.winnerZone || 0;
                gameState.roundPhase = 'finished';
                
                var totalInTon = state.spin_result.prize || 0;
                
                showWinnerUI(winner, totalInTon, gameState.winnerZone);
                
                setTimeout(function() {
                    startNewRound();
                }, NEW_ROUND_DELAY);
                
            } else if (state.phase === 'spinning') {
                gameState.isSpinning = true;
                gameState.roundPhase = 'spinning';
                document.getElementById('gameStatus').style.display = 'block';
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
});

function showWinnerUI(winner, prize, zoneIndex) {
    var winnerSection = document.getElementById('winnerSection');
    if (winnerSection) {
        winnerSection.style.display = 'block';
        document.getElementById('winnerName').textContent = winner.firstName;
        document.getElementById('winnerPrize').innerHTML = prize.toFixed(2) + ' <img src="assets/ton.png" alt="TON" class="winner-prize-icon">';
    }
    
    var modal = document.getElementById('winnerModal');
    if (modal) {
        document.getElementById('winnerModalName').textContent = winner.firstName;
        document.getElementById('winnerModalPrize').innerHTML = prize.toFixed(2) + ' <img src="assets/ton.png" alt="TON" class="winner-modal-icon-small">';
        document.getElementById('winnerModalZone').textContent = 'Зона ' + (zoneIndex + 1);
        modal.classList.add('show');
    }
    
    // Подсвечиваем зону победителя
    var zones = document.querySelectorAll('.arena-zone');
    if (zones && zones[zoneIndex]) {
        zones.forEach(function(z, i) {
            if (i === zoneIndex) {
                z.classList.add('winner-zone');
                z.classList.add('highlight');
            }
        });
    }
    
    var betSection = document.getElementById('betSection');
    if (betSection) betSection.style.display = 'none';
    var placeBtn = document.getElementById('placeBetBtn');
    if (placeBtn) placeBtn.disabled = true;
    var gameStatus = document.getElementById('gameStatus');
    if (gameStatus) gameStatus.style.display = 'none';
}

// ============================================================
// ПОЛЬЗОВАТЕЛЬ
// ============================================================

function generateAvatarSVG(initial, color) {
    return 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">' +
            '<rect width="100" height="100" rx="50" fill="' + color + '"/>' +
            '<text x="50" y="65" font-size="40" text-anchor="middle" fill="#fff" font-weight="bold">' + initial + '</text>' +
        '</svg>'
    );
}

async function initializeUserInArena() {
    try {
        if (!UserManager) {
            console.error('❌ UserManager is undefined');
            return null;
        }
        
        var user = await UserManager.loadUser();
        if (user) {
            gameState.balance.ton = user.ton_balance || 0;
            gameState.balance.stars = user.stars_balance || 0;
            updateBalanceUI();
            updateUserUI();
            
            await initArenaRoom();
            
            setTimeout(function() {
                updateFieldZones();
            }, 300);
            
            return user;
        }
        return null;
    } catch (error) {
        console.error('❌ Error loading user in Ice Arena:', error);
        return null;
    }
}

function updateUserUI() {
    var user = getUserData();
    if (!user) return;
    
    var nameDisplay = document.getElementById('arenaUserNameDisplay');
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
    
    var avatar = document.getElementById('arenaUserAvatar');
    if (avatar) {
        var tgUser = UserManager.getTelegramUser();
        
        if (tgUser && tgUser.id) {
            var avatarUrl = 'https://t.me/i/userpic/320/' + tgUser.id + '.jpg';
            avatar.src = avatarUrl;
            avatar.onerror = function() {
                var initial = (user.first_name || 'U')[0].toUpperCase();
                var colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#a29bfe', '#fd79a8', '#fdcb6e', '#e17055', '#00cec9'];
                var color = colors[Math.floor(Math.random() * colors.length)];
                this.src = generateAvatarSVG(initial, color);
                this.onerror = null;
            };
            avatar.style.display = 'block';
        } else if (user.photo_url) {
            avatar.src = user.photo_url;
            avatar.onerror = function() {
                var initial = (user.first_name || 'U')[0].toUpperCase();
                var colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#a29bfe', '#fd79a8', '#fdcb6e', '#e17055', '#00cec9'];
                var color = colors[Math.floor(Math.random() * colors.length)];
                this.src = generateAvatarSVG(initial, color);
                this.onerror = null;
            };
            avatar.style.display = 'block';
        } else {
            var initial = (user.first_name || 'U')[0].toUpperCase();
            var colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#a29bfe', '#fd79a8', '#fdcb6e', '#e17055', '#00cec9'];
            var color = colors[Math.floor(Math.random() * colors.length)];
            avatar.src = generateAvatarSVG(initial, color);
            avatar.style.display = 'block';
        }
    }
}

// ============================================================
// ICE ARENA ROOM MANAGER - ИНТЕГРАЦИЯ
// ============================================================

async function initArenaRoom() {
    try {
        var user = UserManager.getUser();
        if (!user) {
            console.warn('⚠️ No user for Ice Arena room');
            return false;
        }
        
        await IceArenaRoomManager.initRoom();
        setupRealtimeHandlers();
        
        var players = IceArenaRoomManager.getPlayers();
        var pool = IceArenaRoomManager.getPool();
        
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
        updateFieldZones();
        
        return true;
        
    } catch (error) {
        console.error('Init room error:', error);
        return false;
    }
}

function setupRealtimeHandlers() {
    if (!IceArenaRoomManager) return;
    
    if (window._arenaUnsubscribe) {
        window._arenaUnsubscribe();
    }
    
    window._arenaUnsubscribe = IceArenaRoomManager.subscribe(function(event, data) {
        switch(event) {
            case 'players_loaded':
            case 'players_updated':
                if (data && data.length !== undefined) {
                    updatePlayersFromRoom(data);
                } else {
                    syncRoomData();
                }
                break;
                
            case 'pool_updated':
                if (data) {
                    gameState.totalPoolTon = data.ton || 0;
                    gameState.totalPoolStars = data.stars || 0;
                }
                updateUI();
                break;
                
            case 'player_added':
            case 'player_updated':
                syncRoomData();
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
    
    var pool = IceArenaRoomManager.getPool();
    gameState.totalPoolTon = pool.ton;
    gameState.totalPoolStars = pool.stars;
    
    updateUI();
    updatePlayersList();
    updateFieldZones();
    
    var activePlayers = getActivePlayers();
    if (activePlayers.length >= MIN_PLAYERS && gameState.roundPhase === 'waiting') {
        startCountdown();
    }
}

function updateRoomStatus() {
    var roomIdEl = document.getElementById('roomId');
    var playersCountEl = document.getElementById('roomPlayersCount');
    
    if (roomIdEl) {
        roomIdEl.textContent = IceArenaRoomManager.getRoomId() || '—';
    }
    
    if (playersCountEl) {
        var active = getActivePlayers();
        playersCountEl.textContent = active.length;
    }
}

function handleRoomSpin() {
    gameState.isSpinning = true;
    document.getElementById('gameStatus').style.display = 'block';
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
        var winnerZone = data.winner_zone || 0;
        
        gameState.winner = winner;
        gameState.winnerZone = winnerZone;
        gameState.isSpinning = false;
        gameState.roundPhase = 'finished';
        gameState.isResultLoaded = true;
        gameState.roundId = data.roundId || gameState.roundId;
        gameState.puckMoving = false;
        
        var puck = document.getElementById('arenaPuck');
        if (puck) {
            puck.classList.remove('sliding');
            puck.classList.remove('spinning');
        }
        
        var gameStatus = document.getElementById('gameStatus');
        if (gameStatus) gameStatus.style.display = 'none';
        
        var betSection = document.getElementById('betSection');
        if (betSection) betSection.style.display = 'none';
        
        var placeBtn = document.getElementById('placeBetBtn');
        if (placeBtn) placeBtn.disabled = true;
        
        showWinnerUI(winner, totalInTon, winnerZone);
        
        var user = tg.initDataUnsafe?.user;
        if (user && winner.userId === String(user.id) && totalInTon > 0) {
            if (UserManager) {
                var added = await UserManager.addWin(totalInTon, 'ton', 'Win in Ice Arena Round #' + gameState.roundId);
                if (added) {
                    var updatedUser = UserManager.getUser();
                    gameState.balance.ton = updatedUser.ton_balance;
                    updateBalanceUI();
                    if (window.betsApp && window.betsApp.refreshBalance) {
                        window.betsApp.refreshBalance();
                    }
                }
            }
        }
        
        updateUI();
        updatePlayersList();
        
        if (gameState.newRoundTimer) {
            clearTimeout(gameState.newRoundTimer);
        }
        gameState.newRoundTimer = setTimeout(function() {
            startNewRound();
        }, NEW_ROUND_DELAY);
        return;
    }
}

function handleRoomWaiting() {
    if (gameState.isResultLoaded) return;
    
    gameState.roundPhase = 'waiting';
    gameState.isSpinning = false;
    document.getElementById('betSection').style.display = 'block';
    document.getElementById('placeBetBtn').disabled = false;
    document.getElementById('gameStatus').style.display = 'none';
}

// ============================================================
// ОЧИСТКА ИГРОКОВ
// ============================================================

async function clearRoomPlayers() {
    try {
        var result = await IceArenaRoomManager.clearAllPlayers();
        if (result) {
            gameState.players = [];
            gameState.totalPoolTon = 0;
            gameState.totalPoolStars = 0;
            gameState.playerBets = [];
            gameState.winner = null;
            gameState.winnerZone = null;
            gameState._isPlacingBet = false;
            gameState._usedColors = [];
            updateUI();
            updatePlayersList();
            updateFieldZones();
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
    if (gameState.moveTimer) clearTimeout(gameState.moveTimer);
    if (gameState.newRoundTimer) {
        clearTimeout(gameState.newRoundTimer);
        gameState.newRoundTimer = null;
    }
    if (gameState._puckAnimationId) {
        cancelAnimationFrame(gameState._puckAnimationId);
        gameState._puckAnimationId = null;
    }
    
    gameState.players = [];
    gameState.playerBets = [];
    gameState.totalPoolTon = 0;
    gameState.totalPoolStars = 0;
    gameState.winner = null;
    gameState.winnerZone = null;
    gameState.isSpinning = false;
    gameState.roundPhase = 'waiting';
    gameState.timeLeft = ROUND_DURATION;
    gameState.isResultLoaded = false;
    gameState._isPlacingBet = false;
    gameState.puckMoving = false;
    gameState._lastPlayersHash = null;
    gameState._usedColors = [];
    
    await clearRoomPlayers();
    await syncRoomStateToDB();
    
    // Скрываем шайбу
    var puck = document.getElementById('arenaPuck');
    if (puck) {
        puck.style.display = 'none';
        puck.classList.remove('sliding');
        puck.classList.remove('spinning');
    }
    
    // Сбрасываем подсветку зон
    document.querySelectorAll('.arena-zone').forEach(function(zone) {
        zone.classList.remove('winner-zone');
        zone.classList.remove('highlight');
    });
    
    // Показываем центр
    var center = document.getElementById('arenaCenter');
    if (center) {
        center.style.display = 'flex';
    }
    
    // Обновляем статус
    var statusEl = document.getElementById('arenaStatus');
    if (statusEl) {
        statusEl.textContent = 'Ожидание';
        statusEl.className = 'arena-status waiting';
    }
    
    // Обновляем таймер
    var timerEl = document.getElementById('arenaTimer');
    if (timerEl) {
        timerEl.textContent = ROUND_DURATION;
        timerEl.classList.remove('warning');
        timerEl.classList.remove('finished');
    }
    
    var winnerModal = document.getElementById('winnerModal');
    if (winnerModal) winnerModal.classList.remove('show');
    var winnerSection = document.getElementById('winnerSection');
    if (winnerSection) winnerSection.style.display = 'none';
    var gameStatus = document.getElementById('gameStatus');
    if (gameStatus) gameStatus.style.display = 'none';
    var betSection = document.getElementById('betSection');
    if (betSection) betSection.style.display = 'block';
    var placeBtn = document.getElementById('placeBetBtn');
    if (placeBtn) {
        placeBtn.disabled = false;
        placeBtn.textContent = 'Сделать ставку';
    }
    
    updateTimerUI();
    updateUI();
    updateBetUI();
    updatePlaceBetButton();
    updatePlayersList();
    updateRoomStatus();
    updateFieldZones();
    
    IceArenaRoomManager.notifyListeners('room_waiting', { status: 'waiting' });
}

// ============================================================
// ПОЛЕ И ЗОНЫ
// ============================================================

function getUniqueColor() {
    var available = ZONE_COLORS.filter(function(c) { 
        return gameState._usedColors.indexOf(c) === -1; 
    });
    
    if (available.length === 0) {
        // Если все цвета использованы, генерируем случайный яркий
        var hue = Math.floor(Math.random() * 360);
        var sat = 70 + Math.floor(Math.random() * 30);
        var lig = 50 + Math.floor(Math.random() * 30);
        return 'hsl(' + hue + ', ' + sat + '%, ' + lig + '%)';
    }
    
    var color = available[0];
    gameState._usedColors.push(color);
    return color;
}

function updateFieldZones() {
    var zonesContainer = document.getElementById('arenaZones');
    if (!zonesContainer) return;
    
    var activePlayers = getActivePlayers();
    
    if (activePlayers.length === 0) {
        zonesContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:rgba(255,255,255,0.08);font-size:14px;font-weight:500;">Ожидание игроков</div>';
        return;
    }
    
    // Вычисляем общую ценность ставок
    var totalValue = 0;
    var playerValues = activePlayers.map(function(player) {
        var value = calculatePlayerTotalValue(player);
        totalValue += value;
        return { player: player, value: value };
    });
    
    var useEqualSplit = totalValue === 0;
    
    // Сортируем по убыванию ценности
    playerValues.sort(function(a, b) { return b.value - a.value; });
    
    var numZones = activePlayers.length;
    var cols = Math.ceil(Math.sqrt(numZones));
    var rows = Math.ceil(numZones / cols);
    
    zonesContainer.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    zonesContainer.style.gridTemplateRows = 'repeat(' + rows + ', 1fr)';
    
    var html = '';
    
    for (var i = 0; i < numZones; i++) {
        var data = playerValues[i] || { player: { firstName: '—' }, value: 0 };
        var player = data.player;
        var value = data.value;
        
        var percent = useEqualSplit ? (1 / numZones) : (value / totalValue);
        var percentDisplay = (percent * 100).toFixed(1);
        
        var color = player.color || getUniqueColor();
        
        html += '<div class="arena-zone" data-zone="' + i + '" data-userid="' + player.userId + '" style="' +
            'background: rgba(0,0,0,0.7); ' +
            'border-color: ' + color + '; ' +
            'box-shadow: inset 0 0 40px rgba(0,0,0,0.5), 0 0 30px ' + color + '33; ' +
            'position: relative; ' +
            'overflow: hidden; ' +
            'display: flex; ' +
            'flex-direction: column; ' +
            'align-items: center; ' +
            'justify-content: center; ' +
            'cursor: default; ' +
            'transition: all 0.3s ease; ' +
        '">' +
            '<div style="' +
                'position: absolute; ' +
                'bottom: 0; ' +
                'left: 0; ' +
                'right: 0; ' +
                'height: ' + Math.max(percent * 100, 5) + '%; ' +
                'background: ' + color + '; ' +
                'opacity: 0.15; ' +
                'transition: height 0.5s ease; ' +
                'border-radius: 0; ' +
            '"></div>' +
            '<div class="zone-label" style="' +
                'font-size: ' + (numZones > 6 ? '10px' : '14px') + '; ' +
                'font-weight: 700; ' +
                'color: #ffffff; ' +
                'text-shadow: 0 0 20px rgba(0,0,0,0.9); ' +
                'z-index: 2; ' +
                'pointer-events: none; ' +
                'text-align: center; ' +
                'line-height: 1.2; ' +
                'max-width: 90%; ' +
                'word-break: break-word; ' +
            '">' + player.firstName + '</div>' +
            '<div class="zone-percent" style="' +
                'font-size: ' + (numZones > 6 ? '9px' : '12px') + '; ' +
                'font-weight: 600; ' +
                'color: ' + color + '; ' +
                'text-shadow: 0 0 10px rgba(0,0,0,0.8); ' +
                'z-index: 2; ' +
                'pointer-events: none; ' +
                'margin-top: 2px; ' +
            '">' + percentDisplay + '%</div>' +
            '<div class="zone-bet" style="' +
                'position: absolute; ' +
                'bottom: 4px; ' +
                'font-size: 8px; ' +
                'color: rgba(255,255,255,0.25); ' +
                'z-index: 2; ' +
                'pointer-events: none; ' +
                'text-align: center; ' +
                'line-height: 1.2; ' +
            '">' + formatPlayerBets(player) + '</div>' +
        '</div>';
    }
    
    zonesContainer.innerHTML = html;
}

// ============================================================
// ШАЙБА
// ============================================================

function spawnPuck(winnerZone) {
    var puck = document.getElementById('arenaPuck');
    if (!puck) return;
    
    var field = document.getElementById('arenaField');
    if (!field) return;
    
    var rect = field.getBoundingClientRect();
    var padding = 30;
    var puckSize = 30;
    var maxX = rect.width - padding * 2 - puckSize;
    var maxY = rect.height - padding * 2 - puckSize;
    
    // Стартовая позиция - центр поля
    var startX = rect.width / 2 - puckSize / 2;
    var startY = rect.height / 2 - puckSize / 2;
    
    gameState.puckPosition = { x: startX, y: startY };
    
    puck.style.left = startX + 'px';
    puck.style.top = startY + 'px';
    puck.style.display = 'block';
    puck.classList.add('spinning');
    
    // Показываем стрелку со случайным направлением
    var arrow = document.getElementById('puckArrow');
    if (arrow) {
        arrow.classList.add('visible');
        var angle = Math.random() * 360;
        arrow.style.transform = 'translateX(-50%) rotate(' + angle + 'deg)';
        gameState.puckAngle = angle;
    }
    
    // Центр скрываем
    var center = document.getElementById('arenaCenter');
    if (center) {
        center.style.display = 'none';
    }
    
    // Статус игры
    var gameStatus = document.getElementById('gameStatus');
    if (gameStatus) {
        gameStatus.style.display = 'block';
        gameStatus.querySelector('.spinning-text').textContent = '🏒 Шайба в движении...';
    }
    
    var betSection = document.getElementById('betSection');
    if (betSection) betSection.style.display = 'none';
    
    // Через 1 секунду начинаем движение
    setTimeout(function() {
        if (puck) {
            puck.classList.remove('spinning');
            puck.classList.add('sliding');
            startPuckMovement(winnerZone);
        }
    }, 1000);
}

function startPuckMovement(winnerZone) {
    var puck = document.getElementById('arenaPuck');
    if (!puck) return;
    
    var field = document.getElementById('arenaField');
    if (!field) return;
    
    var rect = field.getBoundingClientRect();
    var padding = 30;
    var puckSize = 30;
    var maxX = rect.width - padding * 2 - puckSize;
    var maxY = rect.height - padding * 2 - puckSize;
    
    // Начальная позиция - центр
    var posX = rect.width / 2 - puckSize / 2;
    var posY = rect.height / 2 - puckSize / 2;
    gameState.puckPosition = { x: posX, y: posY };
    
    // Определяем направление движения
    var angle = gameState.puckAngle || (Math.random() * 360);
    var radians = angle * Math.PI / 180;
    var speed = 3 + Math.random() * 3;
    
    var dx = Math.cos(radians) * speed;
    var dy = Math.sin(radians) * speed;
    
    gameState.puckMoving = true;
    var steps = 0;
    var maxSteps = 200 + Math.floor(Math.random() * 150);
    var lastBounceTime = 0;
    
    function animatePuck() {
        if (!gameState.puckMoving) {
            return;
        }
        
        steps++;
        
        // Двигаем шайбу
        posX += dx;
        posY += dy;
        
        var bounced = false;
        var now = Date.now();
        
        // Отскоки от границ с рикошетом
        if (posX < padding) {
            posX = padding;
            dx = Math.abs(dx) * (0.85 + Math.random() * 0.15);
            if (now - lastBounceTime > 200) {
                var newAngle = (Math.random() - 0.5) * 80;
                var rad = (gameState.puckAngle || 0 + newAngle) * Math.PI / 180;
                dy = Math.sin(rad) * Math.abs(dx);
                dx = Math.cos(rad) * Math.abs(dx);
                lastBounceTime = now;
                bounced = true;
            }
        }
        if (posX > maxX) {
            posX = maxX;
            dx = -Math.abs(dx) * (0.85 + Math.random() * 0.15);
            if (now - lastBounceTime > 200) {
                var newAngle = (Math.random() - 0.5) * 80;
                var rad = (gameState.puckAngle || 0 + newAngle) * Math.PI / 180;
                dy = Math.sin(rad) * Math.abs(dx);
                dx = -Math.cos(rad) * Math.abs(dx);
                lastBounceTime = now;
                bounced = true;
            }
        }
        if (posY < padding) {
            posY = padding;
            dy = Math.abs(dy) * (0.85 + Math.random() * 0.15);
            if (now - lastBounceTime > 200) {
                var newAngle = (Math.random() - 0.5) * 80;
                var rad = (gameState.puckAngle || 0 + newAngle) * Math.PI / 180;
                dx = Math.cos(rad) * Math.abs(dy);
                dy = Math.sin(rad) * Math.abs(dy);
                lastBounceTime = now;
                bounced = true;
            }
        }
        if (posY > maxY) {
            posY = maxY;
            dy = -Math.abs(dy) * (0.85 + Math.random() * 0.15);
            if (now - lastBounceTime > 200) {
                var newAngle = (Math.random() - 0.5) * 80;
                var rad = (gameState.puckAngle || 0 + newAngle) * Math.PI / 180;
                dx = Math.cos(rad) * Math.abs(dy);
                dy = -Math.sin(rad) * Math.abs(dy);
                lastBounceTime = now;
                bounced = true;
            }
        }
        
        gameState.puckPosition = { x: posX, y: posY };
        
        puck.style.left = posX + 'px';
        puck.style.top = posY + 'px';
        
        // Случайное изменение направления для эффекта "рикошета"
        if (!bounced && Math.random() < 0.01) {
            var angleChange = (Math.random() - 0.5) * 40;
            var rad2 = (gameState.puckAngle || 0 + angleChange) * Math.PI / 180;
            var currentSpeed = Math.sqrt(dx * dx + dy * dy);
            dx = Math.cos(rad2) * currentSpeed;
            dy = Math.sin(rad2) * currentSpeed;
        }
        
        // Постепенное замедление
        if (steps > maxSteps * 0.6) {
            var slowdown = 0.998;
            dx *= slowdown;
            dy *= slowdown;
        }
        
        // Если скорость слишком маленькая, добавляем случайный импульс
        if (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3 && steps < maxSteps * 0.8) {
            dx += (Math.random() - 0.5) * 0.5;
            dy += (Math.random() - 0.5) * 0.5;
        }
        
        // Проверяем, остановилась ли шайба
        if (steps > maxSteps || (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1 && steps > 50)) {
            gameState.puckMoving = false;
            if (gameState._puckAnimationId) {
                cancelAnimationFrame(gameState._puckAnimationId);
                gameState._puckAnimationId = null;
            }
            determineWinnerZone(winnerZone);
            return;
        }
        
        gameState._puckAnimationId = requestAnimationFrame(animatePuck);
    }
    
    gameState._puckAnimationId = requestAnimationFrame(animatePuck);
    
    // Таймаут безопасности
    if (gameState.moveTimer) clearTimeout(gameState.moveTimer);
    gameState.moveTimer = setTimeout(function() {
        if (gameState.puckMoving) {
            gameState.puckMoving = false;
            if (gameState._puckAnimationId) {
                cancelAnimationFrame(gameState._puckAnimationId);
                gameState._puckAnimationId = null;
            }
            determineWinnerZone(winnerZone);
        }
    }, 8000);
}

function determineWinnerZone(winnerZone) {
    var zones = document.querySelectorAll('.arena-zone');
    if (!zones || zones.length === 0) return;
    
    // Подсвечиваем зону победителя
    zones.forEach(function(zone, index) {
        if (index === winnerZone) {
            zone.classList.add('winner-zone');
            zone.classList.add('highlight');
        }
    });
    
    // Показываем победителя
    var activePlayers = getActivePlayers();
    var winner = activePlayers[winnerZone];
    if (!winner) return;
    
    gameState.winner = winner;
    gameState.winnerZone = winnerZone;
    gameState.roundPhase = 'finished';
    gameState.isSpinning = false;
    gameState.isResultLoaded = true;
    
    var totalInTon = gameState.totalPoolTon + (gameState.totalPoolStars / TON_TO_STARS_RATE);
    
    // Скрываем шайбу
    var puck = document.getElementById('arenaPuck');
    if (puck) {
        puck.style.display = 'none';
        puck.classList.remove('sliding');
        puck.classList.remove('spinning');
    }
    
    var gameStatus = document.getElementById('gameStatus');
    if (gameStatus) gameStatus.style.display = 'none';
    
    // Сохраняем результат
    saveSpinResultToDB(winner, totalInTon, gameState.roundId, getActivePlayers(), winnerZone);
    syncRoomStateToDB();
    
    IceArenaRoomManager.notifyListeners('room_finished_modal', {
        winner_id: winner.userId,
        winner_name: winner.firstName,
        prize: totalInTon,
        roundId: gameState.roundId,
        winner_zone: winnerZone
    });
    
    showWinner(winner);
}

// ============================================================
// ПОБЕДИТЕЛЬ
// ============================================================

async function showWinner(winner) {
    if (!winner) return;
    
    var totalInTon = gameState.totalPoolTon + (gameState.totalPoolStars / TON_TO_STARS_RATE);
    
    var modal = document.getElementById('winnerModal');
    if (modal) {
        document.getElementById('winnerModalName').textContent = winner.firstName;
        document.getElementById('winnerModalPrize').innerHTML = totalInTon.toFixed(2) + ' <img src="assets/ton.png" alt="TON" class="winner-modal-icon-small">';
        document.getElementById('winnerModalZone').textContent = 'Зона ' + (gameState.winnerZone + 1);
        modal.classList.add('show');
    }
    
    var winnerSection = document.getElementById('winnerSection');
    if (winnerSection) {
        winnerSection.style.display = 'block';
        document.getElementById('winnerName').textContent = winner.firstName;
        document.getElementById('winnerPrize').innerHTML = totalInTon.toFixed(2) + ' <img src="assets/ton.png" alt="TON" class="winner-prize-icon">';
    }
    
    var user = tg.initDataUnsafe?.user;
    if (user && winner.userId === String(user.id) && totalInTon > 0) {
        if (UserManager) {
            var added = await UserManager.addWin(totalInTon, 'ton', 'Win in Ice Arena Round #' + gameState.roundId);
            if (added) {
                var updatedUser = UserManager.getUser();
                gameState.balance.ton = updatedUser.ton_balance;
                updateBalanceUI();
                if (window.betsApp && window.betsApp.refreshBalance) {
                    window.betsApp.refreshBalance();
                }
            }
        }
    }
    
    gameState.history.unshift({
        roundId: gameState.roundId,
        winner: winner.firstName,
        prize: totalInTon,
        zone: gameState.winnerZone + 1,
        players: getActivePlayers().length,
        timestamp: Date.now()
    });
    
    updateUI();
    updatePlayersList();
    await syncRoomStateToDB();
    
    setTimeout(function() {
        modal.classList.remove('show');
    }, 3000);
}

// ============================================================
// БАЛАНС
// ============================================================

function updateBalanceUI() {
    var user = getUserData();
    if (user) {
        gameState.balance.ton = user.ton_balance || 0;
        gameState.balance.stars = user.stars_balance || 0;
    }
    
    var tonEl = document.getElementById('arenaTonBalance');
    var starsEl = document.getElementById('arenaStarsBalance');
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
    updateBalanceUI();
}

// ============================================================
// ИСТОРИЯ
// ============================================================

async function loadHistoryFromDB() {
    try {
        var { data: lastRound, error: roundError } = await supabaseClient
            .from('ice_arena_rounds')
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
            .from('ice_arena_rounds')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (historyData) {
            gameState.history = historyData.map(function(round) {
                return {
                    roundId: round.round_number,
                    winner: round.winner_name,
                    prize: round.prize,
                    zone: round.winner_zone,
                    players: round.players_count,
                    timestamp: new Date(round.created_at).getTime()
                };
            });
        }
        
        var { data: topData, error: topError } = await supabaseClient
            .from('ice_arena_rounds')
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

async function saveRoundToDB(roundId, winnerName, prize, zone, playersCount, playerDetails) {
    try {
        var { data, error } = await supabaseClient
            .from('ice_arena_rounds')
            .insert({
                round_number: roundId,
                winner_name: winnerName,
                prize: prize,
                winner_zone: zone,
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
    updateFieldZones();
    
    updateHeaderInfo();
    updateTopGameDisplay();
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
    
    var totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
    
    list.innerHTML = activePlayers.map(function(player, index) {
        var isWinner = gameState.winner && gameState.winner.userId === player.userId;
        var betText = formatPlayerBets(player);
        var playerValue = calculatePlayerTotalValue(player);
        var share = totalValue > 0 && playerValue > 0 ? ((playerValue / totalValue) * 100).toFixed(1) + '%' : '0%';
        var color = player.color || ZONE_COLORS[index % ZONE_COLORS.length];
        
        return '<div class="player-row ' + (isWinner ? 'winner-row' : '') + '">' +
            '<div class="player-row-color" style="background-color: ' + color + '"></div>' +
            '<img src="' + getAvatarUrl(player) + '" alt="' + player.firstName + '" class="player-row-avatar">' +
            '<span class="player-row-name">' + player.firstName + (isWinner ? ' 👑' : '') + '</span>' +
            '<span class="player-row-bet">' + betText + '</span>' +
            '<span class="player-row-share">' + share + '</span>' +
            '</div>';
    }).join('');
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
    
    btn.disabled = isBetting || gameState.betAmount > max || gameState.betAmount < min || 
                    gameState.isSpinning || gameState.roundPhase === 'finished' || 
                    gameState._isPlacingBet;
    
    if (gameState._isPlacingBet) {
        btn.textContent = '⏳ Обработка...';
    } else if (isBetting) {
        btn.textContent = '⏳ Отправка...';
    } else if (gameState.isSpinning) {
        btn.textContent = '⏳ Шайба в движении...';
    } else if (gameState.roundPhase === 'finished') {
        btn.textContent = '⏳ Раунд завершен';
    } else {
        btn.textContent = 'Сделать ставку';
    }
}

function updateTimerUI() {
    var timerEl = document.getElementById('arenaTimer');
    if (timerEl) {
        timerEl.textContent = gameState.timeLeft;
        if (gameState.timeLeft <= 5) {
            timerEl.classList.add('warning');
        } else {
            timerEl.classList.remove('warning');
        }
        if (gameState.roundPhase === 'finished') {
            timerEl.classList.add('finished');
        } else {
            timerEl.classList.remove('finished');
        }
    }
    
    // Обновляем статус в центре
    var statusEl = document.getElementById('arenaStatus');
    if (statusEl) {
        if (gameState.roundPhase === 'waiting') {
            statusEl.textContent = 'Ожидание';
            statusEl.className = 'arena-status waiting';
        } else if (gameState.roundPhase === 'countdown') {
            statusEl.textContent = 'Скоро';
            statusEl.className = 'arena-status active';
        } else if (gameState.roundPhase === 'spinning') {
            statusEl.textContent = 'Вращение';
            statusEl.className = 'arena-status spinning';
        } else if (gameState.roundPhase === 'finished') {
            statusEl.textContent = 'Завершен';
            statusEl.className = 'arena-status';
        }
    }
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
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

function getActivePlayers() {
    return gameState.players.filter(function(p) { return p.bets && p.bets.length > 0; });
}

function getAvatarUrl(player) {
    if (!player) {
        return generateAvatarSVG('?', '#2c2c2e');
    }
    
    if (player.avatar && player.avatar !== '' && player.avatar !== 'assets/avatar.png') return player.avatar;
    if (player.photo_url && player.photo_url !== '') return player.photo_url;
    if (player.userId) {
        return 'https://t.me/i/userpic/320/' + player.userId + '.jpg';
    }
    
    var name = player.firstName || 'User';
    var initial = name.charAt(0).toUpperCase();
    var colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#a29bfe', '#fd79a8', '#fdcb6e', '#e17055', '#00cec9'];
    var color = colors[Math.floor(Math.random() * colors.length)];
    
    return generateAvatarSVG(initial, color);
}

function formatPlayerBets(player) {
    if (!player || !player.bets || player.bets.length === 0) return '0';
    
    var tonTotal = 0;
    var starsTotal = 0;
    
    player.bets.forEach(function(bet) {
        if (bet.currency === 'ton') {
            tonTotal += bet.amount;
        } else {
            starsTotal += bet.amount;
        }
    });
    
    var parts = [];
    if (tonTotal > 0) parts.push(tonTotal.toFixed(1) + ' TON');
    if (starsTotal > 0) parts.push(Math.floor(starsTotal) + ' Stars');
    
    return parts.join(' + ') || '0';
}

function calculateWinChance(player) {
    if (!player || !player.bets || player.bets.length === 0) return '0%';
    
    var playerValue = calculatePlayerTotalValue(player);
    var totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
    
    if (totalValue === 0 || playerValue === 0) return '0%';
    
    var chance = (playerValue / totalValue) * 100;
    return chance.toFixed(1) + '%';
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

function updateWheelImmediately() {
    updateFieldZones();
    updatePlayersList();
    updateUI();
    updateRoomStatus();
    console.log('🔄 Ice Arena field updated');
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
    gameState.winnerZone = null;
    gameState.isResultLoaded = false;
    gameState._isPlacingBet = false;
    gameState.puckMoving = false;
    gameState._usedColors = [];
    
    if (gameState.timer) clearInterval(gameState.timer);
    
    await syncRoomStateToDB();
    
    var timerEl = document.getElementById('arenaTimer');
    if (timerEl) {
        timerEl.textContent = ROUND_DURATION;
        timerEl.classList.remove('warning');
        timerEl.classList.remove('finished');
    }
    
    var statusEl = document.getElementById('arenaStatus');
    if (statusEl) {
        statusEl.textContent = 'Ожидание';
        statusEl.className = 'arena-status waiting';
    }
    
    var placeBtn = document.getElementById('placeBetBtn');
    if (placeBtn) {
        placeBtn.disabled = false;
        placeBtn.textContent = 'Сделать ставку';
    }
    
    var winnerModal = document.getElementById('winnerModal');
    if (winnerModal) winnerModal.classList.remove('show');
    var winnerSection = document.getElementById('winnerSection');
    if (winnerSection) winnerSection.style.display = 'none';
    var gameStatus = document.getElementById('gameStatus');
    if (gameStatus) gameStatus.style.display = 'none';
    var betSection = document.getElementById('betSection');
    if (betSection) betSection.style.display = 'block';
    
    var center = document.getElementById('arenaCenter');
    if (center) {
        center.style.display = 'flex';
    }
    
    var puck = document.getElementById('arenaPuck');
    if (puck) {
        puck.style.display = 'none';
        puck.classList.remove('sliding');
        puck.classList.remove('spinning');
    }
    
    document.querySelectorAll('.arena-zone').forEach(function(zone) {
        zone.classList.remove('winner-zone');
        zone.classList.remove('highlight');
    });
    
    updateUI();
    updateBetUI();
    updateTimerUI();
    updatePlaceBetButton();
    updateFieldZones();
}

function startCountdownFrom(timeLeft) {
    gameState.roundPhase = 'countdown';
    gameState.timeLeft = timeLeft || ROUND_DURATION;
    
    if (gameState.timer) clearInterval(gameState.timer);
    
    var timerEl = document.getElementById('arenaTimer');
    if (timerEl) {
        timerEl.textContent = gameState.timeLeft;
        timerEl.classList.remove('warning');
    }
    
    var statusEl = document.getElementById('arenaStatus');
    if (statusEl) {
        statusEl.textContent = 'Скоро';
        statusEl.className = 'arena-status active';
    }
    
    var placeBtn = document.getElementById('placeBetBtn');
    if (placeBtn) placeBtn.disabled = false;
    
    startForceResetTimer();
    
    gameState.timer = setInterval(function() {
        gameState.timeLeft--;
        updateTimerUI();
        
        if (gameState.timeLeft <= 5) {
            var timerEl = document.getElementById('arenaTimer');
            if (timerEl) timerEl.classList.add('warning');
        }
        
        if (gameState.timeLeft <= 0) {
            clearInterval(gameState.timer);
            clearForceResetTimer();
            startGame();
        }
    }, 1000);
    
    updateUI();
    updateFieldZones();
}

function startCountdown() {
    var activePlayers = getActivePlayers();
    if (activePlayers.length < MIN_PLAYERS) {
        startWaitingPhase();
        return;
    }
    
    startCountdownFrom(ROUND_DURATION);
}

// ============================================================
// ЗАПУСК ИГРЫ
// ============================================================

async function startGame() {
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
    
    // Выбираем победителя
    var winner = await selectWinnerOnServer();
    if (!winner) {
        tg.showAlert('❌ Ошибка выбора победителя');
        startWaitingPhase();
        return;
    }
    
    // Определяем зону победителя
    var winnerZone = activePlayers.indexOf(winner);
    if (winnerZone === -1) {
        winnerZone = Math.floor(Math.random() * activePlayers.length);
    }
    
    gameState.winner = winner;
    gameState.winnerZone = winnerZone;
    
    var totalInTon = gameState.totalPoolTon + (gameState.totalPoolStars / TON_TO_STARS_RATE);
    
    // Сохраняем результат
    await saveSpinResultToDB(winner, totalInTon, gameState.roundId, activePlayers, winnerZone);
    await syncRoomStateToDB();
    
    IceArenaRoomManager.notifyListeners('room_finished', {
        winner_id: winner.userId,
        winner_name: winner.firstName,
        prize: totalInTon,
        roundId: gameState.roundId,
        winner_zone: winnerZone,
        showModal: false
    });
    
    var placeBtn = document.getElementById('placeBetBtn');
    if (placeBtn) placeBtn.disabled = true;
    var betSection = document.getElementById('betSection');
    if (betSection) betSection.style.display = 'none';
    var gameStatus = document.getElementById('gameStatus');
    if (gameStatus) gameStatus.style.display = 'block';
    
    // Запускаем анимацию шайбы
    spawnPuck(winnerZone);
}

// ============================================================
// СТАВКА
// ============================================================

async function placeBet() {
    if (gameState._isPlacingBet) {
        console.log('⚠️ Already placing bet, ignoring...');
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
        tg.showAlert('⏳ Игра уже идет!');
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
    
    gameState._isPlacingBet = true;
    var placeBtn = document.getElementById('placeBetBtn');
    if (placeBtn) {
        placeBtn.disabled = true;
        placeBtn.textContent = '⏳ Обработка...';
    }
    
    try {
        // ШАГ 1: Атомарное списание баланса
        var balanceSuccess = false;
        if (UserManager) {
            if (currency === 'ton') {
                balanceSuccess = await UserManager.subtractTon(amount, 'Bet in Ice Arena');
            } else {
                balanceSuccess = await UserManager.subtractStars(amount, 'Bet in Ice Arena');
            }
            
            if (!balanceSuccess) {
                tg.showAlert('❌ Не удалось списать средства');
                gameState._isPlacingBet = false;
                if (placeBtn) {
                    placeBtn.disabled = false;
                    placeBtn.textContent = 'Сделать ставку';
                }
                return;
            }
            
            var updatedUser = UserManager.getUser();
            gameState.balance.ton = updatedUser.ton_balance;
            gameState.balance.stars = updatedUser.stars_balance;
            updateBalanceUI();
        }
        
        // ШАГ 2: Добавление ставки в комнату
        var roomSuccess = await IceArenaRoomManager.addBet(
            String(user.id),
            user.username || '',
            user.first_name || 'Игрок',
            user.photo_url || '',
            amount,
            currency
        );
        
        if (!roomSuccess) {
            // Откат: возвращаем средства, если ставка не засчитана
            console.warn('⚠️ Room add failed, rolling back...');
            tg.showAlert('❌ Не удалось разместить ставку. Средства возвращены.');
            if (UserManager) {
                if (currency === 'ton') {
                    await UserManager.addTon(amount, '', 'Rollback bet');
                } else {
                    await UserManager.addStars(amount, 'Rollback bet');
                }
                var rolledBackUser = UserManager.getUser();
                gameState.balance.ton = rolledBackUser.ton_balance;
                gameState.balance.stars = rolledBackUser.stars_balance;
                updateBalanceUI();
            }
            gameState._isPlacingBet = false;
            if (placeBtn) {
                placeBtn.disabled = false;
                placeBtn.textContent = 'Сделать ставку';
            }
            return;
        }
        
        // ШАГ 3: Обновляем локальное состояние
        await syncRoomData();
        
        // Находим или создаем игрока в локальном состоянии
        var player = gameState.players.find(function(p) { return p.userId === String(user.id); });
        if (!player) {
            var color = getUniqueColor();
            player = {
                userId: String(user.id),
                firstName: user.first_name || 'Игрок',
                username: user.username || 'user',
                avatar: user.photo_url || '',
                color: color,
                bets: []
            };
            gameState.players.push(player);
        }
        
        // Добавляем ставку в локальное состояние (только один раз!)
        player.bets.push({ amount: amount, currency: currency });
        
        // Обновляем total pool
        if (currency === 'ton') {
            gameState.totalPoolTon += amount;
        } else {
            gameState.totalPoolStars += amount;
        }
        
        await syncRoomStateToDB();
        
        updateUI();
        updateBetUI();
        updateTimerUI();
        updatePlaceBetButton();
        updatePlayersList();
        updateFieldZones();
        
        var activePlayers = getActivePlayers();
        if (activePlayers.length >= MIN_PLAYERS && gameState.roundPhase === 'waiting') {
            startCountdown();
        }
        
        gameState._isPlacingBet = false;
        if (placeBtn) {
            placeBtn.disabled = false;
            placeBtn.textContent = 'Сделать ставку';
        }
        
        tg.showAlert('✅ Ставка принята! ' + amount + ' ' + (currency === 'ton' ? 'TON' : 'Stars'));
        
    } catch (error) {
        console.error('❌ Place bet error:', error);
        tg.showAlert('❌ Ошибка при размещении ставки');
        gameState._isPlacingBet = false;
        if (placeBtn) {
            placeBtn.disabled = false;
            placeBtn.textContent = 'Сделать ставку';
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
    
    document.getElementById('arenaDepositBtn').addEventListener('click', function() {
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
        message += '#' + game.roundId + ' | ' + game.winner + ' +' + game.prize.toFixed(2) + ' TON | Зона ' + game.zone + ' | ' + timeStr + '\n';
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
// СИНХРОНИЗАЦИЯ ДАННЫХ
// ============================================================

async function syncRoomData() {
    if (isSyncing) {
        return;
    }
    
    var now = Date.now();
    if (now - gameState._lastSync < 500) {
        return;
    }
    gameState._lastSync = now;
    
    isSyncing = true;
    
    try {
        await IceArenaRoomManager.loadPlayers();
        
        var players = IceArenaRoomManager.getPlayers();
        var pool = IceArenaRoomManager.getPool();
        
        gameState.players = players.map(function(p) {
            return {
                userId: p.user_id,
                firstName: p.first_name,
                username: p.username,
                avatar: p.photo_url,
                color: p.color || getUniqueColor(),
                bets: p.bets || []
            };
        });
        
        gameState.totalPoolTon = pool.ton;
        gameState.totalPoolStars = pool.stars;
        
        updateUI();
        updatePlayersList();
        updateFieldZones();
        
    } catch (error) {
        console.error('Sync error:', error);
    } finally {
        isSyncing = false;
    }
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
                    var added = await UserManager.addTon(amount, '', 'Deposit from Ice Arena');
                    if (added) {
                        var updatedUser = UserManager.getUser();
                        gameState.balance.ton = updatedUser.ton_balance;
                        updateBalanceUI();
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
                            UserManager.addStars(amount, 'Deposit from Ice Arena').then(function(added) {
                                if (added) {
                                    var updatedUser = UserManager.getUser();
                                    gameState.balance.stars = updatedUser.stars_balance;
                                    updateBalanceUI();
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

window.iceArenaGame = {
    state: gameState,
    placeBet: placeBet,
    startNewRound: startNewRound,
    getActivePlayers: getActivePlayers,
    updateUI: updateUI,
    openDepositModal: openDepositModal,
    updateBalanceFromDB: updateBalanceFromDB,
    updateFieldZones: updateFieldZones,
    forceResetRound: forceResetRound,
    syncRoomStateToDB: syncRoomStateToDB
};

console.log('✅ Ice Arena game loaded');