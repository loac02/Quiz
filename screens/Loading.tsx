import React, { useEffect, useState } from 'react';
import { Trophy, Timer, Zap, Brain, Activity } from 'lucide-react';

const LOADING_MESSAGES = [
  "Aquecendo os motores...",
  "Convocando os atletas...",
  "Calibrando o cronômetro...",
  "Analisando estatísticas...",
  "Preparando o gramado...",
  "Revisando as regras...",
  "Inflando as bolas...",
  "Ajustando os refletores..."
];

const TIPS = [
  "Responda rápido! Pontos de velocidade podem decidir o jogo.",
  "Mantenha a sequência de acertos para ativar o multiplicador de fogo.",
  "No modo Sobrevivência, um erro é fatal. Jogue com cautela!",
  "Use o tempo a seu favor, mas não chute sem pensar.",
  "Perguntas mais difíceis valem mais pontos no ranking."
];

export const Loading: React.FC = () => {
  const [messageIndex, setMessageIndex] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    // Cycle loading messages
    const msgInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 1500);

    // Pick a random tip on mount
    setTipIndex(Math.floor(Math.random() * TIPS.length));

    return () => clearInterval(msgInterval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[600px] w-full animate-fade-in p-6 relative overflow-hidden">
      
      {/* Decorative Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Main Loader */}
      <div className="relative z-10 flex flex-col items-center">
        <div className="relative mb-12">
          {/* Rotating Rings */}
          <div className="w-32 h-32 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" style={{ animationDuration: '2s' }} />
          <div className="absolute inset-0 w-32 h-32 border-4 border-purple-500/30 border-b-purple-500 rounded-full animate-spin" style={{ animationDuration: '3s', animationDirection: 'reverse' }} />
          
          {/* Center Icon */}
          <div className="absolute inset-0 flex items-center justify-center">
             <Trophy className="w-12 h-12 text-yellow-400 animate-bounce" />
          </div>
        </div>

        <h2 className="text-3xl font-display font-bold text-white mb-2 tracking-wider text-center">
          PREPARANDO ARENA
        </h2>
        
        <div className="h-8 mb-8">
           <p className="text-blue-400 font-mono text-sm animate-pulse text-center">
             {LOADING_MESSAGES[messageIndex]}
           </p>
        </div>

        {/* Pro Tip Card */}
        <div className="glass-panel p-6 rounded-xl max-w-md w-full border border-white/10 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-yellow-500" />
          <div className="flex items-start gap-4">
             <div className="bg-yellow-500/20 p-2 rounded-lg">
                <Zap className="w-5 h-5 text-yellow-400" />
             </div>
             <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">DICA DE MESTRE</h3>
                <p className="text-slate-200 text-sm leading-relaxed">
                  "{TIPS[tipIndex]}"
                </p>
             </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex gap-8 mt-12 opacity-50">
           <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-500 font-bold uppercase">IA Conectada</span>
           </div>
           <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-500 font-bold uppercase">Latência Baixa</span>
           </div>
        </div>
      </div>
    </div>
  );
};