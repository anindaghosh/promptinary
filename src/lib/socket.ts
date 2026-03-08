// Module-level singleton so the same socket instance is shared across page
// navigations. Without this, navigating from the landing page to the room
// page creates a second socket that re-joins the room, duplicating the player.

import { io, Socket } from 'socket.io-client';

let _socket: Socket | null = null;

export function getSocket(): Socket {
  if (_socket && (_socket.connected || _socket.active)) {
    return _socket;
  }
  const socketUrl = (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_SOCKET_URL) || '';
  _socket = io(socketUrl, { path: '/socket.io', transports: ['websocket', 'polling'] });
  return _socket;
}

export function disconnectSocket() {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}
