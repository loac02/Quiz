import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Garante que process.env não quebre o app se acessado diretamente, 
    // embora estejamos usando window.process via env.js
    'process.env': {} 
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});