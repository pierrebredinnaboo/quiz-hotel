import React, { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { Button } from '../components/ui/Button';
import { HomeButton } from '../components/ui/HomeButton';
import { motion } from 'framer-motion';

export default function Leaderboard() {
    const { socket } = useSocket();
    const [soloScores, setSoloScores] = useState([]);
    const [multiplayerScores, setMultiplayerScores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('solo');
    const [expandedGame, setExpandedGame] = useState(null); // For accordion

    useEffect(() => {
        if (!socket) return;

        const fetchScores = () => {
            socket.emit('get_solo_leaderboard', (data) => {
                console.log('Received solo leaderboard:', data);
                setSoloScores(data);
                setLoading(false);
            });
            socket.emit('get_multiplayer_leaderboard', (data) => {
                console.log('Received multiplayer leaderboard:', data);
                setMultiplayerScores(data);
            });
        };

        if (socket.connected) {
            fetchScores();
        } else {
            socket.on('connect', fetchScores);
        }

        return () => {
            socket.off('connect', fetchScores);
        };
    }, [socket]);

    const toggleGame = (gameId) => {
        setExpandedGame(expandedGame === gameId ? null : gameId);
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white p-8 relative">
            <HomeButton className="top-8 left-8" />

            <div className="max-w-4xl mx-auto">
                <h1 className="text-5xl font-bold text-center mb-8 text-marriott">Hall of Fame</h1>

                {/* Tabs */}
                <div className="flex gap-4 mb-8 justify-center border-b border-gray-700">
                    <button
                        onClick={() => setActiveTab('solo')}
                        className={`px-8 py-3 text-2xl font-bold transition-colors ${activeTab === 'solo' ? 'text-marriott border-b-4 border-marriott' : 'text-gray-400 hover:text-white'}`}
                    >
                        Solo Mode
                    </button>
                    <button
                        onClick={() => setActiveTab('multiplayer')}
                        className={`px-8 py-3 text-2xl font-bold transition-colors ${activeTab === 'multiplayer' ? 'text-marriott border-b-4 border-marriott' : 'text-gray-400 hover:text-white'}`}
                    >
                        Multiplayer
                    </button>
                </div>

                {loading ? (
                    <div className="text-center text-2xl animate-pulse">Loading scores...</div>
                ) : (
                    <div className="space-y-4">
                        {activeTab === 'solo' ? (
                            // Solo leaderboard
                            soloScores.length === 0 ? (
                                <div className="text-center text-gray-400 text-xl">No games played yet. Be the first!</div>
                            ) : (
                                soloScores.map((s, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.1 }}
                                        className={`p-6 rounded-2xl flex justify-between items-center text-2xl shadow-lg border border-gray-800 ${i === 0 ? 'bg-gradient-to-r from-yellow-600/20 to-yellow-900/20 border-yellow-600/50' : 'bg-gray-800'}`}
                                    >
                                        <div className="flex items-center gap-6">
                                            <span className={`font-bold w-12 text-center ${i === 0 ? 'text-4xl' : 'text-gray-500'}`}>
                                                {i === 0 ? '👑' : i + 1}
                                            </span>
                                            <span className="text-3xl">{s.avatar || '👤'}</span>
                                            <span className="font-bold">{s.nickname}</span>
                                        </div>
                                        <div className="flex items-center gap-8">
                                            <span className="text-sm text-gray-500 hidden sm:block">
                                                {new Date(s.date).toLocaleDateString()}
                                            </span>
                                            <span className="font-bold text-marriott">{s.score} pts</span>
                                        </div>
                                    </motion.div>
                                ))
                            )
                        ) : (
                            // Multiplayer games accordion
                            multiplayerScores.length === 0 ? (
                                <div className="text-center text-gray-400 text-xl">No multiplayer games yet. Host a game!</div>
                            ) : (
                                multiplayerScores.map((game, i) => (
                                    <motion.div
                                        key={game.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.1 }}
                                        className="bg-gray-800 rounded-2xl overflow-hidden border border-gray-700"
                                    >
                                        {/* Game Header */}
                                        <button
                                            onClick={() => toggleGame(game.id)}
                                            className="w-full p-6 flex justify-between items-center hover:bg-gray-750 transition-colors text-left"
                                        >
                                            <div className="flex items-center gap-4">
                                                <span className="text-2xl font-bold text-marriott">Game #{multiplayerScores.length - i}</span>
                                                <span className="text-gray-400">•</span>
                                                <span className="text-gray-400">{new Date(game.date).toLocaleDateString()}</span>
                                                <span className="text-gray-400">•</span>
                                                <span className="text-green-400">👑 {game.winner}</span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="text-gray-400">{game.players.length} players</span>
                                                <span className="text-2xl">{expandedGame === game.id ? '▼' : '▶'}</span>
                                            </div>
                                        </button>

                                        {/* Game Details (Accordion Content) */}
                                        {expandedGame === game.id && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="border-t border-gray-700 p-6 space-y-3"
                                            >
                                                {game.players.map((player, idx) => (
                                                    <div
                                                        key={idx}
                                                        className={`flex justify-between items-center p-4 rounded-xl ${idx === 0 ? 'bg-yellow-600/20 border border-yellow-600/50' : 'bg-gray-700'}`}
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <span className="font-bold w-8 text-center text-gray-400">
                                                                {idx === 0 ? '👑' : `#${idx + 1}`}
                                                            </span>
                                                            <span className="text-2xl">{player.avatar}</span>
                                                            <span className="font-bold">{player.nickname}</span>
                                                        </div>
                                                        <span className="font-bold text-marriott">{player.score} pts</span>
                                                    </div>
                                                ))}
                                            </motion.div>
                                        )}
                                    </motion.div>
                                ))
                            )
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
