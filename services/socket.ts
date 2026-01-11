import { io, Socket } from 'socket.io-client';

// Declaração para evitar erro TS2580 (Cannot find name 'process')
declare const process: any;

// Helper to safely get the Backend URL from window.process (injected by env.js) or global process
const getBackendUrl = () => {
  // Cast window to any to avoid TS2339 (Property 'process' does not exist on type 'Window')
  const win = window as any;
  
  if (typeof window !== 'undefined' && win.process && win.process.env && win.process.env.BACKEND_URL) {
    return win.process.env.BACKEND_URL;
  }
  // Fallback to process.env (build time replacement) or localhost
  return (typeof process !== 'undefined' && process.env && process.env.BACKEND_URL) || 'http://localhost:3001';
};

const BACKEND_URL = getBackendUrl();

console.log('Socket connecting to:', BACKEND_URL);

export const socket: Socket = io(BACKEND_URL, {
  autoConnect: false, // We connect manually when entering Multiplayer mode
  transports: ['websocket', 'polling']
});