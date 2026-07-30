// Telegram Web App initialization
const tg = window.Telegram.WebApp;

// App state
const state = {
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
document.addEventListener('DOMContentLoaded', () => {
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
    tg.setBackgroundColor('#0a0a0f');
    tg.setHeaderColor('#0a0a0f');
    
    // Initialize user
    initializeUser();
    
    // Setup event listeners
    setupEventListeners();
    
    // Load user data from localStorage
    loadUserData();
    
    // Update UI
    updateUI();
    
    // Обработчик изменения размера
    window.addEventListener('resize', () => {
        if (tg.isExpanded) {
            tg.expand();
        }
    });
    
    // Обработчик события изменения вьюпорта
    tg.onEvent('viewportChanged', () => {
        if (!tg.isExpanded) {
            tg.expand();
        }
    });
});

// Initialize user from Telegram
function initializeUser() {
    try {
        const user = tg.initDataUnsafe?.user;
        
        if (user) {
            state.user = user;
            // Generate unique system ID based on Telegram ID
            state.userId = user.id || Math.floor(Math.random() * 10000);
            
            // Update UI
            document.getElementById('userName').textContent = `@${user.username || 'user'}`;
            document.getElementById('userId').textContent = `id: ${state.userId}`;
            
            // Save to localStorage
            localStorage.setItem('bets_user', JSON.stringify({
                username: user.username || 'user',
                userId: state.userId,
                firstName: user.first_name || '',
                lastName: user.last_name || ''
            }));
        } else {
            // Fallback for testing
            const savedUser = localStorage.getItem('bets_user');
            if (savedUser) {
                const userData = JSON.parse(savedUser);
                document.getElementById('userName').textContent = `@${userData.username}`;
                document.getElementById('userId').textContent = `id: ${userData.userId}`;
                state.userId = userData.userId;
            }
        }
    } catch (error) {
        console.error('Error initializing user:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentTab = btn.dataset.tab;
            showToast(`Tab: ${btn.dataset.tab}`);
        });
    });

    // Bottom navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const page = item.dataset.page;
            if (page === 'profile') {
                showToast('Profile page');
            } else if (page === 'game') {
                showToast('Game page');
            } else if (page === 'settings') {
                showToast('Settings page');
            }
        });
    });

    // Deposit button
    document.getElementById('depositBtn').addEventListener('click', () => {
        tg.showPopup({
            title: 'Deposit',
            message: 'Select deposit method',
            buttons: [
                { id: 'crypto', text: 'Crypto' },
                { id: 'card', text: 'Card' },
                { id: 'cancel', text: 'Cancel', type: 'cancel' }
            ]
        }, (buttonId) => {
            if (buttonId === 'crypto') {
                showToast('Crypto deposit selected');
            } else if (buttonId === 'card') {
                showToast('Card deposit selected');
            }
        });
    });

    // Withdraw button
    document.getElementById('withdrawBtn').addEventListener('click', () => {
        tg.showPopup({
            title: 'Withdraw',
            message: 'Enter withdrawal amount',
            buttons: [
                { id: 'confirm', text: 'Confirm' },
                { id: 'cancel', text: 'Cancel', type: 'cancel' }
            ]
        }, (buttonId) => {
            if (buttonId === 'confirm') {
                tg.showAlert('Withdrawal initiated');
            }
        });
    });

    // Calculator buttons
    document.querySelectorAll('.calc-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            handleCalculator(btn.dataset.value);
        });
    });

    // NFT message click
    document.querySelector('.nft-message').addEventListener('click', () => {
        tg.showAlert('Transfer NFTs to @bets_bank to deposit them');
    });

    // Close app on back button
    tg.onEvent('backButtonClicked', () => {
        tg.close();
    });
}

// Calculator logic
function handleCalculator(value) {
    const display = document.getElementById('calcDisplay');
    
    if (value === 'o') {
        // Reset
        state.calcValue = '0';
        state.calcOperation = null;
        state.calcPrevious = null;
        display.textContent = '0';
        return;
    }
    
    if (['+', '-', 'x'].includes(value)) {
        // Operation
        if (state.calcPrevious !== null && state.calcOperation) {
            // Calculate previous operation
            const result = calculate(state.calcPrevious, parseFloat(state.calcValue), state.calcOperation);
            state.calcValue = result.toString();
            display.textContent = result;
        }
        state.calcOperation = value;
        state.calcPrevious = parseFloat(state.calcValue) || 0;
        state.calcValue = '0';
        return;
    }
    
    // Number input
    if (state.calcValue === '0') {
        state.calcValue = '';
    }
    state.calcValue += value;
    display.textContent = state.calcValue;
}

function calculate(a, b, operation) {
    switch(operation) {
        case '+': return a + b;
        case '-': return a - b;
        case 'x': return a * b;
        default: return b;
    }
}

// Load user data from localStorage
function loadUserData() {
    const savedData = localStorage.getItem('bets_data');
    if (savedData) {
        try {
            const data = JSON.parse(savedData);
            state.balance = data.balance || 0;
            state.inventory = data.inventory || 0;
        } catch (e) {
            console.error('Error loading data:', e);
        }
    }
}

// Save user data
function saveUserData() {
    localStorage.setItem('bets_data', JSON.stringify({
        balance: state.balance,
        inventory: state.inventory
    }));
}

// Update UI
function updateUI() {
    document.getElementById('balanceAmount').textContent = state.balance.toFixed(2);
    document.getElementById('inventoryCount').textContent = state.inventory;
}

// Show toast notification
function showToast(message, duration = 3000) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Show
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Hide and remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, duration);
}

// Export functions for debugging
window.betsApp = {
    state,
    updateUI,
    saveUserData,
    showToast
};