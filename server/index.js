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

const QUESTION_DURATION = 15;
const ROUND_RESULT_DURATION = 8;

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Create a Room
  socket.on('create_room', ({ player, config }) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    
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
    io.to(roomId).emit('update_players', rooms.get(roomId).players);
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
      // If simply reconnecting with same socket ID, just update. 
      // If different socket but same name, reject or overwrite.
      // For simplicity, we assume same session re-join is okay, but strictly duplications are bad.
      if (room.players[existingPlayerIndex].id === socket.id) {
         // Already in room, ignore
         return;
      }
      socket.emit('error', 'Você já está nesta sala ou o nome já está em uso.');
      return;
    }

    room.players.push({ ...player, id: socket.id, score: 0, streak: 0 });
    socket.join(roomId);
    
    io.to(roomId).emit('update_players', room.players);
    console.log(`${player.name} joined room ${roomId}`);
  });

  // Start Game
  socket.on('start_game', async ({ roomId, questions }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;

    room.questions = questions; 
    room.currentQuestionIndex = 0;
    room.phase = 'PLAYING';

    io.to(roomId).emit('game_started', { questions: room.questions, players: room.players });
    
    // Server-side timer orchestration could happen here, 
    // but for this version we let clients handle their sync via startRound
    // startRound(roomId); 
  });

  // Handle Answer
  socket.on('submit_answer', ({ roomId, answerIndex, scoreToAdd }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    // Use score calculated by client (trusted client for this demo) or calculate server side
    // Updating score
    player.score += scoreToAdd;
    if (scoreToAdd > 0) {
        player.streak += 1;
        player.correctAnswersCount = (player.correctAnswersCount || 0) + 1;
    } else {
        player.streak = 0;
    }
    
    // Broadcast updated scores immediately so everyone sees the live leaderboard
    io.to(roomId).emit('update_players', room.players); 
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    rooms.forEach((room, roomId) => {
      const index = room.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        room.players.splice(index, 1);
        io.to(roomId).emit('update_players', room.players);
        
        if (room.players.length === 0) {
          rooms.delete(roomId);
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});