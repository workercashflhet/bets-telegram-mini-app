// ============================================================
// PvP КОЛЕСО - ПОЛНАЯ ЛОГИКА С SUPABASE
// ============================================================

const tg = window.Telegram.WebApp;

// ============================================================
// SUPABASE КОНФИГУРАЦИЯ
// ============================================================
const SUPABASE_URL = 'https://siibxynvgrrsktyihuby.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpaWJ4eW52Z3Jyc2t0eWlodWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MDE0MzUsImV4cCI6MjEwMTI3NzQzNX0.k8bdNQPeB8lDkw_1XKVtFB-u3NjyHmyr2L7zE4mhN6I';

// Инициализация Supabase клиента
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// СОСТОЯНИЕ ИГРЫ
// ============================================================
const gameState = {
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

const TON_TO_STARS_RATE = 76;
const MIN_PLAYERS = 2;
const MIN_BET_TON = 0.1;
const MIN_BET_STARS = 10;
const ROUND_DURATION = 20;
const SPIN_DURATION = 5000;

let waitingSpinInterval = null;

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    tg.expand();
    tg.ready();
    tg.setBackgroundColor('#121216');
    tg.setHeaderColor('#121216');
    
    tg.BackButton.show();
    tg.BackButton.onClick(() => {
        window.location.href = 'index.html';
    });
    
    loadBalance();
    loadHistoryFromDB();
    initializePvPUser();
    setupUI();
    addDemoPlayers();
    startWaitingPhase();
    updateUI();
    
    // Скрытие клавиатуры при клике вне поля ввода
    document.addEventListener('click', function(e) {
        const input = document.getElementById('betInput');
        if (input && e.target !== input) {
            input.blur();
        }
    });
});

// ============================================================
// ИСТОРИЯ - РАБОТА С БД (SUPABASE)
// ============================================================

async function loadHistoryFromDB() {
    try {
        const { data: lastRound, error: roundError } = await supabaseClient
            .from('pvp_rounds')
            .select('round_number')
            .order('round_number', { ascending: false })
            .limit(1)
            .single();
        
        if (roundError && roundError.code !== 'PGRST116') {
            console.error('Error loading last round:', roundError);
        }
        
        if (lastRound) {
            gameState.roundId = lastRound.round_number;
        } else {
            gameState.roundId = 0;
        }
        
        const { data: historyData, error: historyError } = await supabaseClient
            .from('pvp_rounds')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        
        if (historyError) {
            console.error('Error loading history:', historyError);
        }
        
        if (historyData) {
            gameState.history = historyData.map(round => ({
                roundId: round.round_number,
                winner: round.winner_name,
                prize: round.prize,
                multiplier: round.multiplier,
                players: round.players_count,
                timestamp: new Date(round.created_at).getTime()
            }));
        }
        
        const { data: topData, error: topError } = await supabaseClient
            .from('pvp_rounds')
            .select('winner_name, prize, round_number')
            .order('prize', { ascending: false })
            .limit(1)
            .single();
        
        if (topError && topError.code !== 'PGRST116') {
            console.error('Error loading top game:', topError);
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
        console.error('Error loading history from DB:', error);
        gameState.roundId = 0;
        gameState.history = [];
        gameState.topGame = null;
    }
}

async function saveRoundToDB(roundId, winnerName, prize, multiplier, playersCount, playerDetails) {
    try {
        const { data, error } = await supabaseClient
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

async function updatePlayerStats(userId, username, firstName, totalBets, totalWins, totalPrize) {
    try {
        const { data: existing, error: checkError } = await supabaseClient
            .from('pvp_players')
            .select('id')
            .eq('user_id', userId)
            .single();
        
        if (checkError && checkError.code !== 'PGRST116') {
            console.error('Error checking player:', checkError);
            return;
        }
        
        if (existing) {
            const { error: updateError } = await supabaseClient
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
                console.error('Error updating player:', updateError);
            }
        } else {
            const { error: insertError } = await supabaseClient
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
                console.error('Error creating player:', insertError);
            }
        }
    } catch (error) {
        console.error('Error in updatePlayerStats:', error);
    }
}

async function loadPlayerStats(userId) {
    try {
        const { data, error } = await supabaseClient
            .from('pvp_players')
            .select('*')
            .eq('user_id', userId)
            .single();
        
        if (error && error.code !== 'PGRST116') {
            console.error('Error loading player stats:', error);
            return null;
        }
        
        return data;
    } catch (error) {
        console.error('Error in loadPlayerStats:', error);
        return null;
    }
}

// ============================================================
// ПОЛЬЗОВАТЕЛЬ
// ============================================================

function initializePvPUser() {
    const user = tg.initDataUnsafe?.user;
    
    const userNameDisplay = document.getElementById('pvpUserNameDisplay');
    const userAvatar = document.getElementById('pvpUserAvatar');
    
    if (user) {
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
        
        loadPlayerStats(user.id);
    } else {
        if (userNameDisplay) {
            userNameDisplay.textContent = 'Demo User';
        }
    }
}

// ============================================================
// БАЛАНС
// ============================================================

function loadBalance() {
    const saved = localStorage.getItem('bets_data');
    if (saved) {
        const data = JSON.parse(saved);
        gameState.balance.ton = data.balance || 0;
        gameState.balance.stars = data.inventory || 0;
    }
    updateBalanceUI();
    updatePvPBalanceUI();
}

function saveBalance() {
    localStorage.setItem('bets_data', JSON.stringify({
        balance: gameState.balance.ton,
        inventory: gameState.balance.stars
    }));
    updatePvPBalanceUI();
}

function updateBalanceUI() {
    const tonEl = document.getElementById('tonBalanceSmall');
    const starsEl = document.getElementById('starsBalanceSmall');
    if (tonEl) tonEl.textContent = gameState.balance.ton.toFixed(2);
    if (starsEl) starsEl.textContent = Math.floor(gameState.balance.stars);
}

function updatePvPBalanceUI() {
    const tonEl = document.getElementById('pvpTonBalance');
    const starsEl = document.getElementById('pvpStarsBalance');
    if (tonEl) tonEl.textContent = gameState.balance.ton.toFixed(2);
    if (starsEl) starsEl.textContent = Math.floor(gameState.balance.stars);
}

// ============================================================
// НАСТРОЙКА UI
// ============================================================

function setupUI() {
    document.getElementById('historyBtn').addEventListener('click', () => {
        showHistoryModal();
    });
    
    document.getElementById('chatBtn').addEventListener('click', () => {
        tg.showAlert('💬 Чат пока не доступен');
    });
    
    document.getElementById('pvpDepositBtn').addEventListener('click', () => {
        openDepositModal();
    });
    
    document.getElementById('betDec').addEventListener('click', () => {
        const step = gameState.selectedCurrency === 'ton' ? 0.1 : 25;
        const min = gameState.selectedCurrency === 'ton' ? MIN_BET_TON : MIN_BET_STARS;
        let newAmount = gameState.betAmount - step;
        if (newAmount < min) newAmount = min;
        gameState.betAmount = parseFloat(newAmount.toFixed(2));
        updateBetUI();
        updatePlaceBetButton();
        updateQuickBetButtons();
    });
    
    document.getElementById('betInc').addEventListener('click', () => {
        const step = gameState.selectedCurrency === 'ton' ? 0.1 : 25;
        const max = gameState.selectedCurrency === 'ton' ? gameState.balance.ton : gameState.balance.stars;
        let newAmount = gameState.betAmount + step;
        if (newAmount > max) newAmount = max;
        gameState.betAmount = parseFloat(newAmount.toFixed(2));
        updateBetUI();
        updatePlaceBetButton();
        updateQuickBetButtons();
    });
    
    // Обработка ввода суммы с точкой как разделителем
    const betInput = document.getElementById('betInput');
    betInput.addEventListener('input', function(e) {
        // Удаляем все символы кроме цифр и точки
        let value = this.value.replace(/[^0-9.]/g, '');
        
        // Проверяем, что только одна точка
        const parts = value.split('.');
        if (parts.length > 2) {
            value = parts[0] + '.' + parts.slice(1).join('');
        }
        
        // Если значение не пустое, обновляем
        if (value !== '' && value !== '.') {
            this.value = value;
            let val = parseFloat(value);
            if (!isNaN(val) && val >= 0) {
                const max = gameState.selectedCurrency === 'ton' ? gameState.balance.ton : gameState.balance.stars;
                const min = gameState.selectedCurrency === 'ton' ? MIN_BET_TON : MIN_BET_STARS;
                gameState.betAmount = Math.min(max, Math.max(min, val));
                updatePlaceBetButton();
                updateQuickBetButtons();
            }
        } else if (value === '.') {
            // Если пользователь ввел только точку, показываем "0."
            this.value = '0.';
            gameState.betAmount = 0;
        } else {
            // Если поле пустое, устанавливаем минимальное значение
            const min = gameState.selectedCurrency === 'ton' ? MIN_BET_TON : MIN_BET_STARS;
            gameState.betAmount = min;
            this.value = min;
            updatePlaceBetButton();
            updateQuickBetButtons();
        }
    });
    
    betInput.addEventListener('blur', function() {
        const min = gameState.selectedCurrency === 'ton' ? MIN_BET_TON : MIN_BET_STARS;
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
    
    document.getElementById('winnerModalBtn').addEventListener('click', () => {
        document.getElementById('winnerModal').classList.remove('show');
        startNewRound();
    });
    
    const newRoundBtn = document.getElementById('newRoundBtn');
    if (newRoundBtn) {
        newRoundBtn.addEventListener('click', () => {
            document.getElementById('winnerSection').style.display = 'none';
            startNewRound();
        });
    }
    
    document.querySelectorAll('.currency-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.currency-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            gameState.selectedCurrency = btn.dataset.currency;
            updateBetUI();
            updatePlaceBetButton();
            updateQuickBetButtons();
        });
    });
    
    // Настройка быстрых ставок
    setupQuickBets();
    
    // Закрытие модалки депозита по клику на крестик
    const depositModalClose = document.getElementById('depositModalClose');
    if (depositModalClose) {
        depositModalClose.addEventListener('click', closeDepositModal);
    }
    
    // Закрытие модалки по клику на оверлей
    const depositModal = document.getElementById('depositModal');
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
    
    const recentGames = gameState.history.slice(0, 10);
    let message = '📊 ПОСЛЕДНИЕ ИГРЫ\n\n';
    
    recentGames.forEach(game => {
        const date = new Date(game.timestamp);
        const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        message += `#${game.roundId} | ${game.winner} +${game.prize.toFixed(2)} TON | ×${game.multiplier.toFixed(1)} | ${timeStr}\n`;
    });
    
    if (gameState.topGame) {
        message += `\n🏆 ТОП ИГРА: #${gameState.topGame.roundId} | ${gameState.topGame.winner} +${gameState.topGame.prize.toFixed(2)} TON`;
    }
    
    tg.showAlert(message);
}

// ============================================================
// UI ОБНОВЛЕНИЯ
// ============================================================

function updateBetUI() {
    const input = document.getElementById('betInput');
    if (!input) return;
    
    let display;
    if (gameState.selectedCurrency === 'ton') {
        display = Math.round(gameState.betAmount * 10) / 10;
        display = display.toFixed(1);
    } else {
        display = Math.floor(gameState.betAmount);
    }
    input.value = display;
    
    // Обновляем иконки быстрых ставок при смене валюты
    updateQuickBetIcons();
    updateQuickBetButtons();
}

function updatePlaceBetButton() {
    const btn = document.getElementById('placeBetBtn');
    if (!btn) return;
    const max = gameState.selectedCurrency === 'ton' ? gameState.balance.ton : gameState.balance.stars;
    const min = gameState.selectedCurrency === 'ton' ? MIN_BET_TON : MIN_BET_STARS;
    btn.disabled = gameState.betAmount > max || gameState.betAmount < min || gameState.isSpinning || gameState.roundPhase === 'finished';
}

function updateHub(type, data) {
    const hubContent = document.getElementById('hubContent');
    const timerEl = document.querySelector('.hub-timer');
    const statusEl = document.querySelector('.hub-status');
    
    if (type === 'timer') {
        if (timerEl) {
            const activePlayers = getActivePlayers().length;
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
            hubContent.innerHTML = `
                <img src="${getAvatarUrl(data)}" alt="${data.firstName}" class="hub-avatar">
                <div class="hub-player-name">${data.firstName}</div>
            `;
        }
    }
}

function updateUI() {
    const totalInTon = gameState.totalPoolTon + (gameState.totalPoolStars / TON_TO_STARS_RATE);
    const poolEl = document.getElementById('poolTotal');
    if (poolEl) {
        poolEl.innerHTML = `${totalInTon.toFixed(2)} <img src="assets/ton.png" alt="TON" class="pool-icon">`;
    }
    
    const activePlayers = getActivePlayers();
    const playersCountEl = document.getElementById('playersCount');
    if (playersCountEl) playersCountEl.textContent = activePlayers.length;
    
    updateRoundDisplay();
    
    const list = document.getElementById('playersListCompact');
    if (list) {
        if (activePlayers.length === 0) {
            list.innerHTML = '<div class="no-players-compact">Нет игроков</div>';
        } else {
            list.innerHTML = activePlayers.map(player => {
                const isWinner = gameState.winner && gameState.winner.userId === player.userId;
                const betText = formatPlayerBets(player);
                const share = calculateWinChance(player);
                
                return `
                    <div class="player-row ${isWinner ? 'winner-row' : ''}">
                        <div class="player-row-color" style="background-color: ${player.color}"></div>
                        <img src="${getAvatarUrl(player)}" alt="${player.firstName}" class="player-row-avatar">
                        <span class="player-row-name">${player.firstName}${isWinner ? ' 👑' : ''}</span>
                        <span class="player-row-bet">${betText}</span>
                        <span class="player-row-share">${share}</span>
                    </div>
                `;
            }).join('');
        }
    }
    
    updateHeaderInfo();
    updateTopGameDisplay();
}

function updateHeaderInfo() {
    const prevGameText = document.getElementById('prevGameText');
    if (prevGameText) {
        if (gameState.history.length > 0) {
            const last = gameState.history[0];
            prevGameText.textContent = `${last.winner} +${last.prize.toFixed(2)}`;
            prevGameText.className = 'info-value win';
        } else {
            prevGameText.textContent = '—';
            prevGameText.className = 'info-value';
        }
    }
}

function updateTimerUI() {
    const timerText = document.getElementById('hubTimer');
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
    const roundEl = document.getElementById('roundNumber');
    if (roundEl) {
        roundEl.textContent = `#${gameState.roundId}`;
    }
}

function updateTopGameDisplay() {
    const topGameEl = document.getElementById('topGameText');
    if (topGameEl && gameState.topGame) {
        topGameEl.textContent = `${gameState.topGame.winner} +${gameState.topGame.prize.toFixed(2)}`;
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
    const wheel = document.getElementById('wheel');
    if (!wheel) return;
    
    // Добавляем класс для полосатого узора
    wheel.classList.add('waiting-pattern');
    
    // Добавляем класс для вращения
    wheel.classList.add('waiting-spin');
    
    // Убираем стандартный transition для плавного вращения
    wheel.style.transition = 'none';
}

function stopWaitingSpin() {
    const wheel = document.getElementById('wheel');
    if (!wheel) return;
    
    // Убираем классы
    wheel.classList.remove('waiting-pattern');
    wheel.classList.remove('waiting-spin');
    
    // Возвращаем transition
    wheel.style.transition = 'transform 5s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
}

// ============================================================
// БЫСТРЫЕ СТАВКИ
// ============================================================

function setupQuickBets() {
    const quickBtns = document.querySelectorAll('.quick-bet-btn');
    quickBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const amount = parseFloat(this.dataset.amount);
            if (isNaN(amount) || amount <= 0) return;
            
            // Проверяем, не превышает ли баланс
            const max = gameState.selectedCurrency === 'ton' ? gameState.balance.ton : gameState.balance.stars;
            const min = gameState.selectedCurrency === 'ton' ? MIN_BET_TON : MIN_BET_STARS;
            
            let finalAmount = amount;
            if (finalAmount > max) finalAmount = max;
            if (finalAmount < min) finalAmount = min;
            
            gameState.betAmount = parseFloat(finalAmount.toFixed(2));
            updateBetUI();
            updatePlaceBetButton();
            updateQuickBetButtons();
        });
    });
    
    // Обновляем иконки в кнопках быстрых ставок
    updateQuickBetIcons();
}

function updateQuickBetIcons() {
    const quickBtns = document.querySelectorAll('.quick-bet-btn');
    const isTon = gameState.selectedCurrency === 'ton';
    const iconSrc = isTon ? 'assets/ton.png' : 'assets/stars.png';
    const iconAlt = isTon ? 'TON' : 'Stars';
    
    quickBtns.forEach((btn, index) => {
        // Удаляем старую иконку
        const oldIcon = btn.querySelector('.quick-bet-icon');
        if (oldIcon) oldIcon.remove();
        
        // Создаем новую иконку
        const icon = document.createElement('img');
        icon.className = 'quick-bet-icon';
        icon.src = iconSrc;
        icon.alt = iconAlt;
        
        // Вставляем иконку перед текстом
        btn.prepend(icon);
        
        // Обновляем значения кнопок в зависимости от валюты
        const values = isTon ? [0.1, 0.5, 1.0] : [25, 50, 100];
        btn.dataset.amount = values[index] || values[0];
        
        // Обновляем отображаемый текст
        btn.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                node.textContent = values[index] || values[0];
            }
        });
    });
}

function updateQuickBetButtons() {
    const quickBtns = document.querySelectorAll('.quick-bet-btn');
    const tolerance = gameState.selectedCurrency === 'ton' ? 0.01 : 0.5;
    
    quickBtns.forEach(btn => {
        const amount = parseFloat(btn.dataset.amount);
        const isActive = Math.abs(gameState.betAmount - amount) < tolerance;
        btn.classList.toggle('active', isActive);
    });
}

// ============================================================
// ============================================================
// ДЕПОЗИТЫ (АДАПТИРОВАНЫ ПОД ТЕКУЩИЙ ПРОЕКТ)
// ============================================================

// Владелец кошелька для TON депозитов
const OWNER_WALLET = 'UQC5ZUl4Qobq69CgLi7tg-8y6aOwVilc5b82jJFZShtnetrw';

// Состояние депозита
const depositState = {
    amount: 0,
    currency: 'ton',
    step: 'input',
    error: null,
    isWalletConnected: false,
    isProcessing: false,
    tonConnectInitialized: false
};

// Проверка подключения кошелька
function checkWalletConnection() {
    const ui = window.TonConnectUI;
    if (ui && ui.wallet) {
        depositState.isWalletConnected = true;
        return true;
    }
    depositState.isWalletConnected = false;
    return false;
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ TON CONNECT (УПРОЩЕННАЯ)
// ============================================================

function initTonConnect() {
    const container = document.getElementById('ton-connect-container');
    if (!container) {
        console.warn('TonConnect container not found');
        return;
    }
    
    // Если уже есть кнопка, просто показываем контейнер
    if (depositState.tonConnectInitialized) {
        container.style.display = 'block';
        return;
    }
    
    // Проверяем, загружен ли TonConnectUI
    if (typeof TonConnectUI === 'undefined') {
        console.warn('TonConnectUI not loaded, waiting...');
        container.innerHTML = `
            <div style="text-align: center; padding: 8px; color: rgba(255,255,255,0.5); font-size: 13px;">
                ⏳ Загрузка TON кошелька...
            </div>
        `;
        container.style.display = 'block';
        
        // Ждем загрузки скрипта
        const checkInterval = setInterval(() => {
            if (typeof TonConnectUI !== 'undefined') {
                clearInterval(checkInterval);
                initTonConnect();
            }
        }, 500);
        setTimeout(() => clearInterval(checkInterval), 10000);
        return;
    }
    
    try {
        // Очищаем контейнер
        container.innerHTML = '';
        
        // СОЗДАЕМ КНОПКУ ВРУЧНУЮ (без использования TonConnectUI)
        const btn = document.createElement('button');
        btn.className = 'ton-connect-button';
        btn.textContent = '🔗 Подключить TON кошелек';
        btn.style.cssText = `
            background: #0ceb0f;
            color: #000000;
            border: none;
            border-radius: 12px;
            padding: 14px 24px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
            transition: all 0.3s ease;
            margin-bottom: 4px;
        `;
        btn.onmouseenter = function() { this.style.background = '#33ff36'; };
        btn.onmouseleave = function() { this.style.background = '#0ceb0f'; };
        btn.onclick = function() {
            connectTonWallet();
        };
        
        container.appendChild(btn);
        
        // Добавляем подпись
        const hint = document.createElement('p');
        hint.textContent = 'Подключите TON кошелек для пополнения';
        hint.style.cssText = 'font-size: 12px; color: rgba(255,255,255,0.35); margin-top: 8px; margin-bottom: 0;';
        container.appendChild(hint);
        
        container.style.display = 'block';
        depositState.tonConnectInitialized = true;
        
        console.log('TonConnect button rendered');
    } catch (error) {
        console.error('Error rendering TonConnect button:', error);
        container.innerHTML = `
            <div style="color: #ff6b6b; text-align: center; padding: 12px; font-size: 14px;">
                ⚠️ Ошибка загрузки TON кошелька
            </div>
        `;
        container.style.display = 'block';
    }
}

function connectTonWallet() {
    try {
        let ui = window.TonConnectUI;
        
        if (!ui && typeof TonConnectUI !== 'undefined') {
            const manifestUrl = 'https://bets-telegram-mini-app.vercel.app/tonconnect-manifest.json';
            ui = new TonConnectUI({
                manifestUrl: manifestUrl
            });
            window.TonConnectUI = ui;
            
            ui.onStatusChange((wallet) => {
                if (wallet) {
                    depositState.isWalletConnected = true;
                    updateDepositModalUI();
                    tg.showAlert('✅ TON кошелек успешно подключен!');
                } else {
                    depositState.isWalletConnected = false;
                }
            });
        }
        
        if (ui) {
            ui.openModal();
        } else {
            tg.showAlert('❌ TON кошелек временно недоступен. Попробуйте позже.');
        }
    } catch (error) {
        console.error('Error connecting wallet:', error);
        tg.showAlert('❌ Ошибка подключения кошелька. Попробуйте снова.');
    }
}

// ============================================================
// ФУНКЦИЯ ДЛЯ ОБНОВЛЕНИЯ UI ДЕПОЗИТА
// ============================================================

function updateDepositModalUI() {
    const modal = document.getElementById('depositModal');
    if (!modal) return;
    
    const titleEl = document.getElementById('depositModalTitle');
    const bodyEl = document.getElementById('depositModalBody');
    const footerEl = document.getElementById('depositModalFooter');
    const tonContainer = document.getElementById('ton-connect-container');
    
    if (!titleEl || !bodyEl || !footerEl) return;
    
    const isWalletConnected = checkWalletConnection();
    
    if (depositState.step === 'input') {
        titleEl.textContent = 'Пополнение баланса';
        
        // Управление контейнером TonConnect
        if (tonContainer) {
            if (depositState.currency === 'ton' && !isWalletConnected) {
                tonContainer.style.display = 'block';
                // Инициализируем кнопку
                initTonConnect();
            } else {
                tonContainer.style.display = 'none';
            }
        }
        
        bodyEl.innerHTML = `
            <div class="deposit-currency-toggle">
                <button class="deposit-currency-btn ${depositState.currency === 'ton' ? 'active' : ''}" data-currency="ton">
                    <img src="assets/ton.png" alt="TON" class="deposit-currency-icon"> TON
                </button>
                <button class="deposit-currency-btn ${depositState.currency === 'stars' ? 'active' : ''}" data-currency="stars">
                    <img src="assets/stars.png" alt="Stars" class="deposit-currency-icon"> Stars
                </button>
            </div>
            <div class="deposit-balance-info">
                Ваш баланс: ${depositState.currency === 'ton' ? 
                    `${gameState.balance.ton.toFixed(1)} TON` : 
                    `${gameState.balance.stars.toFixed(0)} Stars`}
            </div>
            <input type="number" class="deposit-input" id="depositAmountInput" 
                   placeholder="Введите сумму в ${depositState.currency === 'ton' ? 'TON' : 'Stars'}" min="0">
            ${depositState.error ? `<div class="deposit-error">${depositState.error}</div>` : ''}
        `;
        footerEl.innerHTML = `
            <button class="deposit-button" id="depositConfirmBtn">
                ${depositState.currency === 'ton' ? `Пополнить TON` : `Оплатить Stars`}
            </button>
            <button class="deposit-cancel-btn" id="depositCancelBtn">Отмена</button>
        `;
        
        setTimeout(() => {
            document.querySelectorAll('.deposit-currency-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    depositState.currency = this.dataset.currency;
                    depositState.error = null;
                    depositState.tonConnectInitialized = false;
                    updateDepositModalUI();
                });
            });
            
            const confirmBtn = document.getElementById('depositConfirmBtn');
            if (confirmBtn) {
                confirmBtn.addEventListener('click', handleDepositConfirm);
            }
            
            const cancelBtn = document.getElementById('depositCancelBtn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', closeDepositModal);
            }
            
            const amountInput = document.getElementById('depositAmountInput');
            if (amountInput) {
                amountInput.addEventListener('input', function() {
                    depositState.amount = parseFloat(this.value) || 0;
                });
            }
        }, 50);
        
    } else if (depositState.step === 'sending') {
        if (tonContainer) tonContainer.style.display = 'none';
        titleEl.textContent = depositState.currency === 'ton' ? 'Подтверждение в кошельке' : 'Оплата Stars...';
        bodyEl.innerHTML = `
            <div class="deposit-sending">
                <div class="deposit-spinner"></div>
                <p>${depositState.currency === 'ton' 
                    ? 'Пожалуйста, подтвердите транзакцию в вашем TON кошельке...' 
                    : 'Открытие счета для оплаты Stars...'}</p>
            </div>
        `;
        footerEl.innerHTML = '';
        
    } else if (depositState.step === 'success') {
        if (tonContainer) tonContainer.style.display = 'none';
        titleEl.textContent = 'Успешно!';
        bodyEl.innerHTML = `
            <div class="deposit-success">
                <p>Пополнено ${depositState.amount} ${depositState.currency === 'ton' ? 'TON' : 'Stars'}</p>
                <p>Ваш баланс обновлен</p>
            </div>
        `;
        footerEl.innerHTML = `
            <button class="deposit-close-btn" id="depositCloseBtn">Закрыть</button>
        `;
        
        setTimeout(() => {
            const closeBtn = document.getElementById('depositCloseBtn');
            if (closeBtn) {
                closeBtn.addEventListener('click', closeDepositModal);
            }
        }, 50);
    }
}

// ============================================================
// ОБРАБОТЧИК ПОДТВЕРЖДЕНИЯ ДЕПОЗИТА
// ============================================================

async function handleDepositConfirm() {
    if (depositState.isProcessing) return;
    
    const amount = depositState.amount;
    const currency = depositState.currency;
    
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
            const isConnected = checkWalletConnection();
            if (!isConnected) {
                depositState.error = 'Пожалуйста, подключите TON кошелек';
                depositState.step = 'input';
                depositState.isProcessing = false;
                depositState.tonConnectInitialized = false;
                updateDepositModalUI();
                return;
            }
            
            const tonConnectUI = window.TonConnectUI;
            if (tonConnectUI) {
                try {
                    await tonConnectUI.sendTransaction({
                        validUntil: Math.floor(Date.now() / 1000) + 300,
                        messages: [
                            {
                                address: OWNER_WALLET,
                                amount: (amount * 1_000_000_000).toString(),
                            },
                        ],
                    });
                } catch (txError) {
                    console.error('Transaction error:', txError);
                    if (txError.message?.includes('cancelled') || txError.message?.includes('rejected')) {
                        depositState.error = 'Транзакция отменена';
                    } else if (txError.message?.includes('insufficient')) {
                        depositState.error = 'Недостаточно средств на кошельке';
                    } else {
                        depositState.error = 'Транзакция не удалась. Попробуйте снова.';
                    }
                    depositState.step = 'input';
                    depositState.isProcessing = false;
                    updateDepositModalUI();
                    return;
                }
            } else {
                await simulateTonTransaction(amount);
            }
            
            depositState.step = 'success';
            depositState.isProcessing = false;
            updateDepositModalUI();
            depositToBalance(amount, 'ton');
            
        } else if (currency === 'stars') {
            const tg = window.Telegram?.WebApp;
            if (!tg) {
                depositState.error = 'Telegram WebApp не доступен';
                depositState.step = 'input';
                depositState.isProcessing = false;
                updateDepositModalUI();
                return;
            }
            
            const starsAmount = Math.floor(amount);
            
            try {
                const response = await fetch('/api/create-invoice', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount: starsAmount })
                });
                
                const data = await response.json();
                
                if (!data.success || !data.invoiceLink) {
                    throw new Error(data.error || 'Не удалось создать счет');
                }
                
                tg.openInvoice(data.invoiceLink, (status) => {
                    depositState.isProcessing = false;
                    
                    if (status === 'paid') {
                        depositState.step = 'success';
                        updateDepositModalUI();
                        depositToBalance(amount, 'stars');
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
// СИМУЛЯЦИЯ TON ТРАНЗАКЦИИ (ДЛЯ ТЕСТОВ)
// ============================================================

async function simulateTonTransaction(amount) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, 1500);
    });
}

// ============================================================
// ПОПОЛНЕНИЕ БАЛАНСА
// ============================================================

function depositToBalance(amount, currency) {
    if (depositState.step !== 'success') {
        console.warn('Попытка пополнения без подтверждения оплаты');
        return;
    }
    
    if (currency === 'ton') {
        gameState.balance.ton += amount;
    } else {
        gameState.balance.stars += amount;
    }
    saveBalance();
    updatePvPBalanceUI();
    
    const tonEl = document.getElementById('pvpTonBalance');
    const starsEl = document.getElementById('pvpStarsBalance');
    if (tonEl) tonEl.textContent = gameState.balance.ton.toFixed(2);
    if (starsEl) starsEl.textContent = Math.floor(gameState.balance.stars);
    
    tg.showAlert(`✅ ${amount} ${currency === 'ton' ? 'TON' : 'Stars'} успешно пополнены!`);
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
    depositState.tonConnectInitialized = false;
    
    const modal = document.getElementById('depositModal');
    if (modal) {
        modal.classList.add('show');
        updateDepositModalUI();
    }
}

function closeDepositModal() {
    const modal = document.getElementById('depositModal');
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
    return gameState.players.filter(p => p.bets && p.bets.length > 0);
}

function addDemoPlayers() {
    const user = tg.initDataUnsafe?.user;
    
    const demoPlayers = [
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
    
    // Запускаем вращение колеса в режиме ожидания
    startWaitingSpin();
    
    updateHub('timer', ROUND_DURATION);
    updateHub('status', 'Ожидание');
    
    const placeBtn = document.getElementById('placeBetBtn');
    if (placeBtn) placeBtn.disabled = false;
    
    const winnerModal = document.getElementById('winnerModal');
    if (winnerModal) winnerModal.classList.remove('show');
    
    const winnerSection = document.getElementById('winnerSection');
    if (winnerSection) winnerSection.style.display = 'none';
    
    const spinningStatus = document.getElementById('spinningStatus');
    if (spinningStatus) spinningStatus.style.display = 'none';
    
    const betSection = document.getElementById('betSection');
    if (betSection) betSection.style.display = 'block';
    
    updateUI();
    updateBetUI();
    updateTimerUI();
    updatePlaceBetButton();
}

function startCountdown() {
    const activePlayers = getActivePlayers();
    if (activePlayers.length < MIN_PLAYERS) {
        startWaitingPhase();
        return;
    }
    
    // Останавливаем вращение в режиме ожидания
    stopWaitingSpin();
    
    gameState.roundPhase = 'countdown';
    gameState.timeLeft = ROUND_DURATION;
    
    if (gameState.timer) clearInterval(gameState.timer);
    
    updateHub('timer', ROUND_DURATION);
    updateHub('status', 'До вращения');
    
    const placeBtn = document.getElementById('placeBetBtn');
    if (placeBtn) placeBtn.disabled = false;
    
    gameState.timer = setInterval(() => {
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
// СТАВКИ
// ============================================================

function placeBet() {
    const user = tg.initDataUnsafe?.user;
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
    
    const currency = gameState.selectedCurrency;
    const amount = gameState.betAmount;
    const max = currency === 'ton' ? gameState.balance.ton : gameState.balance.stars;
    const min = currency === 'ton' ? MIN_BET_TON : MIN_BET_STARS;
    
    if (amount > max) {
        tg.showAlert('❌ Недостаточно средств!');
        return;
    }
    
    if (amount < min) {
        tg.showAlert(`❌ Минимальная ставка: ${min} ${currency === 'ton' ? 'TON' : 'Stars'}`);
        return;
    }
    
    let player = gameState.players.find(p => p.userId === user.id);
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
    
    player.bets.push({ amount, currency });
    gameState.playerBets.push({ amount, currency });
    
    if (currency === 'ton') {
        gameState.totalPoolTon += amount;
        gameState.balance.ton -= amount;
    } else {
        gameState.totalPoolStars += amount;
        gameState.balance.stars -= amount;
    }
    
    saveBalance();
    updateBalanceUI();
    
    const activePlayers = getActivePlayers();
    if (activePlayers.length >= MIN_PLAYERS && (gameState.roundPhase === 'waiting' || gameState.roundPhase === 'countdown')) {
        startCountdown();
    }
    
    updateUI();
    updateBetUI();
    updateTimerUI();
    updatePlaceBetButton();
    
    tg.showAlert(`✅ Ставка ${amount} ${currency === 'ton' ? 'TON' : 'Stars'} принята!`);
}

// ============================================================
// ВРАЩЕНИЕ КОЛЕСА
// ============================================================

function startSpin() {
    const activePlayers = getActivePlayers();
    if (activePlayers.length < MIN_PLAYERS) {
        tg.showAlert(`❌ Недостаточно игроков! Нужно минимум ${MIN_PLAYERS}.`);
        startWaitingPhase();
        return;
    }
    
    gameState.roundPhase = 'spinning';
    gameState.isSpinning = true;
    gameState.roundId++;
    updateRoundDisplay();
    
    const placeBtn = document.getElementById('placeBetBtn');
    if (placeBtn) placeBtn.disabled = true;
    
    const betSection = document.getElementById('betSection');
    if (betSection) betSection.style.display = 'none';
    
    const spinningStatus = document.getElementById('spinningStatus');
    if (spinningStatus) spinningStatus.style.display = 'block';
    
    updateHub('status', 'ИГРА');
    
    createWheelSegments();
    
    const winner = selectWinner();
    gameState.winner = winner;
    
    const spins = 5 + Math.random() * 5;
    const targetAngle = 360 * spins + (Math.random() * 360);
    gameState.rotationAngle += targetAngle;
    
    const wheel = document.getElementById('wheel');
    if (wheel) {
        wheel.style.transform = `rotate(${gameState.rotationAngle}deg)`;
        wheel.classList.add('spinning');
    }
    
    updateHub('avatar', winner);
    
    gameState.spinTimer = setTimeout(() => {
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
    const wheel = document.getElementById('wheel');
    const activePlayers = getActivePlayers();
    
    if (!wheel) return;
    
    if (activePlayers.length === 0) {
        wheel.innerHTML = '<div style="width:100%;height:100%;border-radius:50%;background:#1a1a2e;"></div>';
        return;
    }
    
    const totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
    let startAngle = 0;
    let segmentsHTML = '';
    
    activePlayers.forEach((player) => {
        const playerValue = (player.bets.filter(b => b.currency === 'ton').reduce((s, b) => s + b.amount, 0) * TON_TO_STARS_RATE) +
                          player.bets.filter(b => b.currency === 'stars').reduce((s, b) => s + b.amount, 0);
        const angle = totalValue > 0 ? (playerValue / totalValue) * 360 : 360 / activePlayers.length;
        const midAngle = startAngle + angle / 2;
        
        segmentsHTML += `
            <div class="wheel-avatar-container" style="transform: rotate(${midAngle}deg);">
                <div class="avatar-position">
                    <img src="${getAvatarUrl(player)}" alt="${player.firstName}" class="wheel-player-avatar">
                </div>
            </div>
        `;
        
        startAngle += angle;
    });
    
    const gradientColors = activePlayers.map((player, index) => {
        const playerValue = (player.bets.filter(b => b.currency === 'ton').reduce((s, b) => s + b.amount, 0) * TON_TO_STARS_RATE) +
                          player.bets.filter(b => b.currency === 'stars').reduce((s, b) => s + b.amount, 0);
        const angle = totalValue > 0 ? (playerValue / totalValue) * 360 : 360 / activePlayers.length;
        const startPercent = (index / activePlayers.length) * 100;
        const endPercent = ((index + 1) / activePlayers.length) * 100;
        return `${player.color} ${startPercent}% ${endPercent}%`;
    });
    
    const gradient = `conic-gradient(from 0deg, ${gradientColors.join(', ')})`;
    
    wheel.innerHTML = `
        <div style="width:100%;height:100%;border-radius:50%;background:${gradient};position:relative;">
            ${segmentsHTML}
        </div>
    `;
}

// ============================================================
// ПОБЕДИТЕЛЬ
// ============================================================

function selectWinner() {
    const activePlayers = getActivePlayers();
    const totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
    
    if (totalValue === 0) {
        return activePlayers[Math.floor(Math.random() * activePlayers.length)];
    }
    
    let random = Math.random() * totalValue;
    let cumulative = 0;
    
    for (const player of activePlayers) {
        const playerValue = (player.bets.filter(b => b.currency === 'ton').reduce((s, b) => s + b.amount, 0) * TON_TO_STARS_RATE) +
                          player.bets.filter(b => b.currency === 'stars').reduce((s, b) => s + b.amount, 0);
        cumulative += playerValue;
        if (random <= cumulative) {
            return player;
        }
    }
    
    return activePlayers[0];
}

async function showWinner(winner) {
    const modal = document.getElementById('winnerModal');
    if (!modal) return;
    
    const totalInTon = gameState.totalPoolTon + (gameState.totalPoolStars / TON_TO_STARS_RATE);
    const playerValue = (winner.bets.filter(b => b.currency === 'ton').reduce((s, b) => s + b.amount, 0) * TON_TO_STARS_RATE) +
                       winner.bets.filter(b => b.currency === 'stars').reduce((s, b) => s + b.amount, 0);
    const totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
    const multiplier = totalValue > 0 && playerValue > 0 ? totalValue / playerValue : 0;
    
    const nameEl = document.getElementById('winnerModalName');
    const roundEl = document.getElementById('winnerModalRound');
    const prizeEl = document.getElementById('winnerModalPrize');
    const multiEl = document.getElementById('winnerModalMultiplier');
    
    if (nameEl) nameEl.textContent = winner.firstName;
    if (roundEl) roundEl.textContent = `#${String(gameState.roundId).padStart(4, '0')}`;
    if (prizeEl) prizeEl.innerHTML = `${totalInTon.toFixed(2)} <img src="assets/ton.png" alt="TON" class="winner-modal-icon-small">`;
    if (multiEl) multiEl.textContent = `×${multiplier.toFixed(1)}`;
    
    const playerDetails = getActivePlayers().map(p => ({
        name: p.firstName,
        bets: p.bets,
        share: calculateWinChance(p)
    }));
    
    const savedRound = await saveRoundToDB(
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
        
        const user = tg.initDataUnsafe?.user;
        if (user) {
            const stats = await loadPlayerStats(user.id);
            const totalBets = (stats?.total_bets || 0) + gameState.playerBets.length;
            const totalWins = (stats?.total_wins || 0) + (winner.userId === user.id ? 1 : 0);
            const totalPrize = (stats?.total_prize || 0) + (winner.userId === user.id ? totalInTon : 0);
            
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
// НОВЫЙ РАУНД
// ============================================================

function startNewRound() {
    if (gameState.timer) clearInterval(gameState.timer);
    if (gameState.spinTimer) clearTimeout(gameState.spinTimer);
    
    gameState.players.forEach(p => p.bets = []);
    gameState.playerBets = [];
    gameState.totalPoolTon = 0;
    gameState.totalPoolStars = 0;
    gameState.winner = null;
    gameState.isSpinning = false;
    
    // Восстанавливаем центр
    const hubContent = document.getElementById('hubContent');
    if (hubContent) {
        hubContent.innerHTML = `
            <div class="hub-timer" id="hubTimer">20</div>
            <div class="hub-status" id="hubStatus">Ожидание</div>
        `;
    }
    
    const winnerModal = document.getElementById('winnerModal');
    if (winnerModal) winnerModal.classList.remove('show');
    
    const winnerSection = document.getElementById('winnerSection');
    if (winnerSection) winnerSection.style.display = 'none';
    
    const spinningStatus = document.getElementById('spinningStatus');
    if (spinningStatus) spinningStatus.style.display = 'none';
    
    const betSection = document.getElementById('betSection');
    if (betSection) betSection.style.display = 'block';
    
    const placeBtn = document.getElementById('placeBetBtn');
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
    const tonTotal = player.bets.filter(b => b.currency === 'ton').reduce((s, b) => s + b.amount, 0);
    const starsTotal = player.bets.filter(b => b.currency === 'stars').reduce((s, b) => s + b.amount, 0);
    const parts = [];
    if (tonTotal > 0) parts.push(`${tonTotal.toFixed(1)} TON`);
    if (starsTotal > 0) parts.push(`${Math.floor(starsTotal)} Stars`);
    return parts.join(' + ') || '0';
}

function calculateWinChance(player) {
    if (!player || !player.bets) return '0%';
    const tonBets = player.bets.filter(b => b.currency === 'ton').reduce((s, b) => s + b.amount, 0);
    const starsBets = player.bets.filter(b => b.currency === 'stars').reduce((s, b) => s + b.amount, 0);
    const playerValue = (tonBets * TON_TO_STARS_RATE) + starsBets;
    const totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
    if (totalValue === 0) return '0%';
    return `${((playerValue / totalValue) * 100).toFixed(1)}%`;
}

function getAvatarUrl(player) {
    if (!player) return '';
    if (player.avatar) return player.avatar;
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.userId}`;
}

function getRandomColor() {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#a29bfe', '#fd79a8', '#fdcb6e', '#e17055', '#00cec9'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// ============================================================
// ЭКСПОРТ
// ============================================================

window.pvpGame = {
    state: gameState,
    placeBet,
    startNewRound,
    getActivePlayers,
    updateUI
};