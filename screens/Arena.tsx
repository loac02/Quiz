import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Question, Player, GamePhase, GameConfig, GameMode, Difficulty } from '../types';
import { Timer } from '../components/Timer';
import { Leaderboard } from '../components/Leaderboard';
import { Button } from '../components/Button';
import { CheckCircle, XCircle, Info, Flame, Skull, Clock, Loader2 } from 'lucide-react';
import { updateDetailedStats } from '../utils/storage';
import { socket } from '../services/socket';

interface ArenaProps {
  questions: Question[];
  onGameEnd: (players: Player[]) => void;
  currentUser: Player;
  config: GameConfig;
  initialPlayers?: Player[]; // Players from lobby (online)
  onLoadMore?: () => void;
}

const BASE_POINTS = 100;
const TIME_ATTACK_DURATION = 30;
const QUESTION_DURATION = 10;
const RESULT_DURATION_MS = 6000;

// Bot Personality Definition (Same as before)
interface BotPersonality {
  id: string;
  name: string;
  baseAccuracy: number;
  specialties: string[];
  speedProfile: 'fast' | 'balanced' | 'slow';
}

const BOT_PERSONALITIES: Record<string, BotPersonality> = {
  'bot-1': { id: 'bot-1', name: 'Sérgio Veloz', baseAccuracy: 0.60, specialties: ['Fórmula 1', 'Basquete', 'Velocidade', 'Carros'], speedProfile: 'fast' },
  'bot-2': { id: 'bot-2', name: 'Titã do Trivia', baseAccuracy: 0.88, specialties: ['História', 'Olimpíadas', 'Geral', 'Futebol', 'Copas'], speedProfile: 'balanced' },
  'bot-3': { id: 'bot-3', name: 'Renato Novato', baseAccuracy: 0.40, specialties: ['MMA', 'Vôlei', 'UFC'], speedProfile: 'slow' }
};

class AudioController {
  private static ctx: AudioContext | null = null;
  private static getContext(): AudioContext | null {
    if (!this.ctx) {
      const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtor) this.ctx = new AudioCtor();
    }
    return this.ctx;
  }
  public static play(type: 'correct' | 'wrong' | 'timeup') {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      const now = ctx.currentTime;

      if (type === 'correct') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.1);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.2, now + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      } else if (type === 'wrong') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.4);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.2, now + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (type === 'timeup') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.linearRampToValueAtTime(50, now + 0.5);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      }
    } catch (err) { console.error(err); }
  }
}

export const Arena: React.FC<ArenaProps> = ({ questions, onGameEnd, currentUser, config, onLoadMore, initialPlayers }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [phase, setPhase] = useState<GamePhase>(GamePhase.PLAYING);
  
  // Initialize players from prop (Online) or just user (Solo)
  const [players, setPlayers] = useState<Player[]>(initialPlayers && initialPlayers.length > 0 ? initialPlayers : [currentUser]);
  
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [currentDifficulty, setCurrentDifficulty] = useState<Difficulty>(config.difficulty);
  const [isWaitingForMore, setIsWaitingForMore] = useState(false);
  const [wasWrong, setWasWrong] = useState(false); 
  
  // Logic Refs
  const questionStartTime = useRef<number>(Date.now());
  const nextQuestionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Store pending update locally until Timer finishes
  const pendingAnswerUpdate = useRef<{ scoreToAdd: number, streak: number, correct: boolean } | null>(null);

  // Stats for this session
  const sessionStats = useRef({
    correctCount: 0,
    bestTime: 9999
  });

  const isTimeAttack = config.mode === GameMode.TIME_ATTACK;
  const isSurvival = config.mode === GameMode.SURVIVAL;
  const isOnline = initialPlayers && initialPlayers.length > 1;

  // Socket Listener for Online Rankings
  useEffect(() => {
    if (!isOnline) return;

    function onUpdatePlayers(updatedPlayers: any[]) {
        setPlayers(current => {
            // Merge logic: Update scores/streaks of existing players
            // We trust server state for scores in online mode
            return updatedPlayers.map(serverP => ({
                ...serverP,
                // Preserve local specific fields if needed, or fully trust server
                // Ensuring we map isBot correctly if server doesn't send it fully
                isBot: false 
            }));
        });
    }

    // Subscribe
    socket.on('update_players', onUpdatePlayers);

    return () => {
        socket.off('update_players', onUpdatePlayers);
    };
  }, [isOnline]);

  // Initialize Bots (ONLY if SOLO)
  useEffect(() => {
    // If we have more than 1 player initially, it's multiplayer, so NO bots.
    if (players.length > 1) return; 
    
    // If explicitly Survival, no bots usually? Or kept? Logic from before kept it out.
    if (config.mode === GameMode.SURVIVAL) return; 

    setPlayers(prev => {
      // Double check to prevent adding bots if players appeared
      if (prev.length > 1) return prev;

      const bots: Player[] = Object.values(BOT_PERSONALITIES).map((persona, index) => ({
        id: persona.id,
        name: persona.name,
        avatar: `https://picsum.photos/100/100?random=${index + 10}`,
        score: 0,
        streak: 0,
        correctAnswersCount: 0,
        isBot: true
      }));
      
      return [...prev, ...bots];
    });
  }, [config.mode]); // Removed 'players.length' dependency to avoid infinite loop or weird re-adds

  useEffect(() => {
    questionStartTime.current = Date.now();
    pendingAnswerUpdate.current = null;
    setWasWrong(false); 
  }, [currentQuestionIndex]);

  useEffect(() => {
    if ((isSurvival || isTimeAttack) && onLoadMore && questions.length > 0) {
      if (currentQuestionIndex >= questions.length - 2) {
        onLoadMore();
      }
    }
  }, [currentQuestionIndex, isSurvival, isTimeAttack, onLoadMore, questions.length]);

  useEffect(() => {
    if (isWaitingForMore && questions.length > currentQuestionIndex + 1) {
      setIsWaitingForMore(false);
      setCurrentQuestionIndex(prev => prev + 1);
      setPhase(GamePhase.PLAYING);
      if (nextQuestionTimeout.current) clearTimeout(nextQuestionTimeout.current);
    }
  }, [questions.length, isWaitingForMore, currentQuestionIndex]);

  // Audio/Visual Sync
  useEffect(() => {
    if (phase === GamePhase.ROUND_RESULT) {
      const isCorrect = pendingAnswerUpdate.current?.correct ?? false;
      
      // If no answer was given (timeout), it counts as wrong
      const actuallyWrong = !isCorrect; 
      
      if (actuallyWrong) setWasWrong(true);
      AudioController.play(isCorrect ? 'correct' : 'wrong');
    }
  }, [phase]);

  useEffect(() => {
    return () => {
      if (nextQuestionTimeout.current) clearTimeout(nextQuestionTimeout.current);
    };
  }, []);

  const getDifficultyMultiplier = (streak: number, baseDiff: Difficulty) => {
    let mult = 1.0;
    if (baseDiff === Difficulty.PRO) mult = 1.2;
    if (baseDiff === Difficulty.ALL_STAR) mult = 1.5;
    if (baseDiff === Difficulty.HALL_OF_FAME) mult = 2.0;
    if (streak > 2) mult += 0.2;
    if (streak > 5) mult += 0.5;
    return mult;
  };

  const processRoundResults = useCallback(() => {
    let isGameOver = false;
    const currentQ = questions[currentQuestionIndex];
    const category = currentQ?.category || '';
    const humanPlayer = players.find(p => !p.isBot);
    const humanScore = humanPlayer?.score || 0;

    // Survival Check
    if (isSurvival) {
       // Check pending update (human)
       if (!pendingAnswerUpdate.current || !pendingAnswerUpdate.current.correct) {
           isGameOver = true;
       }
    }

    setPlayers(currentPlayers => {
      return currentPlayers.map(p => {
        // --- HUMAN PLAYER ---
        if (!p.isBot) {
          const update = pendingAnswerUpdate.current;
          
          // Sync with Server if Online
          if (isOnline && socket.connected && update) {
              // We only emit ONCE per round when processing results
              // Ideally this happens on handleAnswer, but we are delaying result processing.
              // To prevent cheating, we should emit answer time/index earlier, but for this "reveal at end" request:
              // We emit the score NOW.
          }

          if (update) {
            if (update.correct) sessionStats.current.correctCount++;
            return {
              ...p,
              score: p.score + update.scoreToAdd,
              streak: update.streak,
              correctAnswersCount: (p.correctAnswersCount || 0) + (update.correct ? 1 : 0),
              lastAnswerCorrect: update.correct
            };
          } else {
            return { ...p, streak: 0, lastAnswerCorrect: false };
          }
        }

        // --- BOT LOGIC (Only if not online) ---
        if (isOnline) return p; // Should not happen given init logic, but safe guard
        
        // ... (Bot logic same as before, condensed for brevity) ...
        const personality = BOT_PERSONALITIES[p.id] || BOT_PERSONALITIES['bot-3'];
        let chance = personality.baseAccuracy + ((Math.random() * 0.10) - 0.05);
        const isSpecialty = personality.specialties.some(s => category.toLowerCase().includes(s.toLowerCase()));
        if (isSpecialty) chance += 0.25;
        
        // Rubber banding
        const scoreDiff = humanScore - p.score;
        if (scoreDiff > 300) chance += 0.15;
        if (scoreDiff < -400) chance -= 0.10;
        
        chance = Math.min(0.98, Math.max(0.05, chance));
        const isCorrect = Math.random() < chance;

        if (isCorrect) {
          const diffMult = getDifficultyMultiplier(p.streak, currentDifficulty);
          let timeBonus = 10; // Averaged for simplicity in this refactor
          const points = Math.floor((BASE_POINTS + timeBonus) * diffMult); 
          return { 
             ...p, score: p.score + points, streak: p.streak + 1, 
             correctAnswersCount: (p.correctAnswersCount || 0) + 1, lastAnswerCorrect: true 
          };
        } else {
          return { ...p, streak: 0, lastAnswerCorrect: false };
        }
      });
    });

    return isGameOver;
  }, [isSurvival, currentDifficulty, questions, currentQuestionIndex, players, isOnline]);

  const finishGame = useCallback(() => {
    const player = players.find(p => p.id === currentUser.id) || players[0];
    updateDetailedStats(player.score, sessionStats.current.correctCount, currentQuestionIndex + 1, sessionStats.current.bestTime, config.topic);
    onGameEnd(players);
  }, [players, currentUser.id, onGameEnd, currentQuestionIndex, config.topic]);

  const proceedToNextQuestion = useCallback((forceGameOver = false) => {
    const delay = (isTimeAttack || isSurvival) ? 1500 : RESULT_DURATION_MS; // Increased delay for survival/time attack to see result
    
    nextQuestionTimeout.current = setTimeout(() => {
      if (forceGameOver) {
        finishGame();
        return;
      }

      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
        setSelectedOption(null);
        setPhase(GamePhase.PLAYING);
      } else {
        if (isSurvival || isTimeAttack) {
           setIsWaitingForMore(true);
        } else {
           finishGame();
        }
      }
    }, delay); 
  }, [currentQuestionIndex, questions.length, finishGame, isTimeAttack, isSurvival]);

  // Modified: Only records the choice. Does NOT reveal result.
  const handleAnswer = useCallback((optionIndex: number) => {
    if (phase !== GamePhase.PLAYING || selectedOption !== null) return;
    
    setSelectedOption(optionIndex);
    
    const currentQuestion = questions[currentQuestionIndex];
    const isCorrect = optionIndex === currentQuestion.correctAnswerIndex;
    const playerState = players.find(p => p.id === currentUser.id) || players[0];

    const now = Date.now();
    const elapsedSeconds = (now - questionStartTime.current) / 1000;
    
    if (isCorrect && elapsedSeconds < sessionStats.current.bestTime) {
        sessionStats.current.bestTime = elapsedSeconds;
    }

    let scoreToAdd = 0;
    let newStreak = 0;

    if (isCorrect) {
      const difficultyMult = getDifficultyMultiplier(playerState.streak, currentDifficulty);
      const speedFactor = Math.max(0, 1 - (elapsedSeconds / 10)); 
      const timeBonus = Math.floor(50 * speedFactor); 

      scoreToAdd = Math.floor((BASE_POINTS + timeBonus) * difficultyMult);
      newStreak = playerState.streak + 1;
    }

    // Staging the result
    pendingAnswerUpdate.current = { scoreToAdd, streak: newStreak, correct: isCorrect };
    
    // If Online, emit immediately to server so it knows we answered (prevent cheating via delay)
    // Server logic will broadcast update_players
    if (isOnline && socket.connected) {
         // Get room ID from somewhere? We don't have it in props directly usually, 
         // but we can assume user knows their room or just emit global answer? 
         // Better: App should pass roomId or we infer it. 
         // For now, relying on socket finding the player's room via socket.id on server.
         // Wait, server/index.js `submit_answer` takes roomId. 
         // We need roomId here. 
         // PATCH: The Lobby sets roomCode. App doesn't store it explicitly in a prop passed to Arena.
         // Ideally, pass roomId to Arena.
         // WORKAROUND: Client emits, server finds room by socket.id (server supports this? No, server expects roomId).
         
         // Fix: We must pass roomId to Arena or store it in a context.
         // Since I can't easily change App props drastically without breaking flow, 
         // let's grab it from URL params if in multiplayer mode, as Lobby sets URL.
         const params = new URLSearchParams(window.location.search);
         const roomFromUrl = params.get('room');
         if (roomFromUrl) {
             socket.emit('submit_answer', { 
                 roomId: roomFromUrl, 
                 answerIndex: optionIndex,
                 scoreToAdd: scoreToAdd // Client authoritative for this demo
             });
         }
    }

    // DO NOT setPhase(ROUND_RESULT) here. Wait for Timer.
    
  }, [phase, selectedOption, questions, currentQuestionIndex, players, currentUser.id, currentDifficulty, isOnline]);

  // Modified: Handles the transition to reveal phase
  const handleTimeUp = useCallback(() => {
    if (phase !== GamePhase.PLAYING) return;

    if (isTimeAttack) {
      AudioController.play('timeup');
      setPhase(GamePhase.GAME_OVER);
      finishGame();
      return;
    }

    // Reveal Phase
    setPhase(GamePhase.ROUND_RESULT);
    
    const survivalDeath = processRoundResults();
    
    if (survivalDeath) {
        setTimeout(() => finishGame(), 1500);
    } else {
        proceedToNextQuestion();
    }
  }, [phase, isTimeAttack, processRoundResults, proceedToNextQuestion, finishGame]);

  const currentQuestion = questions[currentQuestionIndex];
  if (!currentQuestion && !isWaitingForMore) return <div>Carregando...</div>;

  return (
    <div className="relative h-[calc(100vh-80px)] max-w-7xl mx-auto w-full p-4 grid grid-cols-1 lg:grid-cols-4 gap-6">
      
      {/* CSS same as before */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        .animate-shake {
          animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
        }
        @keyframes scaleX {
            from { transform: scaleX(0); }
            to { transform: scaleX(1); }
        }
      `}} />

      {isWaitingForMore && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-sm rounded-xl">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <h2 className="text-xl font-display font-bold text-white">Carregando próxima rodada...</h2>
        </div>
      )}

      {currentQuestion && (
      <>
      <div className="lg:col-span-3 flex flex-col justify-center max-w-3xl mx-auto w-full">
        
        <div className="flex items-center justify-between mb-4 text-slate-400 font-display">
          <div className="flex items-center gap-2">
             {isSurvival && <Skull className="w-5 h-5 text-red-500" />}
             {isTimeAttack && <Clock className="w-5 h-5 text-blue-500" />}
             <span>
               {(isSurvival || isTimeAttack) ? `PERGUNTA ${currentQuestionIndex + 1}` : `PERGUNTA ${currentQuestionIndex + 1} / ${questions.length}`}
             </span>
          </div>
          <div className="flex gap-2">
             <span className="bg-slate-800 px-3 py-1 rounded text-sm border border-slate-700">{config.mode}</span>
          </div>
        </div>

        <div className={`glass-panel p-6 md:p-8 rounded-2xl shadow-2xl relative overflow-hidden transition-colors duration-300 ${wasWrong ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : ''}`}>
          
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-xl md:text-2xl font-bold leading-relaxed flex-1 mr-4">{currentQuestion.text}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" key={currentQuestion.id}>
            {currentQuestion.options.map((option, idx) => {
              const isSelected = selectedOption === idx;
              const isCorrect = idx === currentQuestion.correctAnswerIndex;
              const reveal = phase === GamePhase.ROUND_RESULT || phase === GamePhase.GAME_OVER;

              let btnVariant: 'primary' | 'secondary' | 'danger' | 'ghost' = 'secondary';
              let customClass = '';

              if (reveal) {
                // Reveal Phase Logic
                if (isCorrect) {
                    btnVariant = 'primary'; 
                    customClass = '!bg-green-600 !border-green-400 !text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]';
                } else if (isSelected && !isCorrect) {
                    btnVariant = 'danger';
                    customClass = 'animate-shake';
                } else {
                    btnVariant = 'ghost';
                }
              } else {
                // Playing Phase Logic
                if (isSelected) {
                    // Show "Selected" state (e.g. Blue or Grey, not Green yet)
                    btnVariant = 'primary';
                    customClass = '!bg-blue-600 !border-blue-500'; 
                }
              }
              
              return (
                <Button
                  key={`${currentQuestion.id}-${idx}`}
                  variant={btnVariant}
                  onClick={() => handleAnswer(idx)} 
                  disabled={selectedOption !== null || phase !== GamePhase.PLAYING}
                  className={`h-16 md:h-20 text-base md:text-lg justify-start px-6 ${customClass}`}
                  fullWidth
                >
                  <span className="bg-black/20 w-8 h-8 rounded flex items-center justify-center mr-4 text-xs font-bold opacity-70 flex-shrink-0">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="truncate">{option}</span>
                  {reveal && isCorrect && <CheckCircle className="ml-auto w-6 h-6 text-white animate-bounce" />}
                  {reveal && isSelected && !isCorrect && <XCircle className="ml-auto w-6 h-6 text-white" />}
                </Button>
              );
            })}
          </div>

           {(phase === GamePhase.ROUND_RESULT) && (
             <div 
                className="absolute bottom-0 left-0 h-1 bg-blue-500 w-full origin-left will-change-transform" 
                style={{
                  animation: `scaleX ${(isTimeAttack || isSurvival) ? 0.8 : RESULT_DURATION_MS/1000}s linear forwards`
                }}
             />
          )}

        </div>

        <div className="mt-8">
          <Timer 
              key={isTimeAttack ? 'global-timer' : currentQuestionIndex}
              duration={isTimeAttack ? TIME_ATTACK_DURATION : QUESTION_DURATION} 
              onTimeUp={handleTimeUp} 
              isRunning={phase === GamePhase.PLAYING && !isWaitingForMore}
              isGlobal={isTimeAttack}
          />
        </div>

      </div>

      <div className="lg:col-span-1 hidden lg:block h-full">
        <Leaderboard players={players} currentUserId={currentUser.id} />
        <div className="mt-4 p-4 glass-panel rounded-xl text-center">
             <div className="text-blue-400 font-display font-bold text-lg flex items-center justify-center gap-2">
                {isSurvival && <Skull className="w-4 h-4" />}
                {isOnline && <div className="text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded">ONLINE</div>}
            </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
};