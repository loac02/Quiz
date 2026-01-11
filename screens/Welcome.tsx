import React, { useState, useEffect } from 'react';
import { Player } from '../types';
import { Button } from '../components/Button';
import { User, RefreshCw, ChevronRight, Trophy } from 'lucide-react';

interface WelcomeProps {
  onComplete: (player: Player) => void;
  initialPlayer?: Player; // Optional prop for editing mode
}

const AVATAR_SEEDS = ['Felix', 'Aneka', 'Mittens', 'Bandit', 'Spooky', 'Tiger', 'Snowball', 'Whiskers'];

export const Welcome: React.FC<WelcomeProps> = ({ onComplete, initialPlayer }) => {
  const [name, setName] = useState('');
  const [avatarIndex, setAvatarIndex] = useState(0);

  // Initialize state based on initialPlayer if provided
  useEffect(() => {
    if (initialPlayer) {
      setName(initialPlayer.name);
      
      // Try to find the current avatar seed index from the URL
      // URL format: ...svg?seed=SEED_NAME&...
      try {
        const urlObj = new URL(initialPlayer.avatar);
        const currentSeed = urlObj.searchParams.get('seed');
        const index = AVATAR_SEEDS.indexOf(currentSeed || '');
        if (index !== -1) {
          setAvatarIndex(index);
        }
      } catch (e) {
        // Fallback if URL parsing fails
        setAvatarIndex(0);
      }
    }
  }, [initialPlayer]);

  const getAvatarUrl = (seed: string) => `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}&backgroundColor=b6e3f4`;
  
  const currentAvatar = getAvatarUrl(AVATAR_SEEDS[avatarIndex]);

  const handleNextAvatar = () => {
    setAvatarIndex((prev) => (prev + 1) % AVATAR_SEEDS.length);
  };

  const handleRandomize = () => {
    setAvatarIndex(Math.floor(Math.random() * AVATAR_SEEDS.length));
    const randomNames = ['Veloz', 'Craque', 'Mestre', 'Campeão', 'Lenda'];
    const randomSuffix = Math.floor(Math.random() * 100);
    setName(`Jogador ${randomSuffix}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newPlayer: Player = {
      // Preserve ID if editing, otherwise generate new
      id: initialPlayer?.id || `user-${Date.now()}`,
      name: name.trim(),
      avatar: currentAvatar,
      score: initialPlayer?.score || 0, // Preserve previous score if needed, though usually resets on new game
      streak: 0,
      correctAnswersCount: initialPlayer?.correctAnswersCount || 0,
      isBot: false
    };

    onComplete(newPlayer);
  };

  return (
    <div className="max-w-md mx-auto w-full pt-20 px-4">
      <div className="text-center mb-8 animate-fade-in">
        <div className="w-20 h-20 bg-blue-600 rounded-2xl rotate-12 mx-auto flex items-center justify-center shadow-[0_0_30px_rgba(37,99,235,0.6)] mb-6">
           <Trophy className="w-10 h-10 text-white -rotate-12" />
        </div>
        <h1 className="text-4xl font-display font-bold text-white mb-2">
          {initialPlayer ? 'EDITAR PERFIL' : 'BEM-VINDO À ARENA'}
        </h1>
        <p className="text-slate-400">
          {initialPlayer ? 'Atualize seus dados de competidor' : 'Personalize seu perfil para começar'}
        </p>
      </div>

      <div className="glass-panel p-8 rounded-2xl animate-slide-up">
        <form onSubmit={handleSubmit}>
          
          {/* Avatar Section */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative group cursor-pointer" onClick={handleNextAvatar}>
              <div className="w-32 h-32 rounded-full border-4 border-blue-500 overflow-hidden bg-slate-800 shadow-xl transition-transform hover:scale-105 will-change-transform">
                <img src={currentAvatar} alt="Avatar" className="w-full h-full object-cover" />
              </div>
              <div className="absolute bottom-0 right-0 bg-slate-700 p-2 rounded-full border border-slate-500 text-white group-hover:bg-blue-600 transition-colors">
                <RefreshCw className="w-4 h-4" />
              </div>
            </div>
            <button 
              type="button" 
              onClick={handleRandomize}
              className="mt-3 text-xs text-blue-400 hover:text-blue-300 font-bold uppercase tracking-wider"
            >
              Aleatório
            </button>
          </div>

          {/* Name Input */}
          <div className="mb-8">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
              Nome de Jogador
            </label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Digite seu nome..."
                maxLength={15}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-4 pl-12 pr-4 text-white placeholder-slate-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-display text-lg"
                autoFocus
              />
            </div>
          </div>

          <Button 
            fullWidth 
            size="lg" 
            disabled={!name.trim()}
            type="submit"
            className="group"
          >
            {initialPlayer ? 'SALVAR ALTERAÇÕES' : 'ENTRAR NA ARENA'}
            <ChevronRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>

        </form>
      </div>
    </div>
  );
};