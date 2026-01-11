import { io, Socket } from 'socket.io-client';

// Define the backend URL.
// In development, it defaults to localhost:3001.
// In production (Vercel/Netlify), you must set the environment variable BACKEND_URL (or VITE_BACKEND_URL)
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

console.log('Socket connecting to:', BACKEND_URL);

export const socket: Socket = io(BACKEND_URL, {
  autoConnect: false, // We connect manually when entering Multiplayer mode
  transports: ['websocket', 'polling']
});