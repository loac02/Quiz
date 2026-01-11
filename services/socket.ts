import { io, Socket } from 'socket.io-client';

// Helper to safely get the Backend URL from window.process (injected by env.js) or global process
// @ts-ignore
const getBackendUrl = () => {
  if (typeof window !== 'undefined' && window.process && window.process.env && window.process.env.BACKEND_URL) {
    return window.process.env.BACKEND_URL;
  }
  return process.env.BACKEND_URL || 'http://localhost:3001';
};

const BACKEND_URL = getBackendUrl();

console.log('Socket connecting to:', BACKEND_URL);

export const socket: Socket = io(BACKEND_URL, {
  autoConnect: false, // We connect manually when entering Multiplayer mode
  transports: ['websocket', 'polling']
});