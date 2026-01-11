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

  const handleStartGame = useCallback(async (config: GameConfig, initialPlayers?: Player[]) => {
    // Instead of just setting loading state, we switch to LOADING phase
    // This allows us to render the full Loading Screen
    setPhase(GamePhase.LOADING);
    setLoading(true); 
    setGameConfig(config);
    
    // Set initial players (important for Online mode)
    // If provided, use them. Otherwise, wait for Arena to init solo/bots.
    if (initialPlayers && initialPlayers.length > 0) {
        setPlayers(initialPlayers);
    } else {
        setPlayers([user]);
    }
    
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
      
      // Reset user score for new game BUT keep the ID and Name
      setUser(prev => ({ ...prev, score: 0, streak: 0, correctAnswersCount: 0 }));
    } catch (err) {
      console.error(err);
      alert("Falha ao gerar a arena. Por favor, tente novamente.");
      setPhase(GamePhase.LOBBY); // Go back to Lobby on error
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Logic to load more questions for infinite modes (Survival)
  const handleLoadMoreQuestions = useCallback(async () => {
     if (loadingMore) return;
     setLoadingMore(true);
     
     const recentAccuracy = user.correctAnswersCount > 0 
        ? user.correctAnswersCount / (questions.length || 1) 
        : 0;

     try {
       const newQuestions = await generateQuestions(
         gameConfig.topic,
         gameConfig.difficulty, 
         5,
         gameConfig.mode,
         questions.map(q => q.text),
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
    setPhase(GamePhase.LOBBY);
    setQuestions([]);
    setPlayers([]);
  }, []);

  const handleEditProfile = useCallback(() => {
    setPhase(GamePhase.WELCOME);
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 relative">
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center pointer-events-none opacity-40"
        style={{ 
          backgroundImage: "url('https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?q=80&w=2000&auto=format&fit=crop')" 
        }}
      />
      
      <div className="relative z-10 min-h-screen bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
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
               </button>
            </div>
          </header>
        )}

        <main className={phase === GamePhase.WELCOME ? "h-screen flex items-center" : ""}>
          {phase === GamePhase.WELCOME && (
            <Welcome 
              onComplete={handleProfileComplete} 
              initialPlayer={user.id ? user : undefined} 
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
              currentUser={{
                ...user,
                score: 0,
                streak: 0,
                correctAnswersCount: 0
              }}
              initialPlayers={players.length > 1 ? players : undefined} // Pass online players if any
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