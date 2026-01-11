import React, { useState, useEffect } from 'react';
import { GameConfig, Difficulty, GameMode } from '../types';
import { Button } from '../components/Button';
import { Trophy, Users, Zap, Globe, Copy, Share2, Play, Timer, Skull, RefreshCw } from 'lucide-react';
import { getStats } from '../utils/storage';
import { socket } from '../services/socket';

interface LobbyProps {
  onStartGame: (config: GameConfig) => void;
  isLoading: boolean;
}

type LobbyMode = 'setup' | 'waiting';
type ConnectionMode = 'solo' | 'multiplayer';

export const Lobby: React.FC<LobbyProps> = ({ onStartGame, isLoading }) => {
  const [lobbyMode, setLobbyMode] = useState<LobbyMode>('setup');
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('solo');
  const [isConnected, setIsConnected] = useState(socket.connected);
  
  const [topic, setTopic] = useState('Esportes Gerais');
  const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.PRO);
  const [gameMode, setGameMode] = useState<GameMode>(GameMode.CLASSIC);
  const [roomCode, setRoomCode] = useState('');
  const [playersInLobby, setPlayersInLobby] = useState<any[]>([]);

  // Performance Optimization: Lazy initialization for stats
  const [stats] = useState(() => getStats());
  
  const topics = ['Futebol', 'Basquete', 'Fórmula 1', 'Olimpíadas', 'Vôlei', 'MMA'];

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
      setPlayersInLobby(players);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room_created', onRoomCreated);
    socket.on('update_players', onUpdatePlayers);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_created', onRoomCreated);
      socket.off('update_players', onUpdatePlayers);
    };
  }, []);

  const handleStart = () => {
    // Logic for round count based on mode
    let rounds = 5;
    
    // Time Attack and Survival now request infinite stream batches (e.g., start with 10)
    if (gameMode === GameMode.TIME_ATTACK || gameMode === GameMode.SURVIVAL) {
       rounds = 10; 
    }

    onStartGame({
      topic,
      difficulty,
      roundCount: rounds,
      mode: gameMode
    });
  };

  const createRoom = () => {
    if (!socket.connected) {
      alert("Conectando ao servidor... Tente novamente em instantes.");
      socket.connect();
      return;
    }

    // Emit create_room event to backend
    // Assuming 'currentUser' info would be passed here ideally, but using generic for now
    socket.emit('create_room', { 
      player: { name: 'Host' }, 
      config: { topic, difficulty, mode: gameMode } 
    });
  };

  const copyLink = () => {
    const link = `${window.location.origin}?room=${roomCode}`;
    navigator.clipboard.writeText(link);
    alert('Link copiado!');
  };

  // Helper to change connection mode and validate game mode
  const switchConnectionMode = (mode: ConnectionMode) => {
    setConnectionMode(mode);
    setLobbyMode('setup');
    
    // Connect socket if Multiplayer selected
    if (mode === 'multiplayer') {
      if (!socket.connected) socket.connect();
    } else {
      // Disconnect if going back to Solo to save resources (optional)
      // socket.disconnect(); 
    }
    
    // If switching to multiplayer and current mode is Survival, reset to Classic
    // because Survival is not allowed in Online
    if (mode === 'multiplayer' && gameMode === GameMode.SURVIVAL) {
      setGameMode(GameMode.CLASSIC);
    }
  };

  // Filter available modes based on connection type
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
                      {connectionMode === 'solo' ? 'INICIAR PARTIDA' : (isConnected ? 'CRIAR SALA ONLINE' : 'CONECTANDO...')} 
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
                   <span>No modo online, você vê os acertos dos oponentes em tempo real.</span>
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