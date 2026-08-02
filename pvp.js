// ============================================================
// PvP КОЛЕСО - НОВАЯ ЛОГИКА
// ============================================================

const tg = window.Telegram.WebApp;

// Состояние игры
const gameState = {
    players: [],
    totalPoolTon: 0,
    totalPoolStars: 0,
    betAmount: 1,
    selectedCurrency: 'ton',
    balance: { ton: 0.00, stars: 0 },
    playerBets: [],
    roundPhase: 'waiting', // waiting | spinning | finished
    timeLeft: 20,
    timer: null,
    isSpinning: false,
    rotationAngle: 0,
    winner: null,
    roundId: 0,
    spinTimer: null,
    history: [],
    topGame: null
};

const TON_TO_STARS_RATE = 76;
const MIN_PLAYERS = 2;
const MIN_BET_TON = 0.1;
const MIN_BET_STARS = 10;
const ROUND_DURATION = 20;
const SPIN_DURATION = 5000;

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    tg.expand();
    tg.ready();
    tg.setBackgroundColor('#121216');
    tg.setHeaderColor('#121216');
    
    loadBalance();
    setupUI();
    addDemoPlayers();
    startWaitingPhase();
    updateUI();
});

// Загрузка баланса
function loadBalance() {
    const saved = localStorage.getItem('bets_data');
    if (saved) {
        const data = JSON.parse(saved);
        gameState.balance.ton = data.balance || 0;
        gameState.balance.stars = data.inventory || 0;
    }
    updateBalanceUI();
}

function saveBalance() {
    localStorage.setItem('bets_data', JSON.stringify({
        balance: gameState.balance.ton,
        inventory: gameState.balance.stars
    }));
}

// Обновление баланса
function updateBalanceUI() {
    document.getElementById('tonBalanceSmall').textContent = gameState.balance.ton.toFixed(2);
    document.getElementById('starsBalanceSmall').textContent = Math.floor(gameState.balance.stars);
}

// Настройка UI
function setupUI() {
    // История
    document.getElementById('historyBtn').addEventListener('click', () => {
        tg.showAlert('📊 История игр пока не доступна');
    });
    
    // Чат
    document.getElementById('chatBtn').addEventListener('click', () => {
        tg.showAlert('💬 Чат пока не доступен');
    });
    
    // Депозит
    document.getElementById('depositBtnSmall').addEventListener('click', () => {
        tg.showPopup({
            title: '💰 Депозит',
            message: 'Выберите способ пополнения',
            buttons: [
                { id: 'crypto', text: 'Криптовалюта' },
                { id: 'card', text: 'Банковская карта' },
                { id: 'cancel', text: 'Отмена', type: 'cancel' }
            ]
        }, (buttonId) => {
            if (buttonId === 'crypto') tg.showAlert('💰 Пополните баланс через криптовалюту');
            else if (buttonId === 'card') tg.showAlert('💳 Пополните баланс через банковскую карту');
        });
    });
    
    // Переключение валюты
    document.querySelectorAll('.currency-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.currency-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            gameState.selectedCurrency = btn.dataset.currency;
            updateBetUI();
        });
    });
    
    // Регулировка ставки
    document.getElementById('betDec').addEventListener('click', () => {
        const step = gameState.selectedCurrency === 'ton' ? 0.1 : 1;
        const min = gameState.selectedCurrency === 'ton' ? MIN_BET_TON : MIN_BET_STARS;
        gameState.betAmount = Math.max(min, gameState.betAmount - step);
        updateBetUI();
    });
    
    document.getElementById('betInc').addEventListener('click', () => {
        const step = gameState.selectedCurrency === 'ton' ? 0.1 : 1;
        const max = gameState.selectedCurrency === 'ton' ? gameState.balance.ton : gameState.balance.stars;
        gameState.betAmount = Math.min(max, gameState.betAmount + step);
        updateBetUI();
    });
    
    document.getElementById('betInput').addEventListener('change', (e) => {
        let val = parseFloat(e.target.value);
        if (isNaN(val) || val < 0) val = 0;
        const max = gameState.selectedCurrency === 'ton' ? gameState.balance.ton : gameState.balance.stars;
        const min = gameState.selectedCurrency === 'ton' ? MIN_BET_TON : MIN_BET_STARS;
        gameState.betAmount = Math.min(max, Math.max(min, val));
        updateBetUI();
    });
    
    // Кнопка ставки
    document.getElementById('placeBetBtn').addEventListener('click', placeBet);
    
    // Кнопка нового раунда
    document.getElementById('winnerModalBtn').addEventListener('click', () => {
        document.getElementById('winnerModal').classList.remove('show');
        startNewRound();
    });
}

// Обновление UI ставки
function updateBetUI() {
    const input = document.getElementById('betInput');
    const display = gameState.selectedCurrency === 'ton' ? 
        gameState.betAmount.toFixed(1) : 
        Math.floor(gameState.betAmount);
    input.value = display;
    
    const max = gameState.selectedCurrency === 'ton' ? gameState.balance.ton : gameState.balance.stars;
    const min = gameState.selectedCurrency === 'ton' ? MIN_BET_TON : MIN_BET_STARS;
    const btn = document.getElementById('placeBetBtn');
    btn.disabled = gameState.betAmount > max || gameState.betAmount < min || gameState.isSpinning || gameState.roundPhase === 'finished';
}

// Добавление демо-игроков
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

// Фаза ожидания
function startWaitingPhase() {
    gameState.roundPhase = 'waiting';
    gameState.timeLeft = ROUND_DURATION;
    gameState.isSpinning = false;
    
    if (gameState.timer) clearInterval(gameState.timer);
    
    updateHub('timer', ROUND_DURATION);
    updateHub('status', 'Ожидание');
    
    document.getElementById('placeBetBtn').disabled = false;
    document.getElementById('winnerModal').classList.remove('show');
    
    updateUI();
    updateBetUI();
}

// Фаза обратного отсчета
function startCountdown() {
    const activePlayers = getActivePlayers();
    if (activePlayers.length < MIN_PLAYERS) {
        startWaitingPhase();
        return;
    }
    
    gameState.roundPhase = 'waiting';
    gameState.timeLeft = ROUND_DURATION;
    
    if (gameState.timer) clearInterval(gameState.timer);
    
    updateHub('timer', ROUND_DURATION);
    updateHub('status', 'Ожидание');
    
    gameState.timer = setInterval(() => {
        gameState.timeLeft--;
        updateHub('timer', gameState.timeLeft);
        
        if (gameState.timeLeft <= 5) {
            document.querySelector('.hub-timer').classList.add('warning');
        }
        
        if (gameState.timeLeft <= 0) {
            clearInterval(gameState.timer);
            startSpin();
        }
    }, 1000);
    
    updateUI();
}

// Получение активных игроков
function getActivePlayers() {
    return gameState.players.filter(p => p.bets.length > 0);
}

// Размещение ставки
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
    
    // Проверяем количество игроков для запуска таймера
    const activePlayers = getActivePlayers();
    if (activePlayers.length >= MIN_PLAYERS && gameState.roundPhase === 'waiting') {
        startCountdown();
    }
    
    updateUI();
    updateBetUI();
    
    tg.showAlert(`✅ Ставка ${amount} ${currency === 'ton' ? 'TON' : 'Stars'} принята!`);
}

// Запуск вращения
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
    
    document.getElementById('placeBetBtn').disabled = true;
    updateHub('status', 'ИГРА');
    
    // Создаем сегменты
    createWheelSegments();
    
    // Выбираем победителя
    const winner = selectWinner();
    gameState.winner = winner;
    
    // Вращаем колесо
    const spins = 5 + Math.random() * 5;
    const targetAngle = 360 * spins + (Math.random() * 360);
    gameState.rotationAngle += targetAngle;
    
    const wheel = document.getElementById('wheel');
    wheel.style.transform = `rotate(${gameState.rotationAngle}deg)`;
    wheel.classList.add('spinning');
    
    // Показываем в центре аватар победителя во время вращения
    updateHub('avatar', winner);
    
    gameState.spinTimer = setTimeout(() => {
        wheel.classList.remove('spinning');
        gameState.isSpinning = false;
        gameState.roundPhase = 'finished';
        
        showWinner(winner);
        updateUI();
    }, SPIN_DURATION);
}

// Обновление центрального дисплея
function updateHub(type, data) {
    const hubContent = document.getElementById('hubContent');
    const timerEl = document.querySelector('.hub-timer');
    const statusEl = document.querySelector('.hub-status');
    
    if (type === 'timer') {
        timerEl.textContent = data;
        if (data <= 5) {
            timerEl.classList.add('warning');
        } else {
            timerEl.classList.remove('warning');
        }
    } else if (type === 'status') {
        statusEl.textContent = data;
    } else if (type === 'avatar') {
        hubContent.innerHTML = `
            <img src="${getAvatarUrl(data)}" alt="${data.firstName}" class="hub-avatar">
            <div class="hub-player-name">${data.firstName}</div>
        `;
    }
}

// Создание сегментов колеса
function createWheelSegments() {
    const wheel = document.getElementById('wheel');
    const activePlayers = getActivePlayers();
    
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
        const angle = (playerValue / totalValue) * 360;
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
        const angle = (playerValue / totalValue) * 360;
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

// Выбор победителя
function selectWinner() {
    const activePlayers = getActivePlayers();
    const totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
    
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

// Показ победителя
function showWinner(winner) {
    const totalInTon = gameState.totalPoolTon + (gameState.totalPoolStars / TON_TO_STARS_RATE);
    const playerValue = (winner.bets.filter(b => b.currency === 'ton').reduce((s, b) => s + b.amount, 0) * TON_TO_STARS_RATE) +
                       winner.bets.filter(b => b.currency === 'stars').reduce((s, b) => s + b.amount, 0);
    const totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
    const multiplier = totalValue / playerValue;
    
    document.getElementById('winnerModalName').textContent = winner.firstName;
    document.getElementById('winnerModalRound').textContent = `#${String(gameState.roundId).padStart(4, '0')}`;
    document.getElementById('winnerModalPrize').textContent = `${totalInTon.toFixed(2)} TON`;
    document.getElementById('winnerModalMultiplier').textContent = `×${multiplier.toFixed(1)}`;
    
    document.getElementById('winnerModal').classList.add('show');
}

// Начало нового раунда
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
    hubContent.innerHTML = `
        <div class="hub-timer" id="hubTimer">20</div>
        <div class="hub-status" id="hubStatus">Ожидание</div>
    `;
    
    document.getElementById('winnerModal').classList.remove('show');
    document.getElementById('placeBetBtn').disabled = false;
    
    startWaitingPhase();
    updateUI();
    updateBetUI();
    
    tg.showAlert('🔄 Новый раунд начался! Делайте ставки!');
}

// Обновление UI
function updateUI() {
    // Общий банк
    const totalInTon = gameState.totalPoolTon + (gameState.totalPoolStars / TON_TO_STARS_RATE);
    document.getElementById('totalPotValue').textContent = `${totalInTon.toFixed(2)} TON`;
    
    // Количество игроков
    const activePlayers = getActivePlayers();
    document.getElementById('playersCountCompact').textContent = activePlayers.length;
    
    // Список игроков
    const list = document.getElementById('playersListCompact');
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
    
    // Обновляем информацию в хедере
    updateHeaderInfo();
}

// Форматирование ставок
function formatPlayerBets(player) {
    const tonTotal = player.bets.filter(b => b.currency === 'ton').reduce((s, b) => s + b.amount, 0);
    const starsTotal = player.bets.filter(b => b.currency === 'stars').reduce((s, b) => s + b.amount, 0);
    const parts = [];
    if (tonTotal > 0) parts.push(`${tonTotal.toFixed(1)} TON`);
    if (starsTotal > 0) parts.push(`${Math.floor(starsTotal)} Stars`);
    return parts.join(' + ') || '0';
}

// Расчет шанса
function calculateWinChance(player) {
    const tonBets = player.bets.filter(b => b.currency === 'ton').reduce((s, b) => s + b.amount, 0);
    const starsBets = player.bets.filter(b => b.currency === 'stars').reduce((s, b) => s + b.amount, 0);
    const playerValue = (tonBets * TON_TO_STARS_RATE) + starsBets;
    const totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
    if (totalValue === 0) return '0%';
    return `${((playerValue / totalValue) * 100).toFixed(1)}%`;
}

// Обновление информации в хедере
function updateHeaderInfo() {
    const activePlayers = getActivePlayers();
    
    // Предыдущая игра
    const prevGameText = document.getElementById('prevGameText');
    if (gameState.history.length > 0) {
        const last = gameState.history[gameState.history.length - 1];
        prevGameText.textContent = `${last.winner} +${last.prize}`;
        prevGameText.className = 'info-value win';
    } else {
        prevGameText.textContent = '—';
        prevGameText.className = 'info-value';
    }
    
    // Топ игра
    const topGameText = document.getElementById('topGameText');
    if (gameState.topGame) {
        topGameText.textContent = `${gameState.topGame.winner} +${gameState.topGame.prize}`;
        topGameText.className = 'info-value win';
    } else {
        topGameText.textContent = '—';
        topGameText.className = 'info-value';
    }
}

// Получение URL аватарки
function getAvatarUrl(player) {
    if (player.avatar) return player.avatar;
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.userId}`;
}

// Случайный цвет
function getRandomColor() {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#a29bfe', '#fd79a8', '#fdcb6e', '#e17055', '#00cec9'];
    return colors[Math.floor(Math.random() * colors.length)];
}