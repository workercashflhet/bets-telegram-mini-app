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
// USER MANAGER
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
            var isAdmin = userId === '479243932';
            var newUser = {
                user_id: userId,
                username: tgUser.username || '',
                first_name: tgUser.first_name || '',
                last_name: tgUser.last_name || '',
                photo_url: tgUser.photo_url || '',
                ton_balance: 0,
                stars_balance: 0,
                total_deposits_ton: 0,
                total_deposits_stars: 0,
                is_admin: isAdmin
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

        this._notifyListeners();
        return this._user;
    },

    // Получить текущего пользователя
    getUser: function() {
        return this._user;
    },

    // Проверка на администратора
    isAdmin: function() {
        return this._user && this._user.is_admin === true;
    },

    // Подписаться на изменения
    subscribe: function(callback) {
        this._listeners.push(callback);
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
    // ОПЕРАЦИИ С БАЛАНСОМ
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

        this._user.ton_balance = newBalance;
        this._user.total_deposits_ton += amount;

        await this._addTransaction('deposit', 'ton', amount, 'completed', txHash, description);

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

    // ============================================================
    // АДМИН-ФУНКЦИИ
    // ============================================================

    // Поиск пользователя по ID
    findUserById: async function(userId) {
        try {
            var { data, error } = await supabaseClient
                .from('users')
                .select('*')
                .eq('user_id', String(userId))
                .maybeSingle();

            if (error) {
                console.error('Find user error:', error);
                return null;
            }

            return data;
        } catch (error) {
            console.error('Find user error:', error);
            return null;
        }
    },

    // Поиск пользователей по имени или username
    searchUsers: async function(query) {
        try {
            var { data, error } = await supabaseClient
                .from('users')
                .select('*')
                .or(`username.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
                .limit(20);

            if (error) {
                console.error('Search users error:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('Search users error:', error);
            return [];
        }
    },

    // Пополнение баланса пользователя (только для админа)
    adminAddBalance: async function(userId, amount, currency, description) {
        if (!this.isAdmin()) {
            console.error('❌ Only admin can do this');
            return { success: false, error: 'Only admin can do this' };
        }

        if (!userId || amount <= 0) {
            return { success: false, error: 'Invalid user ID or amount' };
        }

        try {
            var targetUser = await this.findUserById(userId);
            if (!targetUser) {
                return { success: false, error: 'User not found' };
            }

            console.log('🔍 Target user found:', targetUser.user_id, 'Current balance:', targetUser.ton_balance, targetUser.stars_balance);

            var updateData = {};
            var newBalance = 0;

            if (currency === 'ton') {
                newBalance = (targetUser.ton_balance || 0) + amount;
                updateData.ton_balance = newBalance;
                updateData.total_deposits_ton = (targetUser.total_deposits_ton || 0) + amount;
            } else {
                newBalance = (targetUser.stars_balance || 0) + amount;
                updateData.stars_balance = newBalance;
                updateData.total_deposits_stars = (targetUser.total_deposits_stars || 0) + amount;
            }

            updateData.updated_at = new Date().toISOString();

            console.log('📝 Updating user:', userId, 'Currency:', currency, 'Amount:', amount, 'New balance:', newBalance);

            var { data, error: updateError } = await supabaseClient
                .from('users')
                .update(updateData)
                .eq('user_id', String(userId))
                .select();

            if (updateError) {
                console.error('❌ Admin update error:', updateError);
                return { success: false, error: 'Failed to update balance: ' + updateError.message };
            }

            console.log('✅ Update response:', data);

            var { error: txError } = await supabaseClient
                .from('transactions')
                .insert({
                    user_id: String(userId),
                    type: 'admin_deposit',
                    currency: currency,
                    amount: amount,
                    status: 'completed',
                    description: description || 'Admin deposit',
                    admin_id: this._user.user_id,
                    created_at: new Date().toISOString()
                });

            if (txError) {
                console.warn('⚠️ Transaction not saved:', txError);
            }

            var { data: updatedUser, error: fetchError } = await supabaseClient
                .from('users')
                .select('*')
                .eq('user_id', String(userId))
                .single();

            if (fetchError) {
                console.error('❌ Error fetching updated user:', fetchError);
                return { 
                    success: true, 
                    user: targetUser,
                    newBalance: newBalance,
                    currency: currency,
                    amount: amount,
                    note: 'Balance updated but could not fetch updated user'
                };
            }

            if (this._user && this._user.user_id === String(userId)) {
                this._user = updatedUser;
                this._notifyListeners();
            }

            console.log('✅ Admin added balance:', amount, currency, 'to user:', userId, 'New balance:', updatedUser.ton_balance, updatedUser.stars_balance);

            return { 
                success: true, 
                user: updatedUser,
                newBalance: currency === 'ton' ? updatedUser.ton_balance : updatedUser.stars_balance,
                currency: currency,
                amount: amount
            };

        } catch (error) {
            console.error('❌ Admin add balance error:', error);
            return { success: false, error: error.message || 'Unknown error' };
        }
    },

    // ============================================================
    // ВНУТРЕННИЕ МЕТОДЫ
    // ============================================================

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
    }
};

window.UserManager = UserManager;
console.log('✅ UserManager loaded');