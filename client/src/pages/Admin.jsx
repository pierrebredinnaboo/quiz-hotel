import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { HomeButton } from '../components/ui/HomeButton';
import { motion } from 'framer-motion';

export default function Admin() {
    const socket = useSocket();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const [soloScores, setSoloScores] = useState([]);
    const [multiplayerScores, setMultiplayerScores] = useState([]);
    const [dailyScores, setDailyScores] = useState([]);
    const [activeTab, setActiveTab] = useState('solo');

    useEffect(() => {
        // Check if already authenticated
        const auth = localStorage.getItem('admin_auth');
        if (auth === 'true') {
            setIsAuthenticated(true);
        }
    }, []);

    useEffect(() => {
        if (isAuthenticated && socket) {
            fetchLeaderboards();
        }
    }, [isAuthenticated, socket]);

    const fetchLeaderboards = () => {
        socket.emit('get_solo_leaderboard', (data) => {
            setSoloScores(data);
        });
        socket.emit('get_multiplayer_leaderboard', (data) => {
            setMultiplayerScores(data);
        });
        socket.emit('get_daily_leaderboard', (data) => {
            setDailyScores(data);
        });
    };

    const handleLogin = () => {
        if (!socket) return;

        socket.emit('admin_login', { password }, (response) => {
            if (response.success) {
                setIsAuthenticated(true);
                localStorage.setItem('admin_auth', 'true');
                setError('');
            } else {
                setError('Invalid password');
            }
        });
    };

    const handleLogout = () => {
        setIsAuthenticated(false);
        localStorage.removeItem('admin_auth');
    };

    const handleDeleteScore = (leaderboard, index) => {
        if (!confirm('Are you sure you want to delete this score?')) return;

        socket.emit('admin_delete_score', { leaderboard, index }, (response) => {
            if (response.success) {
                fetchLeaderboards();
            }
        });
    };

    const handleClearLeaderboard = (leaderboard) => {
        if (!confirm(`Are you sure you want to clear the entire ${leaderboard} leaderboard?`)) return;

        socket.emit('admin_clear_leaderboard', { leaderboard }, (response) => {
            if (response.success) {
                fetchLeaderboards();
            }
        });
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4 relative">
                <HomeButton />
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-full max-w-md space-y-6 bg-gray-800 p-8 rounded-3xl border border-gray-700"
                >
                    <h1 className="text-4xl font-black text-center text-marriott mb-8">Admin Login</h1>

                    <div className="space-y-4">
                        <Input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            onKeyPress={e => e.key === 'Enter' && handleLogin()}
                            className="text-center text-xl py-4"
                        />
                        {error && <div className="text-red-500 text-center">{error}</div>}
                    </div>

                    <Button onClick={handleLogin} className="w-full text-2xl py-6 rounded-2xl">
                        Login
                    </Button>
                </motion.div>
            </div>
        );
    }

    const renderLeaderboard = (scores, leaderboardType) => (
        <div className="space-y-3">
            {scores.length === 0 ? (
                <div className="text-center text-gray-400 py-8">No scores yet</div>
            ) : (
                scores.map((s, i) => (
                    <div key={i} className="flex justify-between items-center p-4 bg-gray-800 rounded-xl border border-gray-700">
                        <div className="flex items-center gap-4">
                            <span className="font-bold w-8 text-gray-500">#{i + 1}</span>
                            <span className="text-2xl">{s.avatar || '👤'}</span>
                            <span className="font-bold">{s.nickname}</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="font-mono font-bold">{s.score}</span>
                            <Button
                                variant="ghost"
                                onClick={() => handleDeleteScore(leaderboardType, i)}
                                className="text-red-500 hover:text-red-400 p-2"
                            >
                                🗑️
                            </Button>
                        </div>
                    </div>
                ))
            )}
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-900 text-white p-8 relative">
            <HomeButton />

            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-12">
                    <h1 className="text-5xl font-bold text-marriott">Admin Panel</h1>
                    <Button onClick={handleLogout} variant="outline">
                        Logout
                    </Button>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 mb-8 border-b border-gray-700">
                    <button
                        onClick={() => setActiveTab('solo')}
                        className={`px-6 py-3 text-xl font-bold transition-colors ${activeTab === 'solo' ? 'text-marriott border-b-2 border-marriott' : 'text-gray-400 hover:text-white'}`}
                    >
                        Solo Mode
                    </button>
                    <button
                        onClick={() => setActiveTab('multiplayer')}
                        className={`px-6 py-3 text-xl font-bold transition-colors ${activeTab === 'multiplayer' ? 'text-marriott border-b-2 border-marriott' : 'text-gray-400 hover:text-white'}`}
                    >
                        Multiplayer
                    </button>
                    <button
                        onClick={() => setActiveTab('daily')}
                        className={`px-6 py-3 text-xl font-bold transition-colors ${activeTab === 'daily' ? 'text-marriott border-b-2 border-marriott' : 'text-gray-400 hover:text-white'}`}
                    >
                        Daily Solo
                    </button>
                </div>

                {/* Leaderboard Content */}
                <div className="bg-gray-850 p-6 rounded-3xl border border-gray-700">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-3xl font-bold">
                            {activeTab === 'solo' && 'Solo Mode Leaderboard'}
                            {activeTab === 'multiplayer' && 'Multiplayer Leaderboard'}
                            {activeTab === 'daily' && 'Daily Solo Leaderboard'}
                        </h2>
                        <Button
                            onClick={() => handleClearLeaderboard(activeTab)}
                            variant="outline"
                            className="text-red-500 border-red-500 hover:bg-red-500 hover:text-white"
                        >
                            Clear All
                        </Button>
                    </div>

                    {activeTab === 'solo' && renderLeaderboard(soloScores, 'solo')}
                    {activeTab === 'multiplayer' && renderLeaderboard(multiplayerScores, 'multiplayer')}
                    {activeTab === 'daily' && renderLeaderboard(dailyScores, 'daily')}
                </div>
            </div>
        </div>
    );
}
