import React, { useMemo, useState } from 'react';
import { Player } from '../types';
import { Trophy, Flame, Bot, CheckCircle, User } from 'lucide-react';

interface LeaderboardProps {
  players: Player[];
  currentUserId: string;
}

// Optimized Avatar Sub-component
const AvatarImage = React.memo(({ src, alt, className }: { src: string, alt: string, className?: string }) => {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  return (
    <div className={`relative overflow-hidden bg-slate-800 flex-shrink-0 ${className}`}>
      {/* Skeleton / Loading State */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-700 animate-pulse z-10">
          <User className="w-1/2 h-1/2 text-slate-500 opacity-50" />
        </div>
      )}

      {/* Error Fallback */}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-700 z-20">
          <User className="w-1/2 h-1/2 text-slate-400" />
        </div>
      )}

      {/* Actual Image */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
        className={`w-full h-full object-cover transition-opacity duration-500 ${
          status === 'loaded' ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
});

// React.memo ensures the component only re-renders if props (players array ref or currentUserId) change
export const Leaderboard: React.FC<LeaderboardProps> = React.memo(({ players, currentUserId }) => {
  
  // useMemo ensures we only sort the array when the players data actually changes
  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      // Primary Sort: Score (Descending)
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // Secondary Sort: Streak (Descending) - Reward consistency
      if (b.streak !== a.streak) {
        return b.streak - a.streak;
      }
      // Tertiary Sort: Name (Ascending) - Stability
      return a.name.localeCompare(b.name);
    });
  }, [players]);

  return (
    <div className="glass-panel rounded-xl p-4 h-full flex flex-col">
      <h3 className="text-xl font-display font-bold mb-4 flex items-center gap-2 text-blue-400">
        <Trophy className="w-5 h-5" />
        Ranking Ao Vivo
      </h3>
      
      <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar">
        {sortedPlayers.map((player, index) => (
          <div 
            key={player.id}
            className={`
              flex items-center p-3 rounded-lg border transition-all duration-300
              ${player.id === currentUserId 
                ? 'bg-blue-900/40 border-blue-500/50' 
                : 'bg-slate-800/40 border-slate-700/50'}
            `}
          >
            <div className="flex-shrink-0 w-8 text-center font-bold text-slate-400">
              {index + 1}
            </div>
            
            <div className="relative">
              <AvatarImage 
                src={player.avatar}
                alt={player.name}
                className="w-10 h-10 rounded-full border-2 border-slate-600"
              />
              {player.streak > 1 && (
                 <div className="absolute -top-1 -right-1 bg-orange-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold animate-bounce z-30">
                    {player.streak}x
                 </div>
              )}
            </div>

            <div className="ml-3 flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="font-semibold text-sm truncate">{player.name}</span>
                {player.isBot && <Bot className="w-3 h-3 text-slate-500 flex-shrink-0" />}
              </div>
              <div className="text-xs text-slate-400 truncate">
                 {player.streak > 2 ? <span className="text-orange-400 flex items-center gap-1"><Flame className="w-3 h-3"/> Pegando Fogo!</span> : 'No ritmo'}
              </div>
            </div>

            <div className="text-right flex flex-col items-end pl-2">
              <div className="font-bold font-display text-lg text-white leading-none">
                {player.score}
              </div>
              <div className="flex items-center gap-1 text-xs text-green-400 mt-1">
                 <CheckCircle className="w-3 h-3" />
                 <span>{player.correctAnswersCount || 0}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});