// user.js - Модуль для работы с пользователями и балансом

// ============================================================
// SUPABASE КОНФИГУРАЦИЯ
// ============================================================
var SUPABASE_URL = 'https://siibxynvgrrsktyihuby.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpaWJ4eW52Z3Jyc2t0eWlodWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MDE0MzUsImV4cCI6MjEwMTI3NzQzNX0.k8bdNQPeB8lDkw_1XKVtFB-u3NjyHmyr2L7zE4mhN6I';

var supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
    },
    global: {
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY
        }
    }
});

// ============================================================
// ПОЛЬЗОВАТЕЛЬ
// ============================================================

var UserManager = {
    currentUser: null,
    tg: window.Telegram?.WebApp || null,

    // Получить данные пользователя из Telegram
    getTelegramUser: function() {
        if (!this.tg) return null;
        return this.tg.initDataUnsafe?.user || null;
    },

    // Получить или создать пользователя в БД
    getOrCreateUser: async function() {
        try {
            var tgUser = this.getTelegramUser();
            if (!tgUser) {
                console.warn('⚠️ No Telegram user found');
                return null;
            }

            var userId = String(tgUser.id);
            
            // Проверяем, есть ли пользователь в БД
            var { data: existingUser, error: fetchError } = await supabaseClient
                .from('users')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();

            if (fetchError) {
                console.error('Error fetching user:', fetchError);
                return null;
            }

            if (existingUser) {
                // Обновляем данные пользователя
                this.currentUser = existingUser;
                await this.updateUserData(tgUser);
                return existingUser;
            }

            // Создаем нового пользователя
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

            var { data: createdUser, error: insertError } = await supabaseClient
                .from('users')
                .insert(newUser)
                .select()
                .single();

            if (insertError) {
                console.error('Error creating user:', insertError);
                return null;
            }

            this.currentUser = createdUser;
            console.log('✅ User created:', createdUser);
            return createdUser;

        } catch (error) {
            console.error('Error in getOrCreateUser:', error);
            return null;
        }
    },

    // Обновить данные пользователя
    updateUserData: async function(tgUser) {
        if (!tgUser || !this.currentUser) return;

        try {
            var updates = {
                username: tgUser.username || this.currentUser.username,
                first_name: tgUser.first_name || this.currentUser.first_name,
                last_name: tgUser.last_name || this.currentUser.last_name,
                photo_url: tgUser.photo_url || this.currentUser.photo_url,
                updated_at: new Date().toISOString()
            };

            var { error: updateError } = await supabaseClient
                .from('users')
                .update(updates)
                .eq('user_id', this.currentUser.user_id);

            if (updateError) {
                console.error('Error updating user:', updateError);
            } else {
                this.currentUser = { ...this.currentUser, ...updates };
                console.log('✅ User updated');
            }

        } catch (error) {
            console.error('Error in updateUserData:', error);
        }
    },

    // Получить текущего пользователя
    getUser: function() {
        return this.currentUser;
    },

    // Получить баланс TON
    getTonBalance: function() {
        return this.currentUser?.ton_balance || 0;
    },

    // Получить баланс Stars
    getStarsBalance: function() {
        return this.currentUser?.stars_balance || 0;
    },

    // Добавить TON баланс
    addTonBalance: async function(amount, txHash, description) {
        if (!this.currentUser) return false;

        try {
            var newBalance = this.currentUser.ton_balance + amount;

            var { error: updateError } = await supabaseClient
                .from('users')
                .update({
                    ton_balance: newBalance,
                    total_deposits_ton: this.currentUser.total_deposits_ton + amount,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', this.currentUser.user_id);

            if (updateError) {
                console.error('Error updating balance:', updateError);
                return false;
            }

            // Записываем транзакцию
            await this.addTransaction({
                user_id: this.currentUser.user_id,
                type: 'deposit',
                currency: 'ton',
                amount: amount,
                status: 'completed',
                tx_hash: txHash || '',
                description: description || 'Deposit TON'
            });

            this.currentUser.ton_balance = newBalance;
            this.currentUser.total_deposits_ton += amount;
            console.log('✅ TON balance updated:', newBalance);
            return true;

        } catch (error) {
            console.error('Error in addTonBalance:', error);
            return false;
        }
    },

    // Добавить Stars баланс
    addStarsBalance: async function(amount, description) {
        if (!this.currentUser) return false;

        try {
            var newBalance = this.currentUser.stars_balance + amount;

            var { error: updateError } = await supabaseClient
                .from('users')
                .update({
                    stars_balance: newBalance,
                    total_deposits_stars: this.currentUser.total_deposits_stars + amount,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', this.currentUser.user_id);

            if (updateError) {
                console.error('Error updating stars balance:', updateError);
                return false;
            }

            // Записываем транзакцию
            await this.addTransaction({
                user_id: this.currentUser.user_id,
                type: 'deposit',
                currency: 'stars',
                amount: amount,
                status: 'completed',
                description: description || 'Deposit Stars'
            });

            this.currentUser.stars_balance = newBalance;
            this.currentUser.total_deposits_stars += amount;
            console.log('✅ Stars balance updated:', newBalance);
            return true;

        } catch (error) {
            console.error('Error in addStarsBalance:', error);
            return false;
        }
    },

    // Снять TON баланс (для ставок)
    subtractTonBalance: async function(amount, description) {
        if (!this.currentUser) return false;
        if (this.currentUser.ton_balance < amount) return false;

        try {
            var newBalance = this.currentUser.ton_balance - amount;

            var { error: updateError } = await supabaseClient
                .from('users')
                .update({
                    ton_balance: newBalance,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', this.currentUser.user_id);

            if (updateError) {
                console.error('Error subtracting TON:', updateError);
                return false;
            }

            await this.addTransaction({
                user_id: this.currentUser.user_id,
                type: 'bet',
                currency: 'ton',
                amount: -amount,
                status: 'completed',
                description: description || 'Bet TON'
            });

            this.currentUser.ton_balance = newBalance;
            console.log('✅ TON subtracted:', newBalance);
            return true;

        } catch (error) {
            console.error('Error in subtractTonBalance:', error);
            return false;
        }
    },

    // Снять Stars баланс (для ставок)
    subtractStarsBalance: async function(amount, description) {
        if (!this.currentUser) return false;
        if (this.currentUser.stars_balance < amount) return false;

        try {
            var newBalance = this.currentUser.stars_balance - amount;

            var { error: updateError } = await supabaseClient
                .from('users')
                .update({
                    stars_balance: newBalance,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', this.currentUser.user_id);

            if (updateError) {
                console.error('Error subtracting Stars:', updateError);
                return false;
            }

            await this.addTransaction({
                user_id: this.currentUser.user_id,
                type: 'bet',
                currency: 'stars',
                amount: -amount,
                status: 'completed',
                description: description || 'Bet Stars'
            });

            this.currentUser.stars_balance = newBalance;
            console.log('✅ Stars subtracted:', newBalance);
            return true;

        } catch (error) {
            console.error('Error in subtractStarsBalance:', error);
            return false;
        }
    },

    // Добавить выигрыш
    addWin: async function(amount, currency, description) {
        if (!this.currentUser) return false;

        try {
            var updateData = {};
            var transactionData = {
                user_id: this.currentUser.user_id,
                type: 'win',
                currency: currency,
                amount: amount,
                status: 'completed',
                description: description || 'Win'
            };

            if (currency === 'ton') {
                updateData.ton_balance = this.currentUser.ton_balance + amount;
                this.currentUser.ton_balance = updateData.ton_balance;
            } else {
                updateData.stars_balance = this.currentUser.stars_balance + amount;
                this.currentUser.stars_balance = updateData.stars_balance;
            }

            updateData.updated_at = new Date().toISOString();

            var { error: updateError } = await supabaseClient
                .from('users')
                .update(updateData)
                .eq('user_id', this.currentUser.user_id);

            if (updateError) {
                console.error('Error adding win:', updateError);
                return false;
            }

            await this.addTransaction(transactionData);
            console.log('✅ Win added:', amount, currency);
            return true;

        } catch (error) {
            console.error('Error in addWin:', error);
            return false;
        }
    },

    // Добавить транзакцию
    addTransaction: async function(transaction) {
        try {
            var { error: insertError } = await supabaseClient
                .from('transactions')
                .insert(transaction);

            if (insertError) {
                console.error('Error adding transaction:', insertError);
            }

        } catch (error) {
            console.error('Error in addTransaction:', error);
        }
    },

    // Получить историю транзакций
    getTransactions: async function(limit) {
        if (!this.currentUser) return [];

        try {
            var { data, error } = await supabaseClient
                .from('transactions')
                .select('*')
                .eq('user_id', this.currentUser.user_id)
                .order('created_at', { ascending: false })
                .limit(limit || 20);

            if (error) {
                console.error('Error fetching transactions:', error);
                return [];
            }

            return data || [];

        } catch (error) {
            console.error('Error in getTransactions:', error);
            return [];
        }
    },

    // Обновить баланс из localStorage (для обратной совместимости)
    syncFromLocalStorage: function() {
        var saved = localStorage.getItem('bets_data');
        if (saved && this.currentUser) {
            try {
                var data = JSON.parse(saved);
                // Используем данные из БД как основной источник
                // Но если в localStorage больше, можно обновить
                if (data.balance > this.currentUser.ton_balance) {
                    this.addTonBalance(data.balance - this.currentUser.ton_balance, '', 'Sync from localStorage');
                }
                if (data.inventory > this.currentUser.stars_balance) {
                    this.addStarsBalance(data.inventory - this.currentUser.stars_balance, 'Sync from localStorage');
                }
            } catch (e) {
                console.warn('Error syncing from localStorage:', e);
            }
        }
    }
};

// ============================================================
// ЭКСПОРТ
// ============================================================

window.UserManager = UserManager;

console.log('✅ UserManager loaded');