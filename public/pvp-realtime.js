// pvp-realtime.js - Реальный мультиплеер через Supabase Realtime

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
    },
    realtime: {
        params: {
            eventsPerSecond: 10
        }
    }
});

// ============================================================
// PVP ROOM MANAGER
// ============================================================

var PvPRoomManager = {
    _roomId: null,
    _channel: null,
    _subscriptions: [],
    _players: [],
    _roundId: 0,
    _isConnected: false,
    _totalPoolTon: 0,
    _totalPoolStars: 0,

    // Инициализация комнаты
    initRoom: async function() {
        try {
            // Получаем или создаем комнату
            var roomId = this._roomId || this.generateRoomId();
            this._roomId = roomId;
            
            // Проверяем существующую комнату
            var { data: existingRoom, error: findError } = await supabaseClient
                .from('pvp_rooms')
                .select('*')
                .eq('room_id', roomId)
                .maybeSingle();
            
            if (findError && findError.code !== 'PGRST116') {
                console.error('Find room error:', findError);
            }
            
            if (!existingRoom) {
                // Создаем новую комнату
                var { data: newRoom, error: createError } = await supabaseClient
                    .from('pvp_rooms')
                    .insert({
                        room_id: roomId,
                        status: 'waiting',
                        round_number: 0
                    })
                    .select()
                    .single();
                
                if (createError) {
                    console.error('Create room error:', createError);
                    return false;
                }
                
                console.log('✅ Room created:', roomId);
            } else {
                console.log('✅ Room exists:', roomId, 'Status:', existingRoom.status);
                this._roundId = existingRoom.round_number || 0;
                this._totalPoolTon = 0;
                this._totalPoolStars = 0;
            }
            
            // Подписываемся на изменения
            this.subscribeToRoom();
            
            // Загружаем игроков
            await this.loadPlayers();
            
            return true;
            
        } catch (error) {
            console.error('Init room error:', error);
            return false;
        }
    },

    generateRoomId: function() {
        // Генерируем ID комнаты на основе текущего времени и случайного числа
        var timestamp = Date.now().toString(36);
        var random = Math.random().toString(36).substring(2, 6);
        var roomId = 'room_' + timestamp + '_' + random;
        this._roomId = roomId;
        return roomId;
    },

    // Подписка на реальные обновления
    subscribeToRoom: function() {
        if (this._channel) {
            this._channel.unsubscribe();
        }
        
        var roomId = this._roomId;
        
        this._channel = supabaseClient
            .channel('pvp_room_' + roomId)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'pvp_room_players',
                    filter: 'room_id=eq.' + roomId
                },
                function(payload) {
                    console.log('📡 Player change:', payload);
                    PvPRoomManager.handlePlayerChange(payload);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'pvp_rooms',
                    filter: 'room_id=eq.' + roomId
                },
                function(payload) {
                    console.log('📡 Room change:', payload);
                    PvPRoomManager.handleRoomChange(payload);
                }
            )
            .subscribe(function(status) {
                console.log('📡 Subscription status:', status);
                PvPRoomManager._isConnected = status === 'SUBSCRIBED';
            });
    },

    // Обработка изменений игроков
    handlePlayerChange: function(payload) {
        var eventType = payload.eventType;
        var newData = payload.new;
        var oldData = payload.old;
        
        switch(eventType) {
            case 'INSERT':
                // Новый игрок в комнате
                if (!this._players.find(p => p.user_id === newData.user_id)) {
                    this._players.push(newData);
                    this.updateTotalPool();
                    this.notifyListeners('player_added', newData);
                }
                break;
                
            case 'UPDATE':
                // Обновление игрока (ставка)
                var index = this._players.findIndex(p => p.user_id === newData.user_id);
                if (index !== -1) {
                    this._players[index] = newData;
                } else {
                    this._players.push(newData);
                }
                this.updateTotalPool();
                this.notifyListeners('player_updated', newData);
                break;
                
            case 'DELETE':
                // Игрок вышел
                this._players = this._players.filter(p => p.user_id !== oldData.user_id);
                this.updateTotalPool();
                this.notifyListeners('player_removed', oldData);
                break;
        }
        
        // Обновляем UI
        this.notifyListeners('players_updated', this._players);
    },

    // Обработка изменений комнаты
    handleRoomChange: function(payload) {
        var newData = payload.new;
        if (newData.status === 'spinning') {
            this.notifyListeners('room_spinning', newData);
        } else if (newData.status === 'finished') {
            this.notifyListeners('room_finished', newData);
        } else if (newData.status === 'waiting') {
            this.notifyListeners('room_waiting', newData);
        }
        
        this._roundId = newData.round_number || 0;
    },

    // Загрузка игроков из БД
    loadPlayers: async function() {
        try {
            var { data, error } = await supabaseClient
                .from('pvp_room_players')
                .select('*')
                .eq('room_id', this._roomId);
            
            if (error) {
                console.error('Load players error:', error);
                return;
            }
            
            this._players = data || [];
            this.updateTotalPool();
            this.notifyListeners('players_loaded', this._players);
            
            console.log('👥 Players loaded:', this._players.length);
            
        } catch (error) {
            console.error('Load players error:', error);
        }
    },

    // Добавление ставки
    addBet: async function(userId, username, firstName, photoUrl, amount, currency) {
        try {
            // Проверяем, есть ли уже игрок
            var existingPlayer = this._players.find(p => p.user_id === userId);
            
            var newBet = { amount: amount, currency: currency };
            
            if (existingPlayer) {
                // Обновляем существующего игрока
                var bets = existingPlayer.bets || [];
                bets.push(newBet);
                
                var totalValue = this.calculatePlayerValue(bets);
                
                var { error: updateError } = await supabaseClient
                    .from('pvp_room_players')
                    .update({
                        bets: bets,
                        total_value: totalValue
                    })
                    .eq('room_id', this._roomId)
                    .eq('user_id', userId);
                
                if (updateError) {
                    console.error('Update player error:', updateError);
                    return false;
                }
                
            } else {
                // Создаем нового игрока
                var color = this.getRandomColor();
                var bets = [newBet];
                var totalValue = this.calculatePlayerValue(bets);
                
                var { error: insertError } = await supabaseClient
                    .from('pvp_room_players')
                    .insert({
                        room_id: this._roomId,
                        user_id: userId,
                        username: username || '',
                        first_name: firstName || 'Игрок',
                        photo_url: photoUrl || '',
                        color: color,
                        bets: bets,
                        total_value: totalValue
                    });
                
                if (insertError) {
                    console.error('Insert player error:', insertError);
                    return false;
                }
            }
            
            // Обновляем общий пул
            this.updateTotalPool();
            
            console.log('✅ Bet added for user:', userId);
            return true;
            
        } catch (error) {
            console.error('Add bet error:', error);
            return false;
        }
    },

    // Обновление общего пула
    updateTotalPool: function() {
        this._totalPoolTon = 0;
        this._totalPoolStars = 0;
        
        this._players.forEach(function(player) {
            var bets = player.bets || [];
            bets.forEach(function(bet) {
                if (bet.currency === 'ton') {
                    PvPRoomManager._totalPoolTon += bet.amount;
                } else {
                    PvPRoomManager._totalPoolStars += bet.amount;
                }
            });
        });
        
        this.notifyListeners('pool_updated', {
            ton: this._totalPoolTon,
            stars: this._totalPoolStars
        });
    },

    // Расчет общей стоимости ставок игрока
    calculatePlayerValue: function(bets) {
        var value = 0;
        var TON_TO_STARS_RATE = 76;
        
        bets.forEach(function(bet) {
            if (bet.currency === 'ton') {
                value += bet.amount * TON_TO_STARS_RATE;
            } else {
                value += bet.amount;
            }
        });
        
        return value;
    },

    // Получение игроков
    getPlayers: function() {
        return this._players;
    },

    // Получение пула
    getPool: function() {
        return {
            ton: this._totalPoolTon,
            stars: this._totalPoolStars
        };
    },

    // Получение ID комнаты
    getRoomId: function() {
        return this._roomId;
    },

    // Статус комнаты
    getRoomStatus: function() {
        // Проверяем через Supabase
        return supabaseClient
            .from('pvp_rooms')
            .select('status')
            .eq('room_id', this._roomId)
            .single()
            .then(function(result) {
                return result.data ? result.data.status : 'waiting';
            });
    },

    // Начать вращение
    startSpin: async function() {
        try {
            var { error } = await supabaseClient
                .from('pvp_rooms')
                .update({
                    status: 'spinning',
                    updated_at: new Date().toISOString()
                })
                .eq('room_id', this._roomId);
            
            if (error) {
                console.error('Start spin error:', error);
                return false;
            }
            
            // Увеличиваем номер раунда
            this._roundId++;
            
            return true;
            
        } catch (error) {
            console.error('Start spin error:', error);
            return false;
        }
    },

    // Завершить раунд
    finishRound: async function(winner) {
        try {
            // Сохраняем историю
            var { error: historyError } = await supabaseClient
                .from('pvp_round_history')
                .insert({
                    room_id: this._roomId,
                    round_number: this._roundId,
                    winner_user_id: winner ? winner.user_id : null,
                    winner_name: winner ? winner.first_name : null,
                    total_pool_ton: this._totalPoolTon,
                    total_pool_stars: this._totalPoolStars,
                    players_data: this._players
                });
            
            if (historyError) {
                console.error('Save history error:', historyError);
            }
            
            // Обновляем статус комнаты
            var { error } = await supabaseClient
                .from('pvp_rooms')
                .update({
                    status: 'finished',
                    round_number: this._roundId,
                    updated_at: new Date().toISOString()
                })
                .eq('room_id', this._roomId);
            
            if (error) {
                console.error('Finish round error:', error);
                return false;
            }
            
            return true;
            
        } catch (error) {
            console.error('Finish round error:', error);
            return false;
        }
    },

    // Начать новый раунд
    startNewRound: async function() {
        try {
            // Очищаем игроков
            var { error: deleteError } = await supabaseClient
                .from('pvp_room_players')
                .delete()
                .eq('room_id', this._roomId);
            
            if (deleteError) {
                console.error('Clear players error:', deleteError);
            }
            
            // Обновляем комнату
            var { error } = await supabaseClient
                .from('pvp_rooms')
                .update({
                    status: 'waiting',
                    updated_at: new Date().toISOString()
                })
                .eq('room_id', this._roomId);
            
            if (error) {
                console.error('Start new round error:', error);
                return false;
            }
            
            this._players = [];
            this._totalPoolTon = 0;
            this._totalPoolStars = 0;
            this.notifyListeners('players_updated', []);
            this.notifyListeners('pool_updated', { ton: 0, stars: 0 });
            
            return true;
            
        } catch (error) {
            console.error('Start new round error:', error);
            return false;
        }
    },

    // Подписка на события
    subscribe: function(callback) {
        this._subscriptions.push(callback);
        return function() {
            var index = this._subscriptions.indexOf(callback);
            if (index !== -1) {
                this._subscriptions.splice(index, 1);
            }
        }.bind(this);
    },

    // Уведомление слушателей
    notifyListeners: function(event, data) {
        this._subscriptions.forEach(function(callback) {
            try {
                callback(event, data);
            } catch (error) {
                console.error('Listener error:', error);
            }
        });
    },

    // Случайный цвет
    getRandomColor: function() {
        var colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#a29bfe', '#fd79a8', '#fdcb6e', '#e17055', '#00cec9'];
        return colors[Math.floor(Math.random() * colors.length)];
    },

    // Отключение
    disconnect: function() {
        if (this._channel) {
            this._channel.unsubscribe();
            this._channel = null;
        }
        this._isConnected = false;
        this._subscriptions = [];
    }
};

// Экспорт
window.PvPRoomManager = PvPRoomManager;
console.log('✅ PvPRoomManager loaded');