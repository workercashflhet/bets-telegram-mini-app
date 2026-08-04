// user.js - Полный модуль управления пользователем и балансом

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
// USER MANAGER - ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ
// ============================================================

var UserManager = {
    _user: null,
    _listeners: [],
    tg: window.Telegram?.WebApp || null,

    // Получить данные из Telegram
    getTelegramUser: function() {
        if (!this.tg) return null;
        return this.tg.initDataUnsafe?.user || null;
    },

    // Загрузить или создать пользователя
    loadUser: async function() {
        var tgUser = this.getTelegramUser();
        if (!tgUser) {
            console.warn('⚠️ No Telegram user');
            return null;
        }

        var userId = String(tgUser.id);

        // Ищем в БД
        var { data: existing, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

        if (error) {
            console.error('DB error:', error);
            return null;
        }

        if (existing) {
            // Обновляем данные из Telegram
            var updates = {
                username: tgUser.username || existing.username,
                first_name: tgUser.first_name || existing.first_name,
                last_name: tgUser.last_name || existing.last_name,
                photo_url: tgUser.photo_url || existing.photo_url,
                updated_at: new Date().toISOString()
            };

            var { error: updateError } = await supabaseClient
                .from('users')
                .update(updates)
                .eq('user_id', userId);

            if (!updateError) {
                this._user = { ...existing, ...updates };
            } else {
                this._user = existing;
            }
        } else {
            // Создаем нового
            var newUser = {
                user_id: userId,
                username: tgUser.username || '',
                first_name: tgUser.first_name || '',
                last_name: tgUser.last_name || '',
                photo_url: tgUser.photo_url || '',
                ton_balance: 0,
                stars_balance: 0,
                total_deposits_ton: 0,
                total_deposits_stars: 0
            };

            var { data: created, error: insertError } = await supabaseClient
                .from('users')
                .insert(newUser)
                .select()
                .single();

            if (insertError) {
                console.error('Create error:', insertError);
                return null;
            }

            this._user = created;
            console.log('✅ User created');
        }

        // Уведомляем слушателей
        this._notifyListeners();
        return this._user;
    },

    // Получить текущего пользователя (синхронно)
    getUser: function() {
        return this._user;
    },

    // Подписаться на изменения
    subscribe: function(callback) {
        this._listeners.push(callback);
        // Сразу вызываем с текущими данными
        if (this._user) {
            callback(this._user);
        }
        return function() {
            this._listeners = this._listeners.filter(function(fn) { return fn !== callback; });
        }.bind(this);
    },

    _notifyListeners: function() {
        if (!this._user) return;
        this._listeners.forEach(function(fn) {
            try { fn(this._user); } catch(e) {}
        }.bind(this));
    },

    // ============================================================
    // ОПЕРАЦИИ С БАЛАНСОМ - МГНОВЕННОЕ ОБНОВЛЕНИЕ
    // ============================================================

    // Добавить TON
    addTon: async function(amount, txHash, description) {
        if (!this._user) return false;
        if (amount <= 0) return false;

        var newBalance = this._user.ton_balance + amount;

        var { error } = await supabaseClient
            .from('users')
            .update({
                ton_balance: newBalance,
                total_deposits_ton: this._user.total_deposits_ton + amount,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', this._user.user_id);

        if (error) {
            console.error('Update error:', error);
            return false;
        }

        // Мгновенно обновляем локальный кэш
        this._user.ton_balance = newBalance;
        this._user.total_deposits_ton += amount;

        // Записываем транзакцию
        await this._addTransaction('deposit', 'ton', amount, 'completed', txHash, description);

        // Уведомляем всех
        this._notifyListeners();
        console.log('✅ TON added:', amount, 'New balance:', newBalance);
        return true;
    },

    // Добавить Stars
    addStars: async function(amount, description) {
        if (!this._user) return false;
        if (amount <= 0) return false;

        var newBalance = this._user.stars_balance + amount;

        var { error } = await supabaseClient
            .from('users')
            .update({
                stars_balance: newBalance,
                total_deposits_stars: this._user.total_deposits_stars + amount,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', this._user.user_id);

        if (error) {
            console.error('Update error:', error);
            return false;
        }

        this._user.stars_balance = newBalance;
        this._user.total_deposits_stars += amount;

        await this._addTransaction('deposit', 'stars', amount, 'completed', null, description);

        this._notifyListeners();
        console.log('✅ Stars added:', amount, 'New balance:', newBalance);
        return true;
    },

    // Списать TON
    subtractTon: async function(amount, description) {
        if (!this._user) return false;
        if (amount <= 0) return false;
        if (this._user.ton_balance < amount) return false;

        var newBalance = this._user.ton_balance - amount;

        var { error } = await supabaseClient
            .from('users')
            .update({
                ton_balance: newBalance,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', this._user.user_id);

        if (error) {
            console.error('Update error:', error);
            return false;
        }

        this._user.ton_balance = newBalance;
        await this._addTransaction('bet', 'ton', -amount, 'completed', null, description);

        this._notifyListeners();
        console.log('✅ TON subtracted:', amount, 'New balance:', newBalance);
        return true;
    },

    // Списать Stars
    subtractStars: async function(amount, description) {
        if (!this._user) return false;
        if (amount <= 0) return false;
        if (this._user.stars_balance < amount) return false;

        var newBalance = this._user.stars_balance - amount;

        var { error } = await supabaseClient
            .from('users')
            .update({
                stars_balance: newBalance,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', this._user.user_id);

        if (error) {
            console.error('Update error:', error);
            return false;
        }

        this._user.stars_balance = newBalance;
        await this._addTransaction('bet', 'stars', -amount, 'completed', null, description);

        this._notifyListeners();
        console.log('✅ Stars subtracted:', amount, 'New balance:', newBalance);
        return true;
    },

    // Добавить выигрыш
    addWin: async function(amount, currency, description) {
        if (!this._user) return false;
        if (amount <= 0) return false;

        var updateData = {};
        var transactionData = {
            type: 'win',
            currency: currency,
            amount: amount,
            status: 'completed',
            description: description || 'Win'
        };

        if (currency === 'ton') {
            updateData.ton_balance = this._user.ton_balance + amount;
            this._user.ton_balance = updateData.ton_balance;
        } else {
            updateData.stars_balance = this._user.stars_balance + amount;
            this._user.stars_balance = updateData.stars_balance;
        }

        updateData.updated_at = new Date().toISOString();

        var { error } = await supabaseClient
            .from('users')
            .update(updateData)
            .eq('user_id', this._user.user_id);

        if (error) {
            console.error('Update error:', error);
            return false;
        }

        await this._addTransaction(transactionData.type, transactionData.currency, amount, 'completed', null, description);

        this._notifyListeners();
        console.log('✅ Win added:', amount, currency);
        return true;
    },

    // Внутренний метод для транзакций
    _addTransaction: async function(type, currency, amount, status, txHash, description) {
        try {
            await supabaseClient
                .from('transactions')
                .insert({
                    user_id: this._user.user_id,
                    type: type,
                    currency: currency,
                    amount: amount,
                    status: status,
                    tx_hash: txHash || '',
                    description: description || ''
                });
        } catch (error) {
            console.error('Transaction error:', error);
        }
    },

    // Получить историю
    getTransactions: async function(limit) {
        if (!this._user) return [];

        var { data, error } = await supabaseClient
            .from('transactions')
            .select('*')
            .eq('user_id', this._user.user_id)
            .order('created_at', { ascending: false })
            .limit(limit || 20);

        if (error) {
            console.error('Transactions error:', error);
            return [];
        }

        return data || [];
    },

    // Принудительно обновить из БД (для синхронизации)
    refresh: async function() {
        if (!this._user) return null;

        var { data, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('user_id', this._user.user_id)
            .single();

        if (error) {
            console.error('Refresh error:', error);
            return null;
        }

        this._user = data;
        this._notifyListeners();
        return this._user;
    }
};

// ============================================================
// ГЛОБАЛЬНЫЙ ДОСТУП
// ============================================================

window.UserManager = UserManager;

console.log('✅ UserManager loaded');