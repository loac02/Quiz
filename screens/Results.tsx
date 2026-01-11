import React, { useMemo } from 'react';
import { Player } from '../types';
import { Button } from '../components/Button';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { RotateCcw, Home, Award, CheckCircle } from 'lucide-react';

interface ResultsProps {
  players: Player[];
  onPlayAgain: () => void;
  onHome: () => void;
}

export const Results: React.FC<ResultsProps> = ({ players, onPlayAgain, onHome }) => {
  
  // Optimization: Memoize sorting logic
  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => b.score - a.score);
  }, [players]);

  const winner = sortedPlayers[0];

  // Optimization: Memoize chart data preparation
  const data = useMemo(() => {
    return sortedPlayers.map(p => ({
      name: p.name,
      score: p.score,
      isUser: !p.isBot
    }));
  }, [sortedPlayers]);

  return (
    <div className="max-w-5xl mx-auto w-full pt-8 px-4 flex flex-col items-center animate-fade-in pb-10">
      
      {/* Winner Podium */}
      <div className="text-center mb-10 relative">
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(234, 179, 8, 0.15) 0%, rgba(0,0,0,0) 70%)'
          }}
        ></div>
        
        <Award className="w-24 h-24 mx-auto text-yellow-400 mb-4 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)] animate-bounce" />
        <h1 className="text-5xl font-display font-bold mb-2 relative z-10">
          {winner.isBot ? `${winner.name} Venceu!` : 'VITÓRIA!'}
        </h1>
        <div className="flex justify-center gap-6 relative z-10 text-xl">
           <p className="text-slate-400">Pontuação: <span className="text-white font-bold">{winner.score}</span></p>
           <p className="text-slate-400 flex items-center gap-1">Acertos: <CheckCircle className="w-5 h-5 text-green-500" /> <span className="text-white font-bold">{winner.correctAnswersCount || 0}</span></p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
        
        {/* Scoreboard */}
        <div className="glass-panel p-6 rounded-2xl animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <h3 className="text-xl font-bold mb-6 border-b border-slate-700 pb-2">Classificação Final</h3>
          <div className="space-y-4">
            {sortedPlayers.map((player, index) => (
              <div 
                key={player.id}
                className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                  index === 0 
                    ? 'bg-gradient-to-r from-yellow-900/40 to-slate-900 border-yellow-500/50' 
                    : 'bg-slate-800/40 border-slate-700'
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className={`font-bold text-lg w-6 ${index === 0 ? 'text-yellow-400' : 'text-slate-500'}`}>
                    #{index + 1}
                  </span>
                  <img src={player.avatar} className="w-12 h-12 rounded-full border-2 border-slate-600" alt={player.name} />
                  <div>
                    <p className="font-bold text-lg">{player.name}</p>
                    <div className="flex gap-3 text-sm text-slate-400">
                        <span>Streak: {player.streak}x</span>
                        <span className="flex items-center gap-1 text-green-400"><CheckCircle className="w-3 h-3"/> {player.correctAnswersCount || 0}</span>
                    </div>
                  </div>
                </div>
                <div className="font-display font-bold text-2xl text-blue-400">
                  {player.score}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stats Chart */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <h3 className="text-xl font-bold mb-6 border-b border-slate-700 pb-2">Análise de Desempenho</h3>
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 40, right: 40 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} tick={{fill: '#94a3b8', fontSize: 12}} />
                <Tooltip 
                  cursor={{fill: 'rgba(255,255,255,0.05)'}}
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
                <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={24} animationDuration={1000}>
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.isUser ? '#3b82f6' : '#475569'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4 mt-12 mb-12 animate-fade-in" style={{ animationDelay: '0.5s' }}>
        <Button onClick={onHome} variant="secondary" size="lg">
          <Home className="w-5 h-5 mr-2" /> Menu Principal
        </Button>
        <Button onClick={onPlayAgain} size="lg">
          <RotateCcw className="w-5 h-5 mr-2" /> Jogar Novamente
        </Button>
      </div>
    </div>
  );
};