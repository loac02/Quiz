import React, { useState, useCallback } from 'react';
import { GamePhase, GameConfig, Player, Question, Difficulty, GameMode } from './types';
import { generateQuestions } from './services/ai';
import { Lobby } from './screens/Lobby';
import { Arena } from './screens/Arena';
import { Results } from './screens/Results';
import { Welcome } from './screens/Welcome';
import { Loading } from './screens/Loading';

const App: React.FC = () => {
  // Start at WELCOME phase
  const [phase, setPhase] = useState<GamePhase>(GamePhase.WELCOME);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // Default Config
  const [gameConfig, setGameConfig] = useState<GameConfig>({
      topic: 'Geral',
      difficulty: Difficulty.PRO,
      roundCount: 5,
      mode: GameMode.CLASSIC
  });
  
  // Current user state (initially empty until Welcome screen)
  const [user, setUser] = useState<Player>({
    id: '',
    name: '',
    avatar: '',
    score: 0,
    streak: 0,
    correctAnswersCount: 0,
    isBot: false
  });

  const handleProfileComplete = useCallback((player: Player) => {
    setUser(player);
    setPhase(GamePhase.LOBBY);
  }, []);

  const handleStartGame = useCallback(async (config: GameConfig) => {
    // Instead of just setting loading state, we switch to LOADING phase
    // This allows us to render the full Loading Screen
    setPhase(GamePhase.LOADING);
    setLoading(true); // Keep this if Lobby needs to know, but phase switch usually hides Lobby
    setGameConfig(config);
    
    try {
      // Pass empty history for new game
      const generatedQuestions = await generateQuestions(
        config.topic, 
        config.difficulty, 
        config.roundCount,
        config.mode,
        [] 
      );
      setQuestions(generatedQuestions);
      setPhase(GamePhase.PLAYING);
      
      // Reset user score for new game
      setUser(prev => ({ ...prev, score: 0, streak: 0, correctAnswersCount: 0 }));
    } catch (err) {
      console.error(err);
      alert("Falha ao gerar a arena. Por favor, tente novamente.");
      setPhase(GamePhase.LOBBY); // Go back to Lobby on error
    } finally {
      setLoading(false);
    }
  }, []);

  // Logic to load more questions for infinite modes (Survival)
  const handleLoadMoreQuestions = useCallback(async () => {
     if (loadingMore) return;
     setLoadingMore(true);
     
     // Calculate stats for context
     // We use the 'players' state which contains the live updated user data if available, or fallback to 'user'
     // Note: We access current values via closure or state, but since we need latest players, this might depend on players.
     // However, for optimization, we accept that 'players' in closure might be slightly stale if not added to dependency, 
     // but 'user' and 'questions' are the main drivers for context.
     // To be safe and performant, we use the user state and questions length.
     
     const recentAccuracy = user.correctAnswersCount > 0 
        ? user.correctAnswersCount / (questions.length || 1) 
        : 0;

     try {
       // Fetch a small batch (e.g., 5) to keep it going
       const newQuestions = await generateQuestions(
         gameConfig.topic,
         gameConfig.difficulty, // Could increase difficulty here for progression
         5,
         gameConfig.mode,
         questions.map(q => q.text), // Pass history to prevent duplicates
         { 
           streak: user.streak,
           recentAccuracy: recentAccuracy
         }
       );
       setQuestions(prev => [...prev, ...newQuestions]);
     } catch (err) {
       console.error("Error loading more questions:", err);
     } finally {
       setLoadingMore(false);
     }
  }, [loadingMore, user, questions, gameConfig]);

  const handleGameEnd = useCallback((finalPlayers: Player[]) => {
    setPlayers(finalPlayers);
    setPhase(GamePhase.GAME_OVER);
  }, []);

  const resetGame = useCallback(() => {
    setPhase(GamePhase.LOBBY);
    setQuestions([]);
    setPlayers([]);
  }, []);

  const goToHome = useCallback(() => {
    // Returns to Lobby (Game Selection) instead of Welcome
    setPhase(GamePhase.LOBBY);
    setQuestions([]);
    setPlayers([]);
  }, []);

  const handleEditProfile = useCallback(() => {
    // Open Welcome screen in "Edit Mode"
    setPhase(GamePhase.WELCOME);
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 relative">
      {/* Optimized Background Layer: Separate fixed div is faster than body background-attachment: fixed */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center pointer-events-none opacity-40"
        style={{ 
          backgroundImage: "url('https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?q=80&w=2000&auto=format&fit=crop')" 
        }}
      />
      
      {/* Main Container */}
      <div className="relative z-10 min-h-screen bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
        
        {/* Header - Only show if not in Welcome screen (or show in Welcome but disabled? Better hide in Welcome) */}
        {phase !== GamePhase.WELCOME && (
          <header className="h-20 border-b border-white/10 flex items-center px-6 glass-panel sticky top-0 z-50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg rotate-45 flex items-center justify-center shadow-[0_0_10px_rgba(37,99,235,0.5)]">
                 <div className="w-4 h-4 bg-white -rotate-45" />
              </div>
              <span className="font-display font-bold text-xl tracking-wider">QUIZ DOS CRAQUES</span>
            </div>
            <div className="ml-auto flex items-center gap-4">
               <div className="hidden md:flex flex-col text-right">
                  <span className="text-xs text-slate-400 font-bold">JOGADOR</span>
                  <span className="font-display font-semibold">{user.name}</span>
               </div>
               <button 
                onClick={handleEditProfile}
                className="relative group cursor-pointer outline-none focus:ring-2 focus:ring-blue-500 rounded-full"
                title="Editar Perfil"
               >
                 <img src={user.avatar} className="w-10 h-10 rounded-full border border-white/20 group-hover:border-blue-400 transition-colors" alt="Avatar" />
                 <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-[8px] text-white font-bold uppercase">Editar</span>
                 </div>
               </button>
            </div>
          </header>
        )}

        {/* Content */}
        <main className={phase === GamePhase.WELCOME ? "h-screen flex items-center" : ""}>
          {phase === GamePhase.WELCOME && (
            <Welcome 
              onComplete={handleProfileComplete} 
              initialPlayer={user.id ? user : undefined} // Pass user only if created
            />
          )}

          {phase === GamePhase.LOBBY && (
            <Lobby 
              onStartGame={handleStartGame} 
              isLoading={loading} 
              currentUser={user}
            />
          )}

          {phase === GamePhase.LOADING && (
            <Loading />
          )}
          
          {phase === GamePhase.PLAYING && (
            <Arena 
              questions={questions} 
              onGameEnd={handleGameEnd} 
              // FORCE CLEAN USER: This prevents the bug where old stats persist due to async state updates.
              // Arena initializes its local player state from this prop immediately.
              currentUser={{
                ...user,
                score: 0,
                streak: 0,
                correctAnswersCount: 0
              }}
              config={gameConfig}
              onLoadMore={handleLoadMoreQuestions}
            />
          )}

          {phase === GamePhase.GAME_OVER && (
            <Results 
              players={players} 
              onPlayAgain={resetGame} 
              onHome={goToHome}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default App;