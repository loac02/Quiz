import { UserStats, Player, GameMode } from '../types';

const STORAGE_KEY = 'sports_quiz_arena_stats';

// Helper para criar stats vazios de um modo
const emptyModeStats = () => ({
  gamesPlayed: 0,
  highScore: 0,
  totalCorrect: 0
});

const INITIAL_STATS: UserStats = {
  gamesPlayed: 0,
  totalScore: 0,
  highScore: 0,
  totalCorrect: 0,
  totalQuestions: 0,
  fastestAnswer: 9999,
  favoriteCategory: 'Geral',
  modes: {
    [GameMode.CLASSIC]: emptyModeStats(),
    [GameMode.SURVIVAL]: emptyModeStats(),
    [GameMode.TIME_ATTACK]: emptyModeStats(),
  }
};

export const getStats = (): UserStats => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return INITIAL_STATS;

    const parsed = JSON.parse(stored);
    
    // Merge com INITIAL_STATS para garantir que novos campos (como 'modes') existam
    // caso o usuário tenha dados antigos no localStorage
    return {
      ...INITIAL_STATS,
      ...parsed,
      modes: {
        ...INITIAL_STATS.modes,
        ...(parsed.modes || {})
      }
    };
  } catch {
    return INITIAL_STATS;
  }
};

export const updateDetailedStats = (
  score: number, 
  correctCount: number, 
  totalQuestions: number, 
  bestTime: number,
  category: string,
  mode: GameMode = GameMode.CLASSIC // Default fallback
) => {
  const current = getStats();
  
  // Atualiza Stats Gerais
  const updated: UserStats = {
    ...current,
    gamesPlayed: current.gamesPlayed + 1,
    totalScore: current.totalScore + score,
    highScore: Math.max(current.highScore, score),
    totalCorrect: current.totalCorrect + correctCount,
    totalQuestions: current.totalQuestions + totalQuestions,
    fastestAnswer: Math.min(current.fastestAnswer, bestTime),
    favoriteCategory: category,
    // Atualiza Stats do Modo Específico
    modes: {
      ...current.modes,
      [mode]: {
        gamesPlayed: (current.modes[mode]?.gamesPlayed || 0) + 1,
        highScore: Math.max(current.modes[mode]?.highScore || 0, score),
        totalCorrect: (current.modes[mode]?.totalCorrect || 0) + correctCount
      }
    }
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};