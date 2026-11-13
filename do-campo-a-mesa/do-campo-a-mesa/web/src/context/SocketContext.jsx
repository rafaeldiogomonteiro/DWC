// Uma ligação Socket.io por sessão, usada para as notificações pessoais (sala user:ID)
import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!token) { setSocket(null); return undefined; }
    const s = io(API_URL, { auth: { token } });
    setSocket(s);
    return () => s.disconnect();
  }, [token]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export const useSocket = () => useContext(SocketContext);

// Subscreve um evento do socket enquanto o componente estiver montado
export function useEventoSocket(evento, handler) {
  const socket = useSocket();
  useEffect(() => {
    if (!socket) return undefined;
    socket.on(evento, handler);
    return () => socket.off(evento, handler);
  }, [socket, evento, handler]);
}
