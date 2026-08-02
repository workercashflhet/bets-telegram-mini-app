// ============================================================
// PvP КОЛЕСО - ЛОГИКА
// ============================================================

// Telegram Web App
const tg = window.Telegram.WebApp;

// Состояние игры
const gameState = {
    players: [],
    currentRound: null,
    isSpinning: false,
    rotationAngle: 0,
    timeLeft: 30,
    winner: null,
    betAmount: 1,
    selectedCurrency: 'ton',
    balance: { ton: 0.00, stars: 0 },
    playerBets: [],
    totalPoolTon: 0,
    totalPoolStars: 0,
    roundTimer: null,
    spinTimer: null,
    isRoundActive: false,
    isTimerRunning: false, // Флаг запущен ли таймер
    roundPhase: 'waiting' // waiting | countdown | spinning | finished
};

// Константы
const TON_TO_STARS_RATE = 76;
const MIN_PLAYERS = 2;
const MIN_BET_TON = 0.1;
const MIN_BET_STARS = 10;
const ROUND_DURATION = 30;
const SPIN_DURATION = 5000;

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    tg.expand();
    tg.ready();
    tg.setBackgroundColor('#000000');
    tg.setHeaderColor('#000000');
    
    // Загружаем демо-баланс
    loadBalance();
    
    // Инициализируем UI
    setupUI();
    
    // Добавляем демо-игроков
    addDemoPlayers();
    
    // Запускаем ожидание игроков
    startWaitingPhase();
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

// Сохранение баланса
function saveBalance() {
    localStorage.setItem('bets_data', JSON.stringify({
        balance: gameState.balance.ton,
        inventory: gameState.balance.stars
    }));
}

// Обновление UI баланса
function updateBalanceUI() {
    document.getElementById('tonBalance').textContent = gameState.balance.ton.toFixed(2);
    document.getElementById('starsBalance').textContent = Math.floor(gameState.balance.stars);
}

// Настройка UI
function setupUI() {
    // Переключение валюты
    document.querySelectorAll('.currency-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.currency-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            gameState.selectedCurrency = btn.dataset.currency;
            updateBetUI();
        });
    });
    
    // Переключение валюты в балансе
    document.querySelectorAll('.balance-item-small').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.balance-item-small').forEach(b => b.classList.remove('active-currency'));
            item.classList.add('active-currency');
            const currency = item.dataset.currency;
            if (currency === 'ton' || currency === 'stars') {
                gameState.selectedCurrency = currency;
                document.querySelectorAll('.currency-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.currency === currency);
                });
                updateBetUI();
            }
        });
    });
    
    // Кнопка депозита
    document.getElementById('depositBtn').addEventListener('click', () => {
        tg.showPopup({
            title: '💰 Депозит',
            message: 'Выберите способ пополнения',
            buttons: [
                { id: 'crypto', text: 'Криптовалюта' },
                { id: 'card', text: 'Банковская карта' },
                { id: 'cancel', text: 'Отмена', type: 'cancel' }
            ]
        }, (buttonId) => {
            if (buttonId === 'crypto') {
                tg.showAlert('💰 Пополните баланс через криптовалюту');
            } else if (buttonId === 'card') {
                tg.showAlert('💳 Пополните баланс через банковскую карту');
            }
        });
    });
    
    // Регулировка ставки
    document.getElementById('betDec').addEventListener('click', () => {
        const step = gameState.selectedCurrency === 'ton' ? 0.1 : 1;
        gameState.betAmount = Math.max(
            gameState.selectedCurrency === 'ton' ? MIN_BET_TON : MIN_BET_STARS,
            gameState.betAmount - step
        );
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
    
    // Новая игра
    document.getElementById('newRoundBtn').addEventListener('click', startNewRound);
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
    btn.disabled = gameState.betAmount > max || gameState.betAmount < min || gameState.isSpinning;
}

// Добавление демо-игроков
function addDemoPlayers() {
    // Получаем пользователя из Telegram
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
    updatePlayersList();
}

// Фаза ожидания (до 2-х игроков)
function startWaitingPhase() {
    gameState.roundPhase = 'waiting';
    gameState.isTimerRunning = false;
    gameState.isRoundActive = false;
    gameState.timeLeft = ROUND_DURATION;
    
    document.getElementById('winnerSection').style.display = 'none';
    document.getElementById('spinningStatus').style.display = 'none';
    document.getElementById('betSection').style.display = 'block';
    
    // Показываем "Ожидание игроков" на таймере
    const timerText = document.getElementById('timerText');
    timerText.textContent = '⏳';
    timerText.style.fontSize = '16px';
    
    // Сбрасываем круговой таймер
    const circle = document.getElementById('timerCircle');
    circle.setAttribute('stroke-dasharray', '264 264');
    
    document.getElementById('roundTime').textContent = 'Ожидание';
    
    // Обновляем кнопку ставки
    updateBetUI();
}

// Запуск обратного отсчета (когда 2+ игроков)
function startCountdown() {
    if (gameState.isTimerRunning) return;
    if (gameState.roundPhase === 'spinning') return;
    
    const activePlayers = gameState.players.filter(p => p.bets.length > 0);
    if (activePlayers.length < MIN_PLAYERS) {
        startWaitingPhase();
        return;
    }
    
    gameState.roundPhase = 'countdown';
    gameState.isTimerRunning = true;
    gameState.timeLeft = ROUND_DURATION;
    gameState.isRoundActive = true;
    
    // Обновляем таймер
    const timerText = document.getElementById('timerText');
    timerText.style.fontSize = '22px';
    timerText.textContent = gameState.timeLeft;
    timerText.classList.remove('time-warning');
    
    document.getElementById('roundTime').textContent = `${gameState.timeLeft}s`;
    document.getElementById('betSection').style.display = 'block';
    
    // Запускаем таймер
    if (gameState.roundTimer) clearInterval(gameState.roundTimer);
    gameState.roundTimer = setInterval(() => {
        gameState.timeLeft--;
        updateTimerUI();
        
        if (gameState.timeLeft <= 0) {
            clearInterval(gameState.roundTimer);
            gameState.isTimerRunning = false;
            startSpin();
        }
    }, 1000);
}

// Обновление таймера
function updateTimerUI() {
    const timerText = document.getElementById('timerText');
    timerText.textContent = gameState.timeLeft;
    timerText.style.fontSize = '22px';
    
    // Обновляем круговой таймер
    const circle = document.getElementById('timerCircle');
    const circumference = 264;
    const progress = gameState.timeLeft / ROUND_DURATION;
    circle.setAttribute('stroke-dasharray', `${progress * circumference} ${circumference}`);
    
    // Предупреждение
    if (gameState.timeLeft <= 5) {
        timerText.classList.add('time-warning');
    } else {
        timerText.classList.remove('time-warning');
    }
    
    document.getElementById('roundTime').textContent = `${gameState.timeLeft}s`;
}

// Обновление статистики
function updateStatsUI() {
    const totalInTon = gameState.totalPoolTon + (gameState.totalPoolStars / TON_TO_STARS_RATE);
    document.getElementById('poolTotal').textContent = `${totalInTon.toFixed(2)} TON`;
    document.getElementById('playersCount').textContent = gameState.players.filter(p => p.bets.length > 0).length;
}

// Обновление списка игроков
function updatePlayersList() {
    const container = document.getElementById('playersList');
    const activePlayers = gameState.players.filter(p => p.bets.length > 0);
    
    if (activePlayers.length === 0) {
        container.innerHTML = `
            <div class="no-players">
                <p>Пока нет игроков</p>
                <p class="no-players-sub">Будь первым!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = activePlayers.map(player => {
        const isWinner = gameState.winner && gameState.winner.userId === player.userId;
        const betText = formatPlayerBets(player);
        const share = calculateWinChance(player);
        
        return `
            <div class="player-item ${isWinner ? 'winner-player' : ''}">
                <div class="player-color" style="background-color: ${player.color}"></div>
                <img src="${getAvatarUrl(player)}" alt="${player.firstName}" class="player-avatar-small">
                <div class="player-info">
                    <span class="player-name">${player.firstName}${isWinner ? ' 👑' : ''}</span>
                    <span class="player-username">@${player.username}</span>
                </div>
                <div class="player-stats">
                    <span class="player-bet">${betText}</span>
                    <span class="player-share">${share}</span>
                </div>
            </div>
        `;
    }).join('');
    
    // Проверяем количество игроков для запуска таймера
    const activeCount = activePlayers.length;
    if (activeCount >= MIN_PLAYERS && !gameState.isTimerRunning && gameState.roundPhase !== 'spinning' && gameState.roundPhase !== 'finished') {
        startCountdown();
    } else if (activeCount < MIN_PLAYERS && gameState.isTimerRunning) {
        // Если игроков стало меньше 2, останавливаем таймер и возвращаемся в ожидание
        clearInterval(gameState.roundTimer);
        gameState.isTimerRunning = false;
        startWaitingPhase();
    }
}

// Получение URL аватарки
function getAvatarUrl(player) {
    if (player.avatar) return player.avatar;
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.userId}`;
}

// Форматирование ставок игрока
function formatPlayerBets(player) {
    const tonBets = player.bets.filter(b => b.currency === 'ton');
    const starsBets = player.bets.filter(b => b.currency === 'stars');
    
    const tonTotal = tonBets.reduce((sum, b) => sum + b.amount, 0);
    const starsTotal = starsBets.reduce((sum, b) => sum + b.amount, 0);
    
    const parts = [];
    if (tonTotal > 0) parts.push(`${tonTotal.toFixed(1)} TON`);
    if (starsTotal > 0) parts.push(`${Math.floor(starsTotal)} Stars`);
    
    return parts.join(' + ') || '0';
}

// Расчет шанса на победу
function calculateWinChance(player) {
    const tonBets = player.bets.filter(b => b.currency === 'ton').reduce((sum, b) => sum + b.amount, 0);
    const starsBets = player.bets.filter(b => b.currency === 'stars').reduce((sum, b) => sum + b.amount, 0);
    
    const playerValue = (tonBets * TON_TO_STARS_RATE) + starsBets;
    const totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
    
    if (totalValue === 0) return '0%';
    return `${((playerValue / totalValue) * 100).toFixed(1)}%`;
}

// Обновление моих ставок
function updateMyBetsUI() {
    const bar = document.getElementById('myBetsBar');
    const text = document.getElementById('myBetsText');
    const chance = document.getElementById('winChance');
    
    if (gameState.playerBets.length === 0) {
        bar.style.display = 'none';
        return;
    }
    
    bar.style.display = 'flex';
    const tonTotal = gameState.playerBets.filter(b => b.currency === 'ton').reduce((sum, b) => sum + b.amount, 0);
    const starsTotal = gameState.playerBets.filter(b => b.currency === 'stars').reduce((sum, b) => sum + b.amount, 0);
    
    const parts = [];
    if (tonTotal > 0) parts.push(`${tonTotal.toFixed(1)} TON`);
    if (starsTotal > 0) parts.push(`${Math.floor(starsTotal)} Stars`);
    
    text.textContent = `My bets: ${parts.join(' + ') || '0'}`;
    
    // Шанс победы
    const user = tg.initDataUnsafe?.user;
    const player = gameState.players.find(p => p.userId === (user?.id || 1));
    if (player) {
        chance.textContent = calculateWinChance(player);
    }
}

// Размещение ставки
function placeBet() {
    const user = tg.initDataUnsafe?.user;
    if (!user) {
        tg.showAlert('❌ Пожалуйста, откройте приложение через Telegram');
        return;
    }
    
    if (gameState.roundPhase === 'spinning') {
        tg.showAlert('⏳ Колесо уже крутится!');
        return;
    }
    
    if (gameState.roundPhase === 'finished') {
        tg.showAlert('⏳ Раунд завершен! Начните новый раунд.');
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
    
    // Проверяем, есть ли уже игрок с таким ID
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
    
    // Добавляем ставку
    player.bets.push({ amount, currency });
    gameState.playerBets.push({ amount, currency });
    
    // Обновляем пул
    if (currency === 'ton') {
        gameState.totalPoolTon += amount;
        gameState.balance.ton -= amount;
    } else {
        gameState.totalPoolStars += amount;
        gameState.balance.stars -= amount;
    }
    
    // Сохраняем баланс
    saveBalance();
    updateBalanceUI();
    updateStatsUI();
    updatePlayersList();
    updateMyBetsUI();
    updateBetUI();
    
    tg.showAlert(`✅ Ставка ${amount} ${currency === 'ton' ? 'TON' : 'Stars'} принята!`);
    
    // После ставки проверяем количество игроков
    const activePlayers = gameState.players.filter(p => p.bets.length > 0);
    if (activePlayers.length >= MIN_PLAYERS && !gameState.isTimerRunning && gameState.roundPhase !== 'spinning' && gameState.roundPhase !== 'finished') {
        startCountdown();
    }
}

// Получение случайного цвета
function getRandomColor() {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#a29bfe', '#fd79a8', '#fdcb6e', '#e17055', '#00cec9'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Запуск вращения
function startSpin() {
    if (gameState.isSpinning) return;
    if (gameState.roundPhase === 'spinning') return;
    
    // Проверяем количество игроков
    const activePlayers = gameState.players.filter(p => p.bets.length > 0);
    if (activePlayers.length < MIN_PLAYERS) {
        tg.showAlert(`❌ Недостаточно игроков! Нужно минимум ${MIN_PLAYERS}. Ожидаем игроков...`);
        startWaitingPhase();
        return;
    }
    
    gameState.roundPhase = 'spinning';
    gameState.isSpinning = true;
    gameState.isRoundActive = false;
    
    document.getElementById('betSection').style.display = 'none';
    document.getElementById('spinningStatus').style.display = 'block';
    
    // Создаем сегменты для колеса
    createWheelSegments();
    
    // Выбираем победителя (на основе ставок)
    const winner = selectWinner();
    gameState.winner = winner;
    
    // Вращаем колесо
    const spins = 5 + Math.random() * 5;
    const targetAngle = 360 * spins + (Math.random() * 360);
    gameState.rotationAngle += targetAngle;
    
    const wheel = document.getElementById('wheel');
    wheel.style.transform = `rotate(${gameState.rotationAngle}deg)`;
    wheel.classList.add('spinning');
    
    // Ждем окончания вращения
    gameState.spinTimer = setTimeout(() => {
        wheel.classList.remove('spinning');
        gameState.isSpinning = false;
        gameState.roundPhase = 'finished';
        
        document.getElementById('spinningStatus').style.display = 'none';
        showWinner(winner);
    }, SPIN_DURATION);
}

// Создание сегментов колеса
function createWheelSegments() {
    const wheel = document.getElementById('wheel');
    const activePlayers = gameState.players.filter(p => p.bets.length > 0);
    
    if (activePlayers.length === 0) {
        wheel.innerHTML = '<div class="wheel-empty" style="width:100%;height:100%;border-radius:50%;background:#1a1a2e;"></div>';
        return;
    }
    
    // Рассчитываем углы на основе ставок
    const totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
    let startAngle = 0;
    let segmentsHTML = '';
    
    // Создаем сегменты для каждого игрока
    activePlayers.forEach((player, index) => {
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
    
    // Создаем градиент для колеса
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
    const activePlayers = gameState.players.filter(p => p.bets.length > 0);
    const totalValue = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
    
    // Рандомный выбор с учетом веса ставок
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
    const section = document.getElementById('winnerSection');
    const nameEl = document.getElementById('winnerName');
    const prizeEl = document.getElementById('winnerPrize');
    
    nameEl.textContent = `🎉 ${winner.firstName} побеждает!`;
    
    // Рассчитываем приз
    const totalInTon = gameState.totalPoolTon + (gameState.totalPoolStars / TON_TO_STARS_RATE);
    const totalInStars = (gameState.totalPoolTon * TON_TO_STARS_RATE) + gameState.totalPoolStars;
    
    if (totalInTon >= 1) {
        prizeEl.textContent = `🏆 ${totalInTon.toFixed(2)} TON (${Math.floor(totalInStars)} Stars)`;
    } else {
        prizeEl.textContent = `🏆 ${Math.floor(totalInStars)} Stars`;
    }
    
    section.style.display = 'block';
    document.getElementById('betSection').style.display = 'none';
    updatePlayersList();
}

// Начало нового раунда
function startNewRound() {
    // Очищаем предыдущий раунд
    if (gameState.roundTimer) clearInterval(gameState.roundTimer);
    if (gameState.spinTimer) clearTimeout(gameState.spinTimer);
    
    gameState.isSpinning = false;
    gameState.winner = null;
    gameState.rotationAngle = 0;
    gameState.timeLeft = ROUND_DURATION;
    gameState.totalPoolTon = 0;
    gameState.totalPoolStars = 0;
    gameState.playerBets = [];
    gameState.isRoundActive = false;
    gameState.isTimerRunning = false;
    gameState.roundPhase = 'waiting';
    
    // Скрываем победителя
    document.getElementById('winnerSection').style.display = 'none';
    document.getElementById('spinningStatus').style.display = 'none';
    document.getElementById('betSection').style.display = 'block';
    
    // Обновляем игроков (очищаем ставки)
    gameState.players.forEach(p => p.bets = []);
    updatePlayersList();
    updateStatsUI();
    updateMyBetsUI();
    updateBetUI();
    
    // Запускаем ожидание
    startWaitingPhase();
    
    tg.showAlert('🔄 Новый раунд начался! Делайте ставки!');
}