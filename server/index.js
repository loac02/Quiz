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
    
    rooms.set(roomId, {
      id: roomId,
      hostId: socket.id,
      players: [{ ...player, id: socket.id, score: 0, streak: 0 }],
      config: config,
      phase: 'LOBBY',
      questions: []
    });

    socket.join(roomId);
    socket.emit('room_created', { roomId });
    // Emit initial players AND config
    io.to(roomId).emit('update_players', rooms.get(roomId).players);
    io.to(roomId).emit('room_config_updated', config);
    console.log(`Room ${roomId} created by ${player.name}`);
  });

  // Join a Room
  socket.on('join_room', ({ roomId, player }) => {
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('error', 'Sala não encontrada');
      return;
    }

    if (room.phase !== 'LOBBY') {
      socket.emit('error', 'O jogo já começou');
      return;
    }

    if (room.players.length >= 8) {
      socket.emit('error', 'Sala cheia');
      return;
    }

    // Prevent Duplicates
    const existingPlayerIndex = room.players.findIndex(p => p.id === socket.id || p.name === player.name);
    if (existingPlayerIndex !== -1) {
      if (room.players[existingPlayerIndex].id === socket.id) {
         return;
      }
      socket.emit('error', 'Você já está nesta sala ou o nome já está em uso.');
      return;
    }

    room.players.push({ ...player, id: socket.id, score: 0, streak: 0 });
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
      
      // SECURITY CHECK: Only the first player (Host) can update config
      // This prevents joiners from accidentally overwriting the host's settings
      if (room.players.length > 0 && room.players[0].id !== socket.id) {
         return; 
      }
      
      // Update server state
      room.config = config;
      
      // Broadcast to everyone else in room
      socket.to(roomId).emit('room_config_updated', config);
  });

  // Start Game
  socket.on('start_game', async ({ roomId, questions }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    
    // Only Host can start (double check)
    // Using hostId or index 0
    if (room.players.length > 0 && room.players[0].id !== socket.id) return;

    room.questions = questions; 
    room.currentQuestionIndex = 0;
    room.phase = 'PLAYING';

    // Broadcast both the Questions AND the Final Config to ensure everyone plays the same game
    io.to(roomId).emit('game_started', { 
        roomId: roomId, // CRITICAL: Send roomId back so clients know where to submit answers
        questions: room.questions, 
        players: room.players,
        config: room.config 
    });
  });

  // Handle Answer
  socket.on('submit_answer', ({ roomId, answerIndex, scoreToAdd }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

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
      const index = room.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        room.players.splice(index, 1);
        io.to(roomId).emit('update_players', room.players);
        
        // If Host leaves, maybe assign new host? For now, if empty delete.
        if (room.players.length === 0) {
          rooms.delete(roomId);
        } else if (socket.id === room.hostId) {
            // Assign new host to next player
            room.hostId = room.players[0].id;
            // Optionally notify clients of new host, but currently UI infers host from list index 0
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});