
export enum GamePhase {
  WELCOME = 'WELCOME',
  LOBBY = 'LOBBY',
  LOADING = 'LOADING',
  PLAYING = 'PLAYING',
  ROUND_RESULT = 'ROUND_RESULT',
  GAME_OVER = 'GAME_OVER'
}

export enum Difficulty {
  ROOKIE = 'Novato', // Easy
  PRO = 'Profissional', // Medium
  ALL_STAR = 'Craque', // Hard
  HALL_OF_FAME = 'Lenda' // Expert
}

export enum GameMode {
  CLASSIC = 'Clássico',       // Standard rules
  SURVIVAL = 'Sobrevivência', // One wrong answer = Game Over
  TIME_ATTACK = 'Contra o Relógio', // Global timer for all questions
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswerIndex: number;
  category: string;
  explanation: string;
  difficulty?: Difficulty; // Optional tag from AI
}

export interface Player {
  id: string;
  name: string;
  avatar: string; // URL
  score: number;
  streak: number;
  correctAnswersCount: number; // New field
  isBot: boolean;
  lastAnswerCorrect?: boolean;
  lastAnswerTime?: number; // ms
}

export interface GameConfig {
  topic: string;
  difficulty: Difficulty;
  roundCount: number;
  mode: GameMode;
}

export interface UserStats {
  gamesPlayed: number;
  totalScore: number;
  highScore: number;
  totalCorrect: number;
  totalQuestions: number;
  fastestAnswer: number;
  favoriteCategory: string;
}