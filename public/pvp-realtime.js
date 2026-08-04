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
// PVP ROOM MANAGER - ЕДИНАЯ КОМНАТА ДЛЯ ВСЕХ
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

    initRoom: async function() {
        try {
            var roomId = this._roomId;
            
            console.log('🔄 Initializing room:', roomId);
            
            var { data: existingRoom, error: findError } = await supabaseClient
                .from('pvp_rooms')
                .select('*')
                .eq('room_id', roomId)
                .maybeSingle();
            
            if (findError && findError.code !== 'PGRST116') {
                console.error('Find room error:', findError);
            }
            
            if (!existingRoom) {
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
        }
        
        var roomId = this._roomId;
        
        console.log('📡 Subscribing to room:', roomId);
        
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
                    console.log('📡 Player change:', payload.eventType, payload.new || payload.old);
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
                    // ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ
                    this.forceUpdate();
                }
                break;
                
            case 'UPDATE':
                var index = this._players.findIndex(p => p.user_id === newData.user_id);
                if (index !== -1) {
                    // Обновляем существующего игрока
                    this._players[index] = newData;
                } else {
                    this._players.push(newData);
                }
                this.updateTotalPool();
                this.notifyListeners('player_updated', newData);
                // ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ
                this.forceUpdate();
                break;
                
            case 'DELETE':
                this._players = this._players.filter(p => p.user_id !== oldData.user_id);
                this.updateTotalPool();
                this.notifyListeners('player_removed', oldData);
                this.forceUpdate();
                break;
        }
        
        this.notifyListeners('players_updated', this._players);
    },

    handleRoomChange: function(payload) {
        var newData = payload.new;
        console.log('📡 Room status:', newData.status);
        
        if (newData.status === 'spinning') {
            this.notifyListeners('room_spinning', newData);
        } else if (newData.status === 'finished') {
            this.notifyListeners('room_finished', newData);
        } else if (newData.status === 'waiting') {
            this.notifyListeners('room_waiting', newData);
        }
        
        this._roundId = newData.round_number || 0;
    },

    // ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ
    forceUpdate: function() {
        var now = Date.now();
        if (now - this._lastUpdate > 100) { // Не чаще чем раз в 100мс
            this._lastUpdate = now;
            // Перезагружаем игроков и обновляем UI
            this.loadPlayers().then(function() {
                console.log('🔄 Force update complete');
            });
        }
    },

    loadPlayers: async function() {
        try {
            console.log('📥 Loading players for room:', this._roomId);
            
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

    addBet: async function(userId, username, firstName, photoUrl, amount, currency) {
        try {
            console.log('💰 Adding bet:', userId, amount, currency);
            
            var existingPlayer = this._players.find(p => p.user_id === userId);
            
            var newBet = { amount: amount, currency: currency };
            
            if (existingPlayer) {
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
                
                console.log('✅ Player updated:', userId);
                
            } else {
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
                
                console.log('✅ New player added:', userId);
            }
            
            this.updateTotalPool();
            
            // ПРИНУДИТЕЛЬНО ОБНОВЛЯЕМ СРАЗУ
            await this.loadPlayers();
            
            return true;
            
        } catch (error) {
            console.error('Add bet error:', error);
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
        this._subscriptions.forEach(function(callback) {
            try {
                callback(event, data);
            } catch (error) {
                console.error('Listener error:', error);
            }
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
    }
};

window.PvPRoomManager = PvPRoomManager;
console.log('✅ PvPRoomManager loaded');