import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// One shared socket connection, created once on first import rather than
// per-component -- matches the server's single io instance.
export const socket = io(API_URL, { autoConnect: true });
