// tonconnect.js
import { TonConnectUI } from '@tonconnect/ui';

// Конфигурация
const MANIFEST_URL = 'https://bets-telegram-mini-app.vercel.app/tonconnect-manifest.json';

// Инициализация
export const tonConnectUI = new TonConnectUI({
    manifestUrl: MANIFEST_URL,
    actionsConfiguration: {
        twaReturnUrl: 'https://t.me/betsgambles_bot/betsgambles' // Замените на ваш бот
    },
    uiPreferences: {
        theme: 'DARK'
    }
});

// Функции для работы с кошельком
export const connectWallet = () => tonConnectUI.openModal();

export const disconnectWallet = () => tonConnectUI.disconnect();

export const sendTransaction = async (transaction) => {
    try {
        const result = await tonConnectUI.sendTransaction(transaction);
        return result;
    } catch (error) {
        console.error('Transaction error:', error);
        throw error;
    }
};

export const getWalletInfo = () => tonConnectUI.wallet;

export const isConnected = () => tonConnectUI.connected;

export const getAddress = () => {
    const wallet = tonConnectUI.wallet;
    return wallet?.account?.address || null;
};

// Подписка на изменение статуса
export const onStatusChange = (callback) => {
    return tonConnectUI.onStatusChange(callback);
};

// Преобразование суммы в нанотоны
export const toNano = (amount) => {
    return Math.floor(amount * 1_000_000_000).toString();
};

// Преобразование из нанотонов
export const fromNano = (nano) => {
    return Number(nano) / 1_000_000_000;
};