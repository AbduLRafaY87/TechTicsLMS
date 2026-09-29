import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

// FIX: Track pending thread joins so that if joinThread() is called before the
// socket connects (or after a reconnect), every room is joined — not just the last one.
const pendingJoins = new Set<string>();

export function getSocket(): Socket {
  if (!socket) {
    socket = io(
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') ||
      'http://localhost:2001',
      {
        autoConnect: false,
        withCredentials: true,
        // Automatically reconnect with exponential backoff
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      }
    );

    // FIX: On every (re)connect, re-emit all pending joins.
    // This covers: initial connection, reconnects after network drops,
    // and the case where joinThread() was called before connect() finished.
    socket.on('connect', () => {
      pendingJoins.forEach(threadId => {
        socket!.emit('join_thread', threadId);
      });
    });
  }

  return socket;
}

export function joinThread(threadId: string) {
  if (!threadId) return;
  const s = getSocket();

  // Always register in pending set — the 'connect' handler will emit it.
  pendingJoins.add(threadId);

  // FIX: Also emit immediately if already connected, since 'connect' won't
  // fire again for an already-connected socket.
  if (s.connected) {
    s.emit('join_thread', threadId);
  }
}

export function leaveThread(threadId: string) {
  if (!threadId) return;

  // Remove from pending so we don't re-join on reconnect
  pendingJoins.delete(threadId);

  const s = getSocket();
  if (s.connected) s.emit('leave_thread', threadId);
}

// FIX: disconnectSocket clears pending joins too, so stale rooms from a previous
// session aren't re-joined when a new socket is created.
export function disconnectSocket() {
  pendingJoins.clear();
  if (socket) {
    socket.off('connect'); // remove the connect listener we added
    socket.disconnect();
    socket = null;
  }
}