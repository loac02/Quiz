const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // In production, replace with your frontend URL
    methods: ["GET", "POST"]
  }
});

// Game State Storage (In-memory for simplicity)
const rooms = new Map();

// Helper to generate clean Room IDs (No 0 or O)
const generateRoomId = () => {
  const chars = '123456789ABCDEFGHIJKLMNPQRSTUVWXYZ'; // Removed 0 and O
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Create a Room
  socket.on('create_room', ({ player, config }) => {
    // Generate a unique clean ID
    let roomId = generateRoomId();
    while (rooms.has(roomId)) {
        roomId = generateRoomId();
    }
    
    // IMPORTANT: We store socketId separately and KEEP the original player.id (stable)
    rooms.set(roomId, {
      id: roomId,
      hostId: socket.id, // Host connection ID
      players: [{ ...player, socketId: socket.id, score: 0, streak: 0 }],
      config: config,
      phase: 'LOBBY',
      questions: []
    });

    socket.join(roomId);
    socket.emit('room_created', { roomId });
    // Emit initial players AND config
    io.to(roomId).emit('update_players', rooms.get(roomId).players);
    io.to(roomId).emit('room_config_updated', config);
    console.log(`Room ${roomId} created by ${player.name} (ID: ${player.id})`);
  });

  // Join a Room
  socket.on('join_room', ({ roomId, player }) => {
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('error', 'Sala não encontrada');
      return;
    }

    if (room.phase !== 'LOBBY') {
      // Allow rejoin if player ID matches an existing one
      const existingInGame = room.players.find(p => p.id === player.id);
      if (!existingInGame) {
          socket.emit('error', 'O jogo já começou');
          return;
      }
    }

    if (room.players.length >= 8) {
       // Allow rejoin even if full (it's the same slot)
       const existingInGame = room.players.find(p => p.id === player.id);
       if (!existingInGame) {
          socket.emit('error', 'Sala cheia');
          return;
       }
    }

    // Duplicate/Rejoin Logic using STABLE ID
    const existingPlayerIndex = room.players.findIndex(p => p.id === player.id);
    
    if (existingPlayerIndex !== -1) {
      const existingPlayer = room.players[existingPlayerIndex];
      
      console.log(`Player rejoin detected: ${player.name} (Old Socket: ${existingPlayer.socketId} -> New: ${socket.id})`);
      
      // CRITICAL FIX: If this player was the host (checked by old socketId OR if they are the first player), 
      // transfer host privileges to the new socket connection.
      if (room.hostId === existingPlayer.socketId || existingPlayerIndex === 0) {
          console.log(`Transferring Host privileges in Room ${roomId} to ${socket.id}`);
          room.hostId = socket.id;
      }

      // Update the transport ID (socketId)
      room.players[existingPlayerIndex].socketId = socket.id;
      
      socket.join(roomId);
      
      // Update client with current state
      io.to(roomId).emit('update_players', room.players);
      socket.emit('room_config_updated', room.config);
      
      if (room.phase === 'PLAYING') {
          // Send game state to reconnecting player
          socket.emit('game_started', { 
              roomId: roomId, 
              questions: room.questions, 
              players: room.players,
              config: room.config 
          });
      }
      return;
    }

    // New Player
    room.players.push({ ...player, socketId: socket.id, score: 0, streak: 0 });
    socket.join(roomId);
    
    // Broadcast players update
    io.to(roomId).emit('update_players', room.players);
    
    // Send current config to the new joiner so they are synced with Host
    socket.emit('room_config_updated', room.config);
    
    console.log(`${player.name} joined room ${roomId}`);
  });

  // Update Config (Host only)
  socket.on('update_config', ({ roomId, config }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      
      // Check if sender is host by socketId
      if (room.hostId !== socket.id) {
          return; 
      }
      
      room.config = config;
      socket.to(roomId).emit('room_config_updated', config);
  });

  // Start Game
  // Added 'callback' parameter to confirm receipt to client
  socket.on('start_game', async ({ roomId, questions }, callback) => {
    const room = rooms.get(roomId);
    if (!room) {
        if (callback) callback({ error: 'Sala não encontrada' });
        return;
    }
    
    // Only Host can start
    if (room.hostId !== socket.id) {
        console.warn(`Unauthorized start attempt by ${socket.id} in room ${roomId} (Host is ${room.hostId})`);
        if (callback) callback({ error: 'Apenas o Host pode iniciar o jogo' });
        return;
    }

    room.questions = questions; 
    room.currentQuestionIndex = 0;
    room.phase = 'PLAYING';

    io.to(roomId).emit('game_started', { 
        roomId: roomId, 
        questions: room.questions, 
        players: room.players,
        config: room.config 
    });

    if (callback) callback({ success: true });
  });

  // Handle Answer
  socket.on('submit_answer', ({ roomId, answerIndex, scoreToAdd }) => {
    const room = rooms.get(roomId);
    if (!room) {
        return;
    }

    // Find player by Socket ID (Transport)
    const player = room.players.find(p => p.socketId === socket.id);
    
    if (!player) {
        return;
    }

    console.log(`Score update for ${player.name}: +${scoreToAdd} (Streak: ${player.streak})`);

    player.score += scoreToAdd;
    if (scoreToAdd > 0) {
        player.streak += 1;
        player.correctAnswersCount = (player.correctAnswersCount || 0) + 1;
    } else {
        player.streak = 0;
    }
    
    io.to(roomId).emit('update_players', room.players); 
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    rooms.forEach((room, roomId) => {
      const index = room.players.findIndex(p => p.socketId === socket.id);
      if (index !== -1) {
        // We DO NOT remove the player immediately on disconnect to allow refresh/reconnect.
        // If it's the host, we might need to migrate host, but for now we keep it simple.
        
        if (room.phase === 'LOBBY') {
             room.players.splice(index, 1);
             io.to(roomId).emit('update_players', room.players);
             if (room.players.length === 0) {
                rooms.delete(roomId);
             } else if (room.hostId === socket.id) {
                 // Pass host to next player if lobby
                 room.hostId = room.players[0].socketId;
             }
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});