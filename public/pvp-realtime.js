// pvp-realtime.js - ОПТИМИЗИРОВАННАЯ ВЕРСИЯ

// ============================================================
// SUPABASE КОНФИГУРАЦИЯ
// ============================================================
var SUPABASE_URL = 'https://siibxynvgrrsktyihuby.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpaWJ4eW52Z3Jyc2t0eWlodWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MDE0MzUsImV4cCI6MjEwMTI3NzQzNX0.k8bdNQPeB8lDkw_1XKVtFB-u3NjyHmyr2L7zE4mhN6I';

// ============================================================
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ REST ЗАПРОСОВ
// ============================================================
function supabaseRestRequest(path, method, body) {
    var url = SUPABASE_URL + '/rest/v1/' + path;
    var headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Prefer': 'return=representation'
    };
    
    var options = {
        method: method,
        headers: headers
    };
    
    if (body) {
        options.body = JSON.stringify(body);
    }
    
    return fetch(url, options);
}

// ============================================================
// PVP ROOM MANAGER
// ============================================================

var PvPRoomManager = {
    _roomId: 'pvp_main_room',
    _channel: null,
    _subscriptions: [],
    _players: [],
    _roundId: 0,
    _isConnected: false,
    _totalPoolTon: 0,
    _totalPoolStars: 0,
    _lastUpdate: 0,
    _isLoading: false,
    _syncInterval: null,

    initRoom: async function() {
        try {
            var roomId = this._roomId;
            console.log('🔄 Initializing room:', roomId);
            
            // Проверяем/создаем комнату через REST
            var checkResponse = await supabaseRestRequest(
                'pvp_rooms?room_id=eq.' + roomId,
                'GET'
            );
            
            if (!checkResponse.ok) {
                console.error('Check room error:', await checkResponse.text());
                return false;
            }
            
            var existingRooms = await checkResponse.json();
            
            if (!existingRooms || existingRooms.length === 0) {
                console.log('📝 Creating room...');
                var createResponse = await supabaseRestRequest(
                    'pvp_rooms',
                    'POST',
                    {
                        room_id: roomId,
                        status: 'waiting',
                        round_number: 0,
                        time_left: 20,
                        phase: 'waiting'
                    }
                );
                
                if (!createResponse.ok) {
                    console.error('Create room error:', await createResponse.text());
                    return false;
                }
                console.log('✅ Room created');
            } else {
                console.log('✅ Room exists, status:', existingRooms[0].status);
                this._roundId = existingRooms[0].round_number || 0;
            }
            
            this.subscribeToRoom();
            await this.loadPlayers();
            this.startPeriodicSync();
            
            return true;
            
        } catch (error) {
            console.error('Init room error:', error);
            return false;
        }
    },

    subscribeToRoom: function() {
        if (this._channel) {
            this._channel.unsubscribe();
            this._channel = null;
        }
        
        var roomId = this._roomId;
        console.log('📡 Subscribing to room:', roomId);
        
        // Создаем клиент для Realtime
        var supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: { persistSession: false },
            global: {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': 'Bearer ' + SUPABASE_KEY
                }
            },
            realtime: {
                params: {
                    eventsPerSecond: 20,
                    heartbeatIntervalMs: 3000
                }
            }
        });
        
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
                    console.log('📡 Player change:', payload.eventType);
                    PvPRoomManager.handlePlayerChange(payload);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'pvp_rooms',
                    filter: 'room_id=eq.' + roomId
                },
                function(payload) {
                    console.log('📡 Room change:', payload.eventType);
                    PvPRoomManager.handleRoomChange(payload);
                }
            )
            .subscribe(function(status) {
                console.log('📡 Subscription status:', status);
                PvPRoomManager._isConnected = status === 'SUBSCRIBED';
                if (PvPRoomManager._isConnected) {
                    PvPRoomManager.loadPlayers();
                }
            });
    },

    handlePlayerChange: function(payload) {
        var eventType = payload.eventType;
        var newData = payload.new;
        var oldData = payload.old;
        
        switch(eventType) {
            case 'INSERT':
                if (!this._players.find(p => p.user_id === newData.user_id)) {
                    this._players.push(newData);
                    this.updateTotalPool();
                    this.notifyListeners('player_added', newData);
                }
                break;
                
            case 'UPDATE':
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
                this._players = this._players.filter(p => p.user_id !== oldData.user_id);
                this.updateTotalPool();
                this.notifyListeners('player_removed', oldData);
                break;
        }
        
        this.notifyListeners('players_updated', this._players);
    },

    handleRoomChange: function(payload) {
        var newData = payload.new;
        console.log('📡 Room change:', newData);
        
        if (newData) {
            // Уведомляем о смене статуса комнаты
            if (newData.phase === 'spinning') {
                this.notifyListeners('room_spinning', newData);
            } else if (newData.phase === 'finished') {
                // Передаем полные данные о победителе
                this.notifyListeners('room_finished', {
                    winner_id: newData.winner_id,
                    winner_name: newData.winner_name,
                    prize: newData.prize_amount,
                    roundId: newData.round_number,
                    spin_result: newData.spin_result
                });
            } else if (newData.phase === 'waiting' || newData.phase === 'countdown') {
                this.notifyListeners('room_waiting', newData);
            }
            
            if (newData.round_number !== undefined) {
                this._roundId = newData.round_number;
            }
        }
    },

    loadPlayers: async function() {
        if (this._isLoading) return;
        this._isLoading = true;
        
        try {
            var response = await supabaseRestRequest(
                'pvp_room_players?room_id=eq.' + this._roomId + '&order=total_value.desc',
                'GET'
            );
            
            if (!response.ok) {
                console.error('Load players error:', await response.text());
                this._isLoading = false;
                return;
            }
            
            var newPlayers = await response.json();
            
            // Быстрая проверка изменений
            if (newPlayers.length !== this._players.length) {
                this._players = newPlayers;
                this.updateTotalPool();
                this.notifyListeners('players_loaded', this._players);
            } else {
                // Проверяем только последнюю ставку для экономии
                var changed = false;
                var lastIndex = newPlayers.length - 1;
                if (lastIndex >= 0) {
                    var oldLast = this._players[lastIndex];
                    var newLast = newPlayers[lastIndex];
                    if (oldLast && newLast) {
                        if (oldLast.user_id !== newLast.user_id ||
                            JSON.stringify(oldLast.bets) !== JSON.stringify(newLast.bets)) {
                            changed = true;
                        }
                    }
                }
                if (changed) {
                    this._players = newPlayers;
                    this.updateTotalPool();
                    this.notifyListeners('players_loaded', this._players);
                }
            }
            
        } catch (error) {
            console.error('Load players error:', error);
        }
        
        this._isLoading = false;
    },

    startPeriodicSync: function() {
        if (this._syncInterval) {
            clearInterval(this._syncInterval);
        }
        
        // Синхронизация каждую секунду
        this._syncInterval = setInterval(function() {
            if (PvPRoomManager._isConnected) {
                PvPRoomManager.loadPlayers();
            }
        }, 1000);
    },

    // ============================================================
    // addBet - ОПТИМИЗИРОВАННАЯ ВЕРСИЯ
    // ============================================================
    addBet: async function(userId, username, firstName, photoUrl, amount, currency) {
        try {
            console.log('💰 Adding bet:', userId, amount, currency);
            
            // Быстрая проверка - используем локальный кэш
            var existingPlayer = this._players.find(p => p.user_id === userId);
            var newBet = { amount: amount, currency: currency };
            
            if (existingPlayer) {
                var bets = existingPlayer.bets || [];
                bets.push(newBet);
                var totalValue = this.calculatePlayerValue(bets);
                
                var updateResponse = await supabaseRestRequest(
                    'pvp_room_players?room_id=eq.pvp_main_room&user_id=eq.' + userId,
                    'PATCH',
                    {
                        bets: bets,
                        total_value: totalValue
                    }
                );
                
                if (!updateResponse.ok) {
                    console.error('❌ Update player error:', await updateResponse.text());
                    return false;
                }
                
                // Обновляем локальный кэш сразу
                existingPlayer.bets = bets;
                existingPlayer.total_value = totalValue;
                
                console.log('✅ Player updated:', userId);
                
            } else {
                console.log('🆕 Creating new player:', userId);
                
                var color = this.getRandomColor();
                var bets = [newBet];
                var totalValue = this.calculatePlayerValue(bets);
                
                var newPlayer = {
                    room_id: this._roomId,
                    user_id: userId,
                    username: username || '',
                    first_name: firstName || 'Игрок',
                    photo_url: photoUrl || '',
                    color: color,
                    bets: bets,
                    total_value: totalValue
                };
                
                var insertResponse = await supabaseRestRequest(
                    'pvp_room_players',
                    'POST',
                    newPlayer
                );
                
                if (!insertResponse.ok) {
                    console.error('❌ Insert player error:', await insertResponse.text());
                    return false;
                }
                
                // Добавляем в локальный кэш
                this._players.push(newPlayer);
                
                console.log('✅ New player added:', userId);
            }
            
            // Обновляем пул
            this.updateTotalPool();
            this.notifyListeners('players_updated', this._players);
            
            return true;
            
        } catch (error) {
            console.error('❌ Add bet error:', error);
            return false;
        }
    },

    clearAllPlayers: async function() {
        try {
            console.log('🧹 Clearing all players from room:', this._roomId);
            
            var response = await supabaseRestRequest(
                'pvp_room_players?room_id=eq.' + this._roomId,
                'DELETE'
            );
            
            if (!response.ok) {
                console.error('Clear players error:', await response.text());
                return false;
            }
            
            this._players = [];
            this._totalPoolTon = 0;
            this._totalPoolStars = 0;
            
            this.notifyListeners('players_updated', []);
            this.notifyListeners('pool_updated', { ton: 0, stars: 0 });
            
            console.log('✅ All players cleared');
            return true;
            
        } catch (error) {
            console.error('Clear all players error:', error);
            return false;
        }
    },

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

    getPlayers: function() {
        return this._players;
    },

    getPool: function() {
        return {
            ton: this._totalPoolTon,
            stars: this._totalPoolStars
        };
    },

    getRoomId: function() {
        return this._roomId;
    },

    subscribe: function(callback) {
        this._subscriptions.push(callback);
        return function() {
            var index = this._subscriptions.indexOf(callback);
            if (index !== -1) {
                this._subscriptions.splice(index, 1);
            }
        }.bind(this);
    },

    notifyListeners: function(event, data) {
        // Используем requestAnimationFrame для плавности
        requestAnimationFrame(function() {
            PvPRoomManager._subscriptions.forEach(function(callback) {
                try {
                    callback(event, data);
                } catch (error) {
                    console.error('Listener error:', error);
                }
            });
        });
    },

    getRandomColor: function() {
        var colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#a29bfe', '#fd79a8', '#fdcb6e', '#e17055', '#00cec9'];
        return colors[Math.floor(Math.random() * colors.length)];
    },

    disconnect: function() {
        if (this._syncInterval) {
            clearInterval(this._syncInterval);
            this._syncInterval = null;
        }
        if (this._channel) {
            this._channel.unsubscribe();
            this._channel = null;
        }
        this._isConnected = false;
        this._subscriptions = [];
        console.log('🔌 Disconnected');
    }
};

window.PvPRoomManager = PvPRoomManager;
console.log('✅ PvPRoomManager loaded (optimized)');