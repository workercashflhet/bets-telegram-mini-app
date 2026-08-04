// ice-arena-realtime.js - Realtime синхронизация для Ice Arena

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
// ICE ARENA ROOM MANAGER
// ============================================================

var IceArenaRoomManager = {
    _roomId: 'ice_arena_room',
    _channel: null,
    _subscriptions: [],
    _players: [],
    _roundId: 0,
    _isConnected: false,
    _totalPoolTon: 0,
    _totalPoolStars: 0,
    _lastProcessedEventId: null,
    _pendingUpdates: [],
    _updateTimeout: null,
    _lastFinishedRoundId: null,
    _lastBetTimestamps: {},
    _isLoading: false,

    initRoom: async function() {
        try {
            var roomId = this._roomId;
            console.log('🔄 Initializing Ice Arena room:', roomId);
            
            // Проверяем существование комнаты
            var checkResponse = await supabaseRestRequest(
                'ice_arena_rooms?room_id=eq.' + roomId,
                'GET'
            );
            
            if (!checkResponse.ok) {
                console.error('Check room error:', await checkResponse.text());
                return false;
            }
            
            var existingRooms = await checkResponse.json();
            
            if (!existingRooms || existingRooms.length === 0) {
                console.log('📝 Creating Ice Arena room...');
                var createResponse = await supabaseRestRequest(
                    'ice_arena_rooms',
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
                console.log('✅ Ice Arena room created');
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
        console.log('📡 Subscribing to Ice Arena room:', roomId);
        
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
            .channel('ice_arena_room_' + roomId)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'ice_arena_players',
                    filter: 'room_id=eq.' + roomId
                },
                function(payload) {
                    console.log('📡 Player change:', payload.eventType, payload.new?.user_id);
                    IceArenaRoomManager.handlePlayerChange(payload);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'ice_arena_rooms',
                    filter: 'room_id=eq.' + roomId
                },
                function(payload) {
                    console.log('📡 Room change:', payload.eventType);
                    IceArenaRoomManager.handleRoomChange(payload);
                }
            )
            .subscribe(function(status) {
                console.log('📡 Subscription status:', status);
                var wasConnected = IceArenaRoomManager._isConnected;
                IceArenaRoomManager._isConnected = status === 'SUBSCRIBED';
                
                if (IceArenaRoomManager._isConnected && !wasConnected) {
                    IceArenaRoomManager.loadPlayers();
                }
                
                if (!IceArenaRoomManager._isConnected && wasConnected) {
                    console.warn('⚠️ Realtime connection lost, attempting to reconnect...');
                    setTimeout(function() {
                        IceArenaRoomManager.subscribeToRoom();
                    }, 3000);
                }
            });
    },

    handlePlayerChange: function(payload) {
        var eventType = payload.eventType;
        var newData = payload.new;
        var oldData = payload.old;
        
        var eventId = newData?.updated_at || oldData?.updated_at || Date.now();
        if (this._lastProcessedEventId === eventId) {
            return;
        }
        this._lastProcessedEventId = eventId;
        
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
        
        var eventId = newData.updated_at || Date.now();
        if (this._lastProcessedEventId === eventId) {
            return;
        }
        this._lastProcessedEventId = eventId;
        
        this._pendingUpdates.push({
            type: 'room',
            data: newData
        });
        
        this._processPendingUpdates();
    },

    _processPendingUpdates: function() {
        if (this._updateTimeout) {
            clearTimeout(this._updateTimeout);
        }
        
        this._updateTimeout = setTimeout(function() {
            var updates = IceArenaRoomManager._pendingUpdates.slice();
            IceArenaRoomManager._pendingUpdates = [];
            
            var playerUpdates = updates.filter(function(u) { return u.type === 'player'; });
            if (playerUpdates.length > 0) {
                var lastPlayerUpdate = playerUpdates[playerUpdates.length - 1];
                IceArenaRoomManager._applyPlayerUpdate(lastPlayerUpdate);
            }
            
            var roomUpdates = updates.filter(function(u) { return u.type === 'room'; });
            if (roomUpdates.length > 0) {
                var lastRoomUpdate = roomUpdates[roomUpdates.length - 1];
                IceArenaRoomManager._applyRoomUpdate(lastRoomUpdate);
            }
            
            IceArenaRoomManager.notifyListeners('players_updated', IceArenaRoomManager._players);
            IceArenaRoomManager.updateTotalPool();
            
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
        console.log('📡 Ice Arena room update:', newData.phase, 'Round:', newData.round_number);
        
        if (newData.phase === 'spinning') {
            this.notifyListeners('room_spinning', newData);
        } else if (newData.phase === 'finished' && newData.winner_id) {
            if (this._lastFinishedRoundId !== newData.round_number) {
                this._lastFinishedRoundId = newData.round_number;
                this.notifyListeners('room_finished', {
                    winner_id: newData.winner_id,
                    winner_name: newData.winner_name,
                    prize: newData.prize_amount,
                    roundId: newData.round_number,
                    winner_zone: newData.winner_zone,
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
                'ice_arena_players?room_id=eq.' + this._roomId + '&order=total_value.desc',
                'GET'
            );
            
            if (!response.ok) {
                console.error('Load players error:', await response.text());
                this._isLoading = false;
                return;
            }
            
            var newPlayers = await response.json();
            
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

    addBet: async function(userId, username, firstName, photoUrl, amount, currency) {
        try {
            console.log('💰 Adding Ice Arena bet:', userId, amount, currency);
            
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
            
            var existingPlayer = this._players.find(p => p.user_id === userId);
            var newBet = { 
                amount: amount, 
                currency: currency,
                client_id: clientBetId,
                timestamp: new Date().toISOString()
            };
            
            if (existingPlayer) {
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
                
                var updateResponse = await supabaseRestRequest(
                    'ice_arena_players?room_id=eq.' + this._roomId + '&user_id=eq.' + userId,
                    'PATCH',
                    {
                        bets: bets,
                        total_value: totalValue,
                        updated_at: new Date().toISOString()
                    }
                );
                
                if (!updateResponse.ok) {
                    console.error('❌ Update player error:', await updateResponse.text());
                    return false;
                }
                
                existingPlayer.bets = bets;
                existingPlayer.total_value = totalValue;
                console.log('✅ Player updated:', userId);
                
            } else {
                console.log('🆕 Creating new Ice Arena player:', userId);
                
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
                    'ice_arena_players',
                    'POST',
                    newPlayer
                );
                
                if (!insertResponse.ok) {
                    var errorText = await insertResponse.text();
                    console.error('❌ Insert player error:', errorText);
                    
                    if (errorText.includes('duplicate key') || 
                        errorText.includes('23505') ||
                        errorText.includes('already exists')) {
                        
                        var existing = this._players.find(p => p.user_id === userId);
                        if (existing) {
                            var existingBets = existing.bets || [];
                            existingBets.push(newBet);
                            var existingTotal = this.calculatePlayerValue(existingBets);
                            
                            var retryResponse = await supabaseRestRequest(
                                'ice_arena_players?room_id=eq.' + this._roomId + '&user_id=eq.' + userId,
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
                            return false;
                        }
                    } else {
                        return false;
                    }
                } else {
                    this._players.push(newPlayer);
                    console.log('✅ New Ice Arena player added:', userId);
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

    clearAllPlayers: async function() {
        try {
            console.log('🧹 Clearing all Ice Arena players from room:', this._roomId);
            
            var response = await supabaseRestRequest(
                'ice_arena_players?room_id=eq.' + this._roomId,
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
            
            console.log('✅ All Ice Arena players cleared');
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
                    IceArenaRoomManager._totalPoolTon += bet.amount;
                } else {
                    IceArenaRoomManager._totalPoolStars += bet.amount;
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
            IceArenaRoomManager._subscriptions.forEach(function(callback) {
                try {
                    callback(event, data);
                } catch (error) {
                    console.error('Listener error:', error);
                }
            });
        });
    },

    getRandomColor: function() {
        // Цвета из палитры #05ff26 (разные оттенки)
        var colors = [
            '#05ff26', '#1aff3a', '#33ff4d', '#4cff60', '#66ff73',
            '#80ff86', '#99ff99', '#b2ffab', '#ccffbe', '#e5ffd1',
            '#00e620', '#00cc1a', '#00b314', '#00990e', '#008008'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    },

    disconnect: function() {
        if (this._channel) {
            this._channel.unsubscribe();
            this._channel = null;
        }
        this._isConnected = false;
        this._subscriptions = [];
        console.log('🔌 Ice Arena disconnected');
    }
};

window.IceArenaRoomManager = IceArenaRoomManager;
console.log('✅ IceArenaRoomManager loaded');