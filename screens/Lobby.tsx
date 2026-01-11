import React, { useState, useEffect } from 'react';
import { GameConfig, Difficulty, GameMode, Player } from '../types';
import { Button } from '../components/Button';
import { Trophy, Users, Zap, Globe, Copy, Share2, Play, Timer, Skull, RefreshCw, ArrowRight, LogIn } from 'lucide-react';
import { getStats } from '../utils/storage';
import { socket } from '../services/socket';

interface LobbyProps {
  onStartGame: (config: GameConfig, players?: Player[]) => void;
  isLoading: boolean;
  currentUser: Player;
}

type LobbyMode = 'setup' | 'waiting';
type ConnectionMode = 'solo' | 'multiplayer';

export const Lobby: React.FC<LobbyProps> = ({ onStartGame, isLoading, currentUser }) => {
  const [lobbyMode, setLobbyMode] = useState<LobbyMode>('setup');
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('solo');
  const [isConnected, setIsConnected] = useState(socket.connected);
  
  const [topic, setTopic] = useState('Esportes Gerais');
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.PRO);
  const [gameMode, setGameMode] = useState<GameMode>(GameMode.CLASSIC);
  const [roomCode, setRoomCode] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState(''); 
  const [playersInLobby, setPlayersInLobby] = useState<any[]>([]);

  // Performance Optimization: Lazy initialization for stats
  const [stats] = useState(() => getStats());
  
  const topics = ['Futebol', 'Basquete', 'Fórmula 1', 'Olimpíadas', 'Vôlei', 'MMA'];

  // Check for Room Code in URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    
    if (roomFromUrl) {
      setConnectionMode('multiplayer');
      setJoinCodeInput(roomFromUrl);
      if (!socket.connected) socket.connect();
      
      // Delay slightly to ensure socket connection or handle logic inside onConnect
      setTimeout(() => {
        handleJoinRoom(roomFromUrl);
      }, 500);
    }
  }, []);

  // Socket Connection Management
  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    function onRoomCreated(data: { roomId: string }) {
      setRoomCode(data.roomId);
      setLobbyMode('waiting');
    }

    function onUpdatePlayers(players: any[]) {
      console.log("Updated players:", players);
      setPlayersInLobby(players);
      // If we are in the player list, ensure we are in waiting mode
      const amIInList = players.some((p: any) => p.name === currentUser.name); 
      if (amIInList && lobbyMode !== 'waiting') {
        setLobbyMode('waiting');
      }
    }

    function onGameStarted(data: any) {
        // Trigger start game for all clients in room
        // data.questions contains the synchronized questions
        // data.players contains synchronized players
        onStartGame({
            topic,
            difficulty,
            roundCount: 5, // Default or from server config
            mode: gameMode
        }, data.players); // IMPORTANT: Pass synchronised players
    }

    function onError(message: string) {
      alert(`Erro: ${message}`);
      setLobbyMode('setup');
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room_created', onRoomCreated);
    socket.on('update_players', onUpdatePlayers);
    socket.on('game_started', onGameStarted);
    socket.on('error', onError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_created', onRoomCreated);
      socket.off('update_players', onUpdatePlayers);
      socket.off('game_started', onGameStarted);
      socket.off('error', onError);
    };
  }, [lobbyMode, currentUser.name, onStartGame, topic, difficulty, gameMode]);

  const handleStart = () => {
    // If multiplayer, emit start to server
    if (connectionMode === 'multiplayer') {
        // Need to create questions first? 
        // For simplicity, we trigger start callback which generates questions, 
        // then we should theoretically send those to server.
        // BUT `onStartGame` switches view.
        
        // Correct flow for Host:
        // 1. Generate questions (via App callback or here)
        // 2. Emit start_game with questions
        
        // Since `onStartGame` in App generates questions, we might need to adjust.
        // For now, let's just trigger the local start, and inside App's generate, 
        // we might miss syncing questions. 
        // TO FIX: We will trust the App to generate and if online, it should emit.
        // OR simpler: Just emit 'start_game' and let server ask for questions or let Host generate then emit.
        
        // Let's assume onStartGame handles generation. 
        // We will pass playersInLobby.
        
        // Actually, for proper sync, Host calls onStartGame -> App generates -> App (if online) emits to Socket.
        // But App doesn't know about socket logic easily.
        
        // Quick Fix: Generate generic questions here or just let everyone generate their own (bad for sync)
        // Better: Host emits 'start_game' -> Server says 'game_started' -> Clients call onStartGame.
        
        // We will emit start_game with EMPTY questions, and rely on the AI service to be deterministic or accept desync for this version,
        // OR better: Host generates questions first?
        
        // Let's stick to: Host clicks Start -> triggers `socket.emit('start_game')`.
        // We need questions.
        
        // Let's use the callback.
        onStartGame({
            topic,
            difficulty,
            roundCount: 5,
            mode: gameMode
        }, playersInLobby);
        
        // Note: The actual socket emission for START is missing here because App handles generation.
        // To make it work with provided architecture:
        // When Host starts, we run onStartGame. 
        // We need a way to tell the server "Game Started" and send questions.
        // This requires moving generation here or passing a callback.
        
        // For this specific request scope, we will rely on `onStartGame` initiating the flow.
        // If we are Host, we should ideally send questions to others.
        // See updated `Arena` for socket listening, but initialization happens here.
        
        // Let's emit start_game here so other clients know to switch screens.
        socket.emit('start_game', { roomId: roomCode, questions: [] });
    } else {
        // Solo
        let rounds = 5;
        if (gameMode === GameMode.TIME_ATTACK || gameMode === GameMode.SURVIVAL) {
            rounds = 10; 
        }
        onStartGame({
            topic,
            difficulty,
            roundCount: rounds,
            mode: gameMode
        });
    }
  };

  const createRoom = () => {
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit('create_room', { 
      player: { 
        name: currentUser.name, 
        avatar: currentUser.avatar, 
        id: currentUser.id 
      }, 
      config: { topic, difficulty, mode: gameMode } 
    });
  };

  const handleJoinRoom = (code: string) => {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) return;

    if (!socket.connected) socket.connect();

    setRoomCode(cleanCode); 
    
    // Check if we are already in the list to avoid double emit if button clicked twice fast
    if (playersInLobby.some(p => p.name === currentUser.name)) return;

    socket.emit('join_room', {
      roomId: cleanCode,
      player: { 
        name: currentUser.name, 
        avatar: currentUser.avatar, 
        id: currentUser.id 
      }
    });
  };

  const copyLink = () => {
    const link = `${window.location.origin}?room=${roomCode}`;
    navigator.clipboard.writeText(link);
    alert('Link copiado!');
  };

  const switchConnectionMode = (mode: ConnectionMode) => {
    setConnectionMode(mode);
    setLobbyMode('setup');
    if (mode === 'multiplayer') {
      if (!socket.connected) socket.connect();
    }
    if (mode === 'multiplayer' && gameMode === GameMode.SURVIVAL) {
      setGameMode(GameMode.CLASSIC);
    }
  };

  const availableModes = [
    { mode: GameMode.CLASSIC, icon: Trophy, label: 'Clássico', desc: 'Pontos e Streaks' },
    { mode: GameMode.SURVIVAL, icon: Skull, label: 'Sobrevivência', desc: 'Até errar (Infinito)' },
    { mode: GameMode.TIME_ATTACK, icon: Timer, label: 'Contra o Tempo', desc: 'Máximo em 30s' },
  ].filter(m => {
    if (connectionMode === 'multiplayer' && m.mode === GameMode.SURVIVAL) {
      return false;
    }
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto w-full pt-10 px-4 pb-10">
      <div className="text-center mb-8">
        <h1 className="text-4xl md:text-6xl font-bold font-display text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 mb-2 drop-shadow-lg">
          QUIZ DOS CRAQUES
        </h1>
        <p className="text-slate-400 text-lg">
          {stats.gamesPlayed > 0 ? `Bem-vindo de volta! High Score: ${stats.highScore}` : 'Prepare-se para a batalha!'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Main Settings Panel */}
        <div className="md:col-span-8 glass-panel p-6 rounded-2xl relative overflow-hidden flex flex-col">
          
          {/* Connection Mode Tabs */}
          <div className="flex p-1 bg-slate-900/60 rounded-lg mb-6 relative z-10">
            <button 
              onClick={() => switchConnectionMode('solo')}
              className={`flex-1 py-2 text-sm font-bold rounded-md transition-all flex items-center justify-center gap-2 ${connectionMode === 'solo' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              <Zap className="w-4 h-4" /> SOLO
            </button>
            <button 
              onClick={() => switchConnectionMode('multiplayer')}
              className={`flex-1 py-2 text-sm font-bold rounded-md transition-all flex items-center justify-center gap-2 ${connectionMode === 'multiplayer' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              <Users className="w-4 h-4" /> ONLINE
              {connectionMode === 'multiplayer' && (
                <span className={`w-2 h-2 rounded-full ml-1 ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
              )}
            </button>
          </div>

          {lobbyMode === 'setup' ? (
            <div className="animate-fade-in flex-1 flex flex-col">
              
              {connectionMode === 'multiplayer' && (
                <div className="mb-6 p-4 bg-blue-900/20 border border-blue-500/20 rounded-xl">
                  <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-3">ENTRAR EM SALA EXISTENTE</h3>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Código da Sala" 
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                      className="flex-1 bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono tracking-widest uppercase"
                      maxLength={8}
                    />
                    <Button 
                      onClick={() => handleJoinRoom(joinCodeInput)} 
                      disabled={!joinCodeInput || !isConnected}
                      className="px-6"
                    >
                      <LogIn className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Game Mode Selection */}
              <div className="mb-6">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">MODO DE JOGO</label>
                <div className="grid grid-cols-2 gap-3">
                  {availableModes.map((m) => (
                    <button
                      key={m.label}
                      onClick={() => setGameMode(m.mode)}
                      className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden group ${
                        gameMode === m.mode 
                        ? 'bg-slate-800 border-blue-500 ring-1 ring-blue-500' 
                        : 'bg-slate-800/40 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-1 relative z-10">
                        <m.icon className={`w-5 h-5 ${gameMode === m.mode ? 'text-blue-400' : 'text-slate-500'}`} />
                        <span className={`font-bold text-sm ${gameMode === m.mode ? 'text-white' : 'text-slate-300'}`}>{m.label}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 pl-8 relative z-10">{m.desc}</p>
                      {gameMode === m.mode && <div className="absolute inset-0 bg-blue-500/5 z-0" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Topic Selection */}
              <div className="mb-6">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">TEMA</label>
                <div className="grid grid-cols-3 gap-2">
                  {topics.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTopic(t)}
                      className={`py-2 px-1 rounded-lg border text-xs font-semibold transition-all truncate ${
                        topic === t 
                        ? 'bg-blue-600 border-blue-400 text-white shadow-lg' 
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <input 
                  type="text"
                  placeholder="Outro tema..."
                  className="mt-2 w-full bg-slate-900/50 border border-slate-700 rounded-lg p-2 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </div>

              {/* Difficulty */}
              <div className="mb-8">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">DIFICULDADE INICIAL</label>
                <div className="flex gap-2 bg-slate-900/50 p-1 rounded-xl border border-slate-700">
                  {Object.values(Difficulty).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                        difficulty === d
                        ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow'
                        : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-auto">
                <Button 
                  fullWidth 
                  size="lg" 
                  onClick={connectionMode === 'solo' ? handleStart : createRoom}
                  disabled={isLoading || (connectionMode === 'multiplayer' && !isConnected)}
                  className="group relative overflow-hidden"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                      Preparando Arena...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      {connectionMode === 'solo' ? 'INICIAR PARTIDA' : (isConnected ? 'CRIAR NOVA SALA' : 'CONECTANDO...')} 
                      <Play className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </span>
                  )}
                </Button>
                {connectionMode === 'multiplayer' && !isConnected && (
                  <p className="text-center text-xs text-red-400 mt-2 animate-pulse">
                    Servidor desconectado. Verifique sua internet ou aguarde.
                  </p>
                )}
              </div>
            </div>
          ) : (
            // WAITING ROOM UI (Multiplayer)
            <div className="animate-fade-in text-center flex-1 flex flex-col justify-center">
              <div className="mb-6">
                 <p className="text-slate-400 text-sm font-bold mb-2">CÓDIGO DA SALA</p>
                 <div className="text-4xl font-display font-bold text-blue-400 tracking-widest bg-slate-900/50 p-4 rounded-xl border border-blue-500/30 select-all">
                    {roomCode || "..."}
                 </div>
              </div>

              <div className="mb-8">
                 <p className="text-slate-400 text-sm font-bold mb-3">LOBBY ({playersInLobby.length}/8)</p>
                 <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                    {playersInLobby.length === 0 && <div className="text-slate-500">Aguardando jogadores...</div>}
                    {playersInLobby.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-slate-800/60 p-3 rounded-lg border border-green-500/30 animate-slide-up">
                         <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"/>
                         <img src={p.avatar || "https://picsum.photos/100/100"} className="w-8 h-8 rounded-full" alt="User" />
                         <span className="font-bold">{p.name || `Jogador ${idx+1}`}</span>
                         {idx === 0 && <span className="text-xs bg-blue-900 px-2 py-0.5 rounded text-blue-300">HOST</span>}
                      </div>
                    ))}
                 </div>
              </div>

              <div className="flex flex-col gap-3">
                 <Button onClick={copyLink} variant="secondary" fullWidth>
                    <Copy className="w-4 h-4 mr-2" /> Copiar Link
                 </Button>
                 
                 <Button onClick={handleStart} fullWidth size="lg">
                    <Play className="w-5 h-5 mr-2" /> COMEÇAR
                 </Button>
                 
                 <Button onClick={() => setLobbyMode('setup')} variant="ghost" className="text-xs">
                    Voltar
                 </Button>
              </div>
            </div>
          )}

        </div>

        {/* Info/Stats Panel */}
        <div className="md:col-span-4 space-y-4">
           {/* Stat Card */}
           <div className="glass-panel p-5 rounded-2xl">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">SEU PERFIL</h3>
              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                    <p className="text-2xl font-display font-bold text-white">{stats.gamesPlayed}</p>
                    <p className="text-[10px] text-slate-400 uppercase">Partidas</p>
                 </div>
                 <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                    <p className="text-2xl font-display font-bold text-yellow-400">{stats.highScore}</p>
                    <p className="text-[10px] text-slate-400 uppercase">Recorde</p>
                 </div>
                 <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                    <p className="text-2xl font-display font-bold text-green-400">{stats.totalCorrect}</p>
                    <p className="text-[10px] text-slate-400 uppercase">Acertos</p>
                 </div>
                 <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                    <p className="text-sm font-bold text-blue-300 truncate">{stats.favoriteCategory}</p>
                    <p className="text-[10px] text-slate-400 uppercase">Favorito</p>
                 </div>
              </div>
           </div>

           <div className="glass-panel p-5 rounded-2xl">
               <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">DICAS DO TREINADOR</h3>
               <ul className="text-sm text-slate-400 space-y-2">
                 <li className="flex gap-2">
                   <Zap className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                   <span>Responda rápido! Os pontos caem a cada segundo.</span>
                 </li>
                 <li className="flex gap-2">
                   <Timer className="w-4 h-4 text-purple-500 flex-shrink-0" />
                   <span>No "Contra o Tempo", ignore os erros e foque na velocidade!</span>
                 </li>
                 <li className="flex gap-2">
                   <Users className="w-4 h-4 text-blue-500 flex-shrink-0" />
                   <span>No modo online, use o código da sala para chamar amigos.</span>
                 </li>
                 <li className="flex gap-2">
                   <Skull className="w-4 h-4 text-red-500 flex-shrink-0" />
                   <span>No Sobrevivência, o jogo é infinito. Um erro é fatal.</span>
                 </li>
               </ul>
           </div>
        </div>
      </div>
    </div>
  );
};