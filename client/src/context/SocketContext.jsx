import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        // Connect to backend using environment variable or fallback to localhost
        const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';
        console.log('🔌 Connecting to socket:', socketUrl);
        const newSocket = io(socketUrl);

        newSocket.on('connect', () => {
            console.log('✅ Socket connected!');
        });

        newSocket.on('connect_error', (error) => {
            console.error('❌ Socket connection error:', error);
        });

        setSocket(newSocket);

        return () => newSocket.close();
    }, []);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
};
