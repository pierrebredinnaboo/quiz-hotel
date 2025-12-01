import React, { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { HomeButton } from '../components/ui/HomeButton';
import { AvatarSelector } from '../components/ui/AvatarSelector';
import { motion, AnimatePresence } from 'framer-motion';
import { useSound } from '../hooks/useSound';

export default function Player() {
    const { socket, isConnected } = useSocket();
    const { playClick } = useSound();
    const [joined, setJoined] = useState(false);
    const [nickname, setNickname] = useState('');
    const [avatar, setAvatar] = useState('🐼');
    const [roomCode, setRoomCode] = useState('');
    const [gameState, setGameState] = useState('WAITING'); // WAITING, QUESTION, RESULT
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [lastResult, setLastResult] = useState(null);
    const [score, setScore] = useState(0);
    const [selectedAnswers, setSelectedAnswers] = useState([]); // For multi-select

    // Auto-fill room code from URL parameter
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const urlRoomCode = params.get('roomCode');
        if (urlRoomCode) {
            setRoomCode(urlRoomCode);
        }
    }, []);

    useEffect(() => {
        if (!socket) return;

        socket.on('game_started', () => {
            setGameState('WAITING'); // Wait for question
        });

        socket.on('new_question', ({ question }) => {
            setCurrentQuestion(question);
            setGameState('QUESTION');
            setLastResult(null);
            setSelectedAnswers([]); // Reset selections
        });

        socket.on('question_result', (result) => {
            setLastResult(result);
            setScore(result.score);
            setGameState('RESULT');
        });

        socket.on('game_over', () => {
            setGameState('FINISHED');
        });

        return () => {
            socket.off('game_started');
            socket.off('new_question');
            socket.off('question_result');
            socket.off('game_over');
        };
    }, [socket]);

    const joinGame = () => {
        if (!isConnected) {
            alert("Not connected to server. Please check your internet connection or try again.");
            return;
        }
        if (!nickname || !roomCode) return;
        socket.emit('join_room', { roomCode, nickname, avatar }, (response) => {
            if (response.success) {
                setJoined(true);
            } else {
                alert(response.error);
            }
        });
    };

    const submitAnswer = (answer) => {
        socket.emit('submit_answer', { roomCode, answer });
        setGameState('WAITING'); // Wait for result
    };

    const toggleAnswer = (index) => {
        setSelectedAnswers(prev => {
            if (prev.includes(index)) {
                return prev.filter(i => i !== index);
            } else {
                return [...prev, index];
            }
        });
    };

    const submitMultiSelect = () => {
        socket.emit('submit_answer', { roomCode, answer: selectedAnswers });
        setGameState('WAITING');
    };

    if (!joined) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 relative">
                <HomeButton />
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-full max-w-md space-y-6"
                >
                    <h1 className="text-4xl font-black text-center text-marriott mb-8">Marriott Quiz</h1>

                    {!isConnected && (
                        <div className="bg-red-500/20 border border-red-500 text-red-200 p-4 rounded-xl text-center animate-pulse">
                            🔌 Connecting to server...
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="text-center">
                            <label className="block text-gray-400 mb-2">Choose Avatar</label>
                            <AvatarSelector selectedAvatar={avatar} onSelect={setAvatar} />
                        </div>

                        <Input
                            placeholder="Room Code"
                            value={roomCode}
                            onChange={e => setRoomCode(e.target.value)}
                            className="text-center text-3xl tracking-widest uppercase py-4 font-bold"
                        />
                        <Input
                            placeholder="Nickname"
                            value={nickname}
                            onChange={e => setNickname(e.target.value)}
                            className="text-center text-xl py-4"
                        />
                    </div>
                    <Button
                        onClick={joinGame}
                        disabled={!isConnected}
                        className="w-full text-2xl py-6 rounded-2xl shadow-lg shadow-marriott/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isConnected ? "Enter Game" : "Connecting..."}
                    </Button>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 text-white p-4 flex flex-col overflow-hidden relative">
            <HomeButton />
            <div className="flex justify-between items-center mb-6 pl-12">
                <div className="flex items-center gap-3">
                    <span className="text-3xl">{avatar}</span>
                    <div className="font-bold text-xl">{nickname}</div>
                </div>
                <div className="bg-marriott px-4 py-2 rounded-full text-lg font-bold shadow-lg">{score} pts</div>
            </div>

            <div className="flex-1 flex flex-col justify-center relative">
                <AnimatePresence mode="wait">
                    {gameState === 'WAITING' && (
                        <motion.div
                            key="waiting"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="text-center flex flex-col items-center gap-6"
                        >
                            <div className="w-16 h-16 border-4 border-marriott border-t-transparent rounded-full animate-spin" />
                            <div className="text-3xl font-bold text-gray-400 animate-pulse">
                                {lastResult ? "Waiting for next question..." : "Get Ready!"}
                            </div>
                        </motion.div>
                    )}

                    {gameState === 'QUESTION' && currentQuestion && (
                        <motion.div
                            key="question"
                            initial={{ y: 50, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -50, opacity: 0 }}
                            className="space-y-4"
                        >
                            {currentQuestion.type === 'multi-select' ? (
                                // Multi-select UI
                                <>
                                    <div className="grid grid-cols-2 gap-4 max-h-[50vh] overflow-y-auto">
                                        {currentQuestion.options.map((opt, i) => (
                                            <motion.button
                                                key={i}
                                                whileTap={{ scale: 0.95 }}
                                                onClick={() => {
                                                    playClick();
                                                    toggleAnswer(i);
                                                }}
                                                className={`rounded-2xl p-4 text-lg font-bold transition-all border-b-4 shadow-xl flex items-center justify-center text-center leading-tight ${selectedAnswers.includes(i)
                                                    ? 'bg-marriott border-marriott-dark'
                                                    : 'bg-gray-800 border-gray-950 hover:bg-gray-700'
                                                    }`}
                                            >
                                                {opt}
                                            </motion.button>
                                        ))}
                                    </div>
                                    <Button
                                        onClick={() => {
                                            playClick();
                                            submitMultiSelect();
                                        }}
                                        disabled={selectedAnswers.length === 0}
                                        className="w-full py-4 text-xl"
                                    >
                                        Submit ({selectedAnswers.length} selected)
                                    </Button>
                                </>
                            ) : (
                                // Standard single-select UI
                                <div className="grid grid-cols-2 gap-4 h-full max-h-[60vh]">
                                    {currentQuestion.options.map((opt, i) => (
                                        <motion.button
                                            key={i}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => {
                                                playClick();
                                                submitAnswer(i);
                                            }}
                                            className="bg-gray-800 rounded-2xl p-4 text-xl font-bold hover:bg-gray-700 active:scale-95 transition-all border-b-4 border-gray-950 shadow-xl flex items-center justify-center text-center leading-tight"
                                        >
                                            {opt}
                                        </motion.button>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {gameState === 'RESULT' && lastResult && (
                        <motion.div
                            key="result"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className={`text-center p-12 rounded-3xl shadow-2xl ${lastResult.correct ? 'bg-green-600' : 'bg-red-600'}`}
                        >
                            <h2 className="text-6xl font-black mb-4">{lastResult.correct ? "Correct!" : "Wrong!"}</h2>
                            <div className="text-4xl font-bold mb-6">+{lastResult.points} pts</div>
                            {lastResult.type === 'multi-select' && (
                                <div className="text-2xl font-bold mb-4">
                                    {lastResult.correctCount}/{lastResult.totalCorrect} correct selections
                                </div>
                            )}
                            {lastResult.streak > 2 && (
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="mt-4 text-yellow-300 font-black text-3xl flex items-center justify-center gap-2"
                                >
                                    🔥 Streak: {lastResult.streak}
                                </motion.div>
                            )}
                        </motion.div>
                    )}

                    {gameState === 'FINISHED' && (
                        <motion.div
                            key="finished"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-center"
                        >
                            <h1 className="text-5xl font-black mb-8">Game Over</h1>
                            <div className="text-4xl font-bold text-marriott">Final Score: {score}</div>
                            <Button
                                onClick={() => window.location.reload()}
                                className="mt-12 w-full py-6 text-xl"
                                variant="outline"
                            >
                                Play Again
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
