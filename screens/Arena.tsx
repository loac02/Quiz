import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Question, Player, GamePhase, GameConfig, GameMode, Difficulty } from '../types';
import { Timer } from '../components/Timer';
import { Leaderboard } from '../components/Leaderboard';
import { Button } from '../components/Button';
import { CheckCircle, XCircle, Info, Flame, Skull, Clock, Loader2 } from 'lucide-react';
import { updateDetailedStats } from '../utils/storage';

interface ArenaProps {
  questions: Question[];
  onGameEnd: (players: Player[]) => void;
  currentUser: Player;
  config: GameConfig;
  onLoadMore?: () => void; // Optional function to load more questions (for Survival)
}

const BASE_POINTS = 100;
const TIME_ATTACK_DURATION = 30; // 30 seconds total for Time Attack
const QUESTION_DURATION = 10; // Changed from 15 to 10 seconds per question for Classic/Survival
const RESULT_DURATION_MS = 6000; // Classic mode reading time

// Bot Personality Definition
interface BotPersonality {
  id: string;
  name: string;
  baseAccuracy: number;
  specialties: string[]; // Categories where they perform better
  speedProfile: 'fast' | 'balanced' | 'slow';
}

const BOT_PERSONALITIES: Record<string, BotPersonality> = {
  'bot-1': { 
    id: 'bot-1', 
    name: 'Sérgio Veloz', 
    baseAccuracy: 0.60, // Slightly lower base, relies on speed and specialties
    specialties: ['Fórmula 1', 'Basquete', 'Velocidade', 'Carros'], 
    speedProfile: 'fast' 
  },
  'bot-2': { 
    id: 'bot-2', 
    name: 'Titã do Trivia', 
    baseAccuracy: 0.88, 
    specialties: ['História', 'Olimpíadas', 'Geral', 'Futebol', 'Copas'], 
    speedProfile: 'balanced' 
  },
  'bot-3': { 
    id: 'bot-3', 
    name: 'Renato Novato', 
    baseAccuracy: 0.40, 
    specialties: ['MMA', 'Vôlei', 'UFC'], 
    speedProfile: 'slow' 
  }
};

// Audio Controller
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

export const Arena: React.FC<ArenaProps> = ({ questions, onGameEnd, currentUser, config, onLoadMore }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [phase, setPhase] = useState<GamePhase>(GamePhase.PLAYING);
  const [players, setPlayers] = useState<Player[]>([currentUser]);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [currentDifficulty, setCurrentDifficulty] = useState<Difficulty>(config.difficulty);
  const [isWaitingForMore, setIsWaitingForMore] = useState(false);
  const [wasWrong, setWasWrong] = useState(false); // New state for visual feedback
  
  // Logic Refs
  const questionStartTime = useRef<number>(Date.now());
  const globalStartTime = useRef<number>(Date.now()); 
  const isProcessing = useRef<boolean>(false);
  const nextQuestionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userPendingUpdate = useRef<{ scoreToAdd: number, streak: number, correct: boolean } | null>(null);

  // Stats for this session
  const sessionStats = useRef({
    correctCount: 0,
    bestTime: 9999
  });

  const isTimeAttack = config.mode === GameMode.TIME_ATTACK;
  const isSurvival = config.mode === GameMode.SURVIVAL;

  // Initialize Bots
  useEffect(() => {
    setPlayers(prev => {
      if (prev.length > 1) return prev; 
      if (config.mode === GameMode.SURVIVAL) return prev; 

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
  }, [config.mode]);

  useEffect(() => {
    // Reset local timer and state for new question
    questionStartTime.current = Date.now();
    isProcessing.current = false;
    userPendingUpdate.current = null;
    setWasWrong(false); // Reset wrong state
  }, [currentQuestionIndex]);

  // INFINITE MODES: Load more questions
  useEffect(() => {
    if ((isSurvival || isTimeAttack) && onLoadMore && questions.length > 0) {
      if (currentQuestionIndex >= questions.length - 2) {
        onLoadMore();
      }
    }
  }, [currentQuestionIndex, isSurvival, isTimeAttack, onLoadMore, questions.length]);

  // INFINITE MODES: Resume
  useEffect(() => {
    if (isWaitingForMore && questions.length > currentQuestionIndex + 1) {
      setIsWaitingForMore(false);
      setCurrentQuestionIndex(prev => prev + 1);
      setPhase(GamePhase.PLAYING);
      if (nextQuestionTimeout.current) clearTimeout(nextQuestionTimeout.current);
    }
  }, [questions.length, isWaitingForMore, currentQuestionIndex]);

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
    
    // Get current Question Data
    const currentQ = questions[currentQuestionIndex];
    const category = currentQ?.category || '';

    // Human Player Score (for Rubber Banding)
    const humanPlayer = players.find(p => !p.isBot);
    const humanScore = humanPlayer?.score || 0;

    if (isSurvival) {
       if (!userPendingUpdate.current || !userPendingUpdate.current.correct) {
           isGameOver = true;
       }
    }

    setPlayers(currentPlayers => {
      return currentPlayers.map(p => {
        // --- HUMAN PLAYER LOGIC ---
        if (!p.isBot) {
          const update = userPendingUpdate.current;
          if (update) {
            if (update.correct) {
               sessionStats.current.correctCount++;
            }
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

        // --- REFINED AI BOT LOGIC ---
        if (isSurvival) return p;

        const personality = BOT_PERSONALITIES[p.id] || BOT_PERSONALITIES['bot-3'];
        
        // 1. Base Accuracy with Jitter (Random variation ±5%)
        // This makes bots feel less robotic (e.g., an expert can still make a dumb mistake)
        const accuracyJitter = (Math.random() * 0.10) - 0.05;
        let chance = personality.baseAccuracy + accuracyJitter;

        // 2. Specialty Bonus (Focus Mechanic)
        const isSpecialty = personality.specialties.some(s => 
          category.toLowerCase().includes(s.toLowerCase()) || 
          s.toLowerCase().includes(category.toLowerCase())
        );

        if (isSpecialty) {
          chance += 0.25; // Massive boost if it's their topic
        } else {
           // 3. Difficulty Penalty (If NOT specialty)
           // Bots struggle significantly with hard questions outside their niche
           if (currentQ.difficulty === Difficulty.HALL_OF_FAME) chance -= 0.25;
           else if (currentQ.difficulty === Difficulty.ALL_STAR) chance -= 0.15;
        }

        // 4. Rubber Banding & Pressure
        const scoreDiff = humanScore - p.score;
        const isWinning = scoreDiff < 0;
        const isLosingBadly = scoreDiff > 300;
        
        if (isLosingBadly) {
          chance += 0.15; // Comeback mechanic
        } else if (isWinning && Math.abs(scoreDiff) > 400) {
          chance -= 0.10; // Mercy mechanic
        }

        // 5. Final Round "Pressure"
        // In the last few questions, bots might "choke" or "clutch" if the score is close
        const isFinalStretch = questions.length > 0 && currentQuestionIndex >= questions.length - 3;
        const isCloseGame = Math.abs(scoreDiff) < 150;
        
        if (isFinalStretch && isCloseGame) {
           // 50% chance to focus up (+10%), 50% chance to choke (-10%)
           const pressureFactor = Math.random() > 0.5 ? 0.1 : -0.1;
           chance += pressureFactor;
        }

        // Cap Chance (Never 100%, never 0%)
        chance = Math.min(0.98, Math.max(0.05, chance));

        const isCorrect = Math.random() < chance;
        
        if (isCorrect) {
          const diffMult = getDifficultyMultiplier(p.streak, currentDifficulty);
          
          // 6. Reaction Time Logic
          // Fast profile OR Specialty = Faster answers
          let timeBonus = 0;
          if (personality.speedProfile === 'fast' || isSpecialty) {
             // 35-50 points bonus
             timeBonus = Math.floor(Math.random() * 15) + 35;
          } else if (personality.speedProfile === 'slow') {
             // 0-20 points bonus
             timeBonus = Math.floor(Math.random() * 20);
          } else {
             // Balanced (10-40)
             timeBonus = Math.floor(Math.random() * 30) + 10;
          }

          const points = Math.floor((BASE_POINTS + timeBonus) * diffMult); 
          
          return { 
             ...p, 
             score: p.score + points, 
             streak: p.streak + 1, 
             correctAnswersCount: (p.correctAnswersCount || 0) + 1,
             lastAnswerCorrect: true 
          };
        } else {
          return { ...p, streak: 0, lastAnswerCorrect: false };
        }
      });
    });

    return isGameOver;
  }, [isSurvival, currentDifficulty, questions, currentQuestionIndex, players]);

  const finishGame = useCallback(() => {
    const player = players.find(p => p.id === currentUser.id) || players[0];
    updateDetailedStats(
        player.score, 
        sessionStats.current.correctCount, 
        currentQuestionIndex + 1, 
        sessionStats.current.bestTime,
        config.topic
    );
    onGameEnd(players);
  }, [players, currentUser.id, onGameEnd, currentQuestionIndex, config.topic]);

  const proceedToNextQuestion = useCallback((forceGameOver = false) => {
    // OPTIMIZED TIMING: Faster transition for action modes
    const delay = (isTimeAttack || isSurvival) ? 800 : RESULT_DURATION_MS;
    
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

  const handleAnswer = useCallback((optionIndex: number) => {
    if (phase !== GamePhase.PLAYING || isProcessing.current || selectedOption !== null) return;
    
    setSelectedOption(optionIndex);
    const currentQuestion = questions[currentQuestionIndex];
    const isCorrect = optionIndex === currentQuestion.correctAnswerIndex;
    const playerState = players.find(p => p.id === currentUser.id) || players[0];

    // Visual feedback trigger
    if (!isCorrect) setWasWrong(true);

    const now = Date.now();
    const elapsedSeconds = (now - questionStartTime.current) / 1000;
    
    if (isCorrect && elapsedSeconds < sessionStats.current.bestTime) {
        sessionStats.current.bestTime = elapsedSeconds;
    }

    let scoreToAdd = 0;
    let newStreak = 0;

    if (isCorrect) {
      const difficultyMult = getDifficultyMultiplier(playerState.streak, currentDifficulty);
      const timeLimit = isTimeAttack ? TIME_ATTACK_DURATION : QUESTION_DURATION;
      const speedFactor = Math.max(0, 1 - (elapsedSeconds / 10)); 
      const timeBonus = Math.floor(50 * speedFactor); 

      scoreToAdd = Math.floor((BASE_POINTS + timeBonus) * difficultyMult);
      newStreak = playerState.streak + 1;
    }

    userPendingUpdate.current = { scoreToAdd, streak: newStreak, correct: isCorrect };

    // Play sound immediately
    AudioController.play(isCorrect ? 'correct' : 'wrong');

    if (isSurvival) {
        setPhase(GamePhase.ROUND_RESULT);
        isProcessing.current = true;
        
        processRoundResults();
        
        if (!isCorrect) {
             // Reduced wait time for Game Over to keep it snappy
             setTimeout(() => finishGame(), 1500);
        } else {
             proceedToNextQuestion();
        }
        return;
    }

    if (isTimeAttack) {
         setPhase(GamePhase.ROUND_RESULT);
         isProcessing.current = true;
         processRoundResults();
         proceedToNextQuestion(); 
    }

    // Classic logic handled elsewhere (timer or manual wait if we add manual next)

  }, [phase, selectedOption, questions, currentQuestionIndex, players, currentUser.id, currentDifficulty, isTimeAttack, isSurvival, processRoundResults, proceedToNextQuestion, finishGame]);

  const handleTimeUp = useCallback(() => {
    if (phase !== GamePhase.PLAYING) return;

    if (isTimeAttack) {
      AudioController.play('timeup');
      setPhase(GamePhase.GAME_OVER);
      finishGame();
      return;
    }

    setPhase(GamePhase.ROUND_RESULT);
    isProcessing.current = true;
    setWasWrong(true); // Time up is wrong

    if (userPendingUpdate.current) {
        AudioController.play(userPendingUpdate.current.correct ? 'correct' : 'wrong');
    } else {
        AudioController.play('wrong'); 
    }

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
      
      {/* Shake Animation Definition */}
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
            <p className="text-slate-400">O cronômetro não para!</p>
        </div>
      )}

      {currentQuestion && (
      <>
      <div className="lg:col-span-3 flex flex-col justify-center max-w-3xl mx-auto w-full">
        
        {/* Header: Mode & Progress */}
        <div className="flex items-center justify-between mb-4 text-slate-400 font-display">
          <div className="flex items-center gap-2">
             {isSurvival && <Skull className="w-5 h-5 text-red-500" />}
             {isTimeAttack && <Clock className="w-5 h-5 text-blue-500" />}
             <span>
               {(isSurvival || isTimeAttack) ? `PERGUNTA ${currentQuestionIndex + 1}` : `PERGUNTA ${currentQuestionIndex + 1} / ${questions.length}`}
             </span>
          </div>
          <div className="flex gap-2">
            <span className="bg-slate-800 px-3 py-1 rounded text-sm border border-slate-700">
               {config.mode}
            </span>
            <span className="bg-blue-900/40 text-blue-400 px-3 py-1 rounded text-sm border border-blue-500/30">
               {currentQuestion.category}
            </span>
          </div>
        </div>

        {/* Question Area - Added transition for border color on error */}
        <div className={`glass-panel p-6 md:p-8 rounded-2xl shadow-2xl relative overflow-hidden transition-colors duration-300 ${wasWrong ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : ''}`}>
          
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-xl md:text-2xl font-bold leading-relaxed flex-1 mr-4">
              {currentQuestion.text}
            </h2>
            {currentQuestion.difficulty && (
                <div className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider border ${
                    currentQuestion.difficulty === Difficulty.ROOKIE ? 'bg-green-900/30 text-green-400 border-green-700' :
                    currentQuestion.difficulty === Difficulty.ALL_STAR ? 'bg-orange-900/30 text-orange-400 border-orange-700' :
                    'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                    {currentQuestion.difficulty}
                </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentQuestion.options.map((option, idx) => {
              const isSelected = selectedOption === idx;
              const isCorrect = idx === currentQuestion.correctAnswerIndex;
              const reveal = phase === GamePhase.ROUND_RESULT || phase === GamePhase.GAME_OVER;

              let btnVariant: 'primary' | 'secondary' | 'danger' | 'ghost' = 'secondary';
              let customClass = '';

              if (reveal) {
                if (isCorrect) {
                    btnVariant = 'primary'; 
                    customClass = '!bg-green-600 !border-green-400 !text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]';
                } else if (isSelected && !isCorrect) {
                    btnVariant = 'danger';
                    // Apply shake animation specifically to the wrong answer selected
                    customClass = 'animate-shake';
                } else {
                    btnVariant = 'ghost';
                }
              } else {
                if (isSelected) btnVariant = 'primary';
              }
              
              return (
                <Button
                  key={idx}
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

          {/* Result Overlay */}
          {(phase === GamePhase.ROUND_RESULT && !isTimeAttack && !isSurvival) && (
            <div className="mt-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded-xl animate-slide-up flex gap-3">
              <Info className="w-6 h-6 text-blue-400 flex-shrink-0" />
              <div>
                <p className="font-bold text-blue-300 mb-1">Você sabia?</p>
                <p className="text-slate-300 text-sm">{currentQuestion.explanation}</p>
              </div>
            </div>
          )}

           {/* Loading bar for next question */}
           {(phase === GamePhase.ROUND_RESULT) && (
             <div 
                className="absolute bottom-0 left-0 h-1 bg-blue-500 w-full origin-left will-change-transform" 
                style={{
                  animation: `scaleX ${(isTimeAttack || isSurvival) ? 0.8 : RESULT_DURATION_MS/1000}s linear forwards`
                }}
             />
          )}

        </div>

        {/* Timer Section */}
        <div className="mt-8">
          <Timer 
              key={isTimeAttack ? 'global-timer' : currentQuestionIndex}
              duration={isTimeAttack ? TIME_ATTACK_DURATION : QUESTION_DURATION} 
              onTimeUp={handleTimeUp} 
              isRunning={phase === GamePhase.PLAYING && !isWaitingForMore}
              isGlobal={isTimeAttack}
          />
          {isTimeAttack && <p className="text-center text-xs text-slate-500 mt-2">TEMPO TOTAL</p>}
        </div>

      </div>

      <div className="lg:col-span-1 hidden lg:block h-full">
        <Leaderboard players={players} currentUserId={currentUser.id} />
        <div className="mt-4 p-4 glass-panel rounded-xl text-center">
            <h4 className="text-xs text-slate-500 uppercase font-bold mb-1">Modo Atual</h4>
            <div className="text-blue-400 font-display font-bold text-lg flex items-center justify-center gap-2">
                {isSurvival && <Skull className="w-4 h-4" />}
                {isTimeAttack && <Clock className="w-4 h-4" />}
                {config.mode}
            </div>
        </div>
      </div>
      </>
      )}

    </div>
  );
};