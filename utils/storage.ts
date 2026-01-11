import { UserStats, Player } from '../types';

const STORAGE_KEY = 'sports_quiz_arena_stats';

const INITIAL_STATS: UserStats = {
  gamesPlayed: 0,
  totalScore: 0,
  highScore: 0,
  totalCorrect: 0,
  totalQuestions: 0,
  fastestAnswer: 9999, // dummy high value
  favoriteCategory: 'Geral'
};

export const getStats = (): UserStats => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : INITIAL_STATS;
  } catch {
    return INITIAL_STATS;
  }
};

export const saveStats = (player: Player, questionsTotal: number, category: string) => {
  if (player.isBot) return;

  const current = getStats();
  const newCorrect = player.score > 0 ? Math.floor(player.score / 100) : 0; // Estimation if strictly based on score, better to track real count in Arena but this is safe fallback
  
  // Update logic
  const updated: UserStats = {
    gamesPlayed: current.gamesPlayed + 1,
    totalScore: current.totalScore + player.score,
    highScore: Math.max(current.highScore, player.score),
    totalCorrect: current.totalCorrect + (player.streak > 0 ? player.streak : 0), // Simplification: using streak as proxy for session correct in this localized scope if simple
    totalQuestions: current.totalQuestions + questionsTotal,
    fastestAnswer: current.fastestAnswer, // Need to pass this from Arena ideally
    favoriteCategory: category // Simplified overwrite for now
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};

export const updateDetailedStats = (
  score: number, 
  correctCount: number, 
  totalQuestions: number, 
  bestTime: number,
  category: string
) => {
  const current = getStats();
  
  const updated: UserStats = {
    gamesPlayed: current.gamesPlayed + 1,
    totalScore: current.totalScore + score,
    highScore: Math.max(current.highScore, score),
    totalCorrect: current.totalCorrect + correctCount,
    totalQuestions: current.totalQuestions + totalQuestions,
    fastestAnswer: Math.min(current.fastestAnswer, bestTime),
    favoriteCategory: category
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};
