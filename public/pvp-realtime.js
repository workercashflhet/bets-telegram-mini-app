// pvp-realtime.js - ОПТИМИЗИРОВАННАЯ ВЕРСИЯ (БЕЗ _version)

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
// PVP ROOM MANAGER - ОПТИМИЗИРОВАННАЯ ВЕРСИЯ
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
    _lastProcessedEventId: null,
    _pendingUpdates: [],
    _updateTimeout: null,
    _lastFinishedRoundId: null,
    _lastBetTimestamps: {},

    initRoom: async function() {
        try {
            var roomId = this._roomId;
            console.log('🔄 Initializing room:', roomId);
            
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
                        phase: 'waiting',
                        updated_at: new Date().toISOString()
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
                    eventsPerSecond: 10,
                    heartbeatIntervalMs: 5000
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
                    console.log('📡 Player change:', payload.eventType, payload.new?.user_id);
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
                var wasConnected = PvPRoomManager._isConnected;
                PvPRoomManager._isConnected = status === 'SUBSCRIBED';
                
                if (PvPRoomManager._isConnected && !wasConnected) {
                    PvPRoomManager.loadPlayers();
                }
                
                if (!PvPRoomManager._isConnected && wasConnected) {
                    console.warn('⚠️ Realtime connection lost, attempting to reconnect...');
                    setTimeout(function() {
                        PvPRoomManager.subscribeToRoom();
                    }, 3000);
                }
            });
    },

    handlePlayerChange: function(payload) {
        var eventType = payload.eventType;
        var newData = payload.new;
        var oldData = payload.old;
        
        // Пропускаем дублирующиеся события
        var eventId = newData?.updated_at || oldData?.updated_at || Date.now();
        if (this._lastProcessedEventId === eventId) {
            return;
        }
        this._lastProcessedEventId = eventId;
        
        // Добавляем в очередь обновлений
        this._pendingUpdates.push({
            type: 'player',
            eventType: eventType,
            newData: newData,
            oldData: oldData
        });
        
        this._processPendingUpdates();
    },

    handleRoomChange: function(payload) {
        var newData = payload.new;
        if (!newData) return;
        
        // Пропускаем дублирующиеся события
        var eventId = newData.updated_at || Date.now();
        if (this._lastProcessedEventId === eventId) {
            return;
        }
        this._lastProcessedEventId = eventId;
        
        // Добавляем в очередь обновлений
        this._pendingUpdates.push({
            type: 'room',
            data: newData
        });
        
        this._processPendingUpdates();
    },

    _processPendingUpdates: function() {
        // Дебаунс для склеивания быстрых обновлений
        if (this._updateTimeout) {
            clearTimeout(this._updateTimeout);
        }
        
        this._updateTimeout = setTimeout(function() {
            var updates = PvPRoomManager._pendingUpdates.slice();
            PvPRoomManager._pendingUpdates = [];
            
            // Обрабатываем обновления игроков
            var playerUpdates = updates.filter(function(u) { return u.type === 'player'; });
            if (playerUpdates.length > 0) {
                var lastPlayerUpdate = playerUpdates[playerUpdates.length - 1];
                PvPRoomManager._applyPlayerUpdate(lastPlayerUpdate);
            }
            
            // Обрабатываем обновления комнаты
            var roomUpdates = updates.filter(function(u) { return u.type === 'room'; });
            if (roomUpdates.length > 0) {
                var lastRoomUpdate = roomUpdates[roomUpdates.length - 1];
                PvPRoomManager._applyRoomUpdate(lastRoomUpdate);
            }
            
            // Уведомляем слушателей
            PvPRoomManager.notifyListeners('players_updated', PvPRoomManager._players);
            PvPRoomManager.updateTotalPool();
            
        }, 100);
    },

    _applyPlayerUpdate: function(update) {
        var eventType = update.eventType;
        var newData = update.newData;
        var oldData = update.oldData;
        
        switch(eventType) {
            case 'INSERT':
                if (!this._players.find(p => p.user_id === newData.user_id)) {
                    this._players.push(newData);
                    this.notifyListeners('player_added', newData);
                }
                break;
                
            case 'UPDATE':
                var index = this._players.findIndex(p => p.user_id === newData.user_id);
                if (index !== -1) {
                    // Обновляем только если данные изменились
                    var oldPlayer = this._players[index];
                    if (JSON.stringify(oldPlayer.bets) !== JSON.stringify(newData.bets) ||
                        oldPlayer.total_value !== newData.total_value) {
                        this._players[index] = newData;
                        this.notifyListeners('player_updated', newData);
                    }
                } else {
                    this._players.push(newData);
                    this.notifyListeners('player_added', newData);
                }
                break;
                
            case 'DELETE':
                this._players = this._players.filter(p => p.user_id !== oldData.user_id);
                this.notifyListeners('player_removed', oldData);
                break;
        }
    },

    _applyRoomUpdate: function(update) {
        var newData = update.data;
        console.log('📡 Room update:', newData.phase, 'Round:', newData.round_number);
        
        if (newData.phase === 'spinning') {
            this.notifyListeners('room_spinning', newData);
        } else if (newData.phase === 'finished' && newData.winner_id) {
            // Проверяем, не было ли уже обработано это завершение
            if (this._lastFinishedRoundId !== newData.round_number) {
                this._lastFinishedRoundId = newData.round_number;
                this.notifyListeners('room_finished', {
                    winner_id: newData.winner_id,
                    winner_name: newData.winner_name,
                    prize: newData.prize_amount,
                    roundId: newData.round_number,
                    spin_result: newData.spin_result
                });
            }
        } else if (newData.phase === 'waiting' || newData.phase === 'countdown') {
            this.notifyListeners('room_waiting', newData);
        }
        
        if (newData.round_number !== undefined) {
            this._roundId = newData.round_number;
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
            
            // Проверяем, изменились ли данные
            var changed = false;
            if (newPlayers.length !== this._players.length) {
                changed = true;
            } else {
                for (var i = 0; i < newPlayers.length; i++) {
                    var old = this._players[i];
                    var fresh = newPlayers[i];
                    if (!old || old.user_id !== fresh.user_id || 
                        JSON.stringify(old.bets) !== JSON.stringify(fresh.bets)) {
                        changed = true;
                        break;
                    }
                }
            }
            
            if (changed) {
                this._players = newPlayers;
                this.updateTotalPool();
                this.notifyListeners('players_loaded', this._players);
            }
            
        } catch (error) {
            console.error('Load players error:', error);
        }
        
        this._isLoading = false;
    },

    // АТОМАРНОЕ ДОБАВЛЕНИЕ СТАВКИ (без _version)
    addBet: async function(userId, username, firstName, photoUrl, amount, currency) {
        try {
            console.log('💰 Adding bet:', userId, amount, currency);
            
            // Проверяем дублирование ставки за последние 3 секунды
            var now = Date.now();
            if (this._lastBetTimestamps && this._lastBetTimestamps[userId] && 
                now - this._lastBetTimestamps[userId] < 3000) {
                console.warn('⚠️ Bet too fast, ignoring...');
                return true;
            }
            
            if (!this._lastBetTimestamps) {
                this._lastBetTimestamps = {};
            }
            this._lastBetTimestamps[userId] = now;
            
            var clientBetId = userId + '_' + now + '_' + Math.random().toString(36).substr(2, 6);
            
            // Проверяем, существует ли уже игрок в локальном состоянии
            var existingPlayer = this._players.find(p => p.user_id === userId);
            var newBet = { 
                amount: amount, 
                currency: currency,
                client_id: clientBetId,
                timestamp: new Date().toISOString()
            };
            
            if (existingPlayer) {
                // Проверяем, не дублируется ли ставка
                var bets = existingPlayer.bets || [];
                var isDuplicate = bets.some(function(b) { 
                    return b.client_id === clientBetId; 
                });
                
                if (isDuplicate) {
                    console.warn('⚠️ Duplicate bet detected:', clientBetId);
                    return true;
                }
                
                bets.push(newBet);
                var totalValue = this.calculatePlayerValue(bets);
                
                // Обновляем существующего игрока
                var updateResponse = await supabaseRestRequest(
                    'pvp_room_players?room_id=eq.pvp_main_room&user_id=eq.' + userId,
                    'PATCH',
                    {
                        bets: bets,
                        total_value: totalValue,
                        updated_at: new Date().toISOString()
                    }
                );
                
                if (!updateResponse.ok) {
                    var errorText = await updateResponse.text();
                    console.error('❌ Update player error:', errorText);
                    
                    // Если ошибка 404 - игрок не найден, создаем заново
                    if (updateResponse.status === 404 || errorText.includes('Not Found')) {
                        // Создаем нового игрока
                        var color = this.getRandomColor();
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
                            console.error('❌ Insert after update failed:', await insertResponse.text());
                            return false;
                        }
                        
                        // Обновляем локальное состояние
                        var existingIndex = this._players.findIndex(p => p.user_id === userId);
                        if (existingIndex !== -1) {
                            this._players[existingIndex] = newPlayer;
                        } else {
                            this._players.push(newPlayer);
                        }
                        console.log('✅ Player re-created after update fail:', userId);
                    } else {
                        return false;
                    }
                } else {
                    // Обновляем локальные данные
                    existingPlayer.bets = bets;
                    existingPlayer.total_value = totalValue;
                    console.log('✅ Player updated:', userId);
                }
                
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
                    var errorText = await insertResponse.text();
                    console.error('❌ Insert player error:', errorText);
                    
                    // Проверяем, может игрок уже существует (конфликт уникальности)
                    if (errorText.includes('duplicate key') || 
                        errorText.includes('23505') ||
                        errorText.includes('already exists')) {
                        
                        // Пробуем обновить существующего
                        var existing = this._players.find(p => p.user_id === userId);
                        if (existing) {
                            var existingBets = existing.bets || [];
                            // Проверяем дубликат в существующих ставках
                            var existingDuplicate = existingBets.some(function(b) { 
                                return b.client_id === clientBetId; 
                            });
                            
                            if (existingDuplicate) {
                                console.warn('⚠️ Duplicate bet in existing player');
                                return true;
                            }
                            
                            existingBets.push(newBet);
                            var existingTotal = this.calculatePlayerValue(existingBets);
                            
                            var retryResponse = await supabaseRestRequest(
                                'pvp_room_players?room_id=eq.pvp_main_room&user_id=eq.' + userId,
                                'PATCH',
                                {
                                    bets: existingBets,
                                    total_value: existingTotal,
                                    updated_at: new Date().toISOString()
                                }
                            );
                            
                            if (!retryResponse.ok) {
                                console.error('❌ Retry update failed:', await retryResponse.text());
                                return false;
                            }
                            
                            existing.bets = existingBets;
                            existing.total_value = existingTotal;
                            console.log('✅ Player updated after conflict:', userId);
                        } else {
                            // Загружаем игрока из БД
                            var loaded = await this.loadPlayer(userId);
                            if (loaded) {
                                var loadedBets = loaded.bets || [];
                                loadedBets.push(newBet);
                                var loadedTotal = this.calculatePlayerValue(loadedBets);
                                
                                var loadRetry = await supabaseRestRequest(
                                    'pvp_room_players?room_id=eq.pvp_main_room&user_id=eq.' + userId,
                                    'PATCH',
                                    {
                                        bets: loadedBets,
                                        total_value: loadedTotal,
                                        updated_at: new Date().toISOString()
                                    }
                                );
                                
                                if (!loadRetry.ok) {
                                    console.error('❌ Load retry failed:', await loadRetry.text());
                                    return false;
                                }
                                
                                loaded.bets = loadedBets;
                                loaded.total_value = loadedTotal;
                                this._players.push(loaded);
                                console.log('✅ Player loaded and updated:', userId);
                            } else {
                                return false;
                            }
                        }
                    } else {
                        return false;
                    }
                } else {
                    this._players.push(newPlayer);
                    console.log('✅ New player added:', userId);
                }
            }
            
            this.updateTotalPool();
            this.notifyListeners('players_updated', this._players);
            
            return true;
            
        } catch (error) {
            console.error('❌ Add bet error:', error);
            return false;
        }
    },

    // Загрузка одного игрока
    loadPlayer: async function(userId) {
        try {
            var response = await supabaseRestRequest(
                'pvp_room_players?room_id=eq.' + this._roomId + '&user_id=eq.' + userId,
                'GET'
            );
            
            if (!response.ok) return null;
            
            var data = await response.json();
            return data[0] || null;
            
        } catch (error) {
            console.error('Load player error:', error);
            return null;
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
            this._lastFinishedRoundId = null;
            this._lastBetTimestamps = {};
            
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