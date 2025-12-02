import React, { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { HomeButton } from '../components/ui/HomeButton';
import { AvatarSelector } from '../components/ui/AvatarSelector';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useSound } from '../hooks/useSound';
import { highlightBrands } from '../utils/highlightBrands';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Player UI Error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
                    <div className="text-center">
                        <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
                        <Button onClick={() => window.location.reload()}>Reload Game</Button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default function Player() {
    return (
        <ErrorBoundary>
            <PlayerContent />
        </ErrorBoundary>
    );
}

function PlayerContent() {
    const { socket, isConnected } = useSocket();
    const { playClick } = useSound();
    const [joined, setJoined] = useState(false);
    const [nickname, setNickname] = useState('');
    const [avatar, setAvatar] = useState('🐼');
    const [roomCode, setRoomCode] = useState('');
    const [gameState, setGameState] = useState('WAITING'); // WAITING, QUESTION, RESULT, LEADERBOARD, FINISHED
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [lastResult, setLastResult] = useState(null);
    const [score, setScore] = useState(0);
    const [selectedAnswers, setSelectedAnswers] = useState([]); // For multi-select
    const [lobbyPlayers, setLobbyPlayers] = useState([]); // Players in lobby
    const [leaderboard, setLeaderboard] = useState([]); // Intermediate leaderboard
    const [correctAnswerText, setCorrectAnswerText] = useState(''); // Correct answer display
    const [finalLeaderboard, setFinalLeaderboard] = useState([]); // Final podium

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

        socket.on('lobby_update', ({ players }) => {
            setLobbyPlayers(players);
        });

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
            // Don't change state here, wait for question_ended
        });

        socket.on('question_ended', ({ leaderboard, correctAnswerText, correctAnswers, type }) => {
            if (Array.isArray(leaderboard)) {
                setLeaderboard(leaderboard);
            }
            setCorrectAnswerText(correctAnswerText);
            // Update current question with correct answers for display
            if (currentQuestion) {
                setCurrentQuestion(prev => ({
                    ...prev,
                    correctAnswers: correctAnswers,
                    type: type
                }));
            }
            setGameState('LEADERBOARD');
        });

        socket.on('game_over', ({ leaderboard }) => {
            if (Array.isArray(leaderboard)) {
                setFinalLeaderboard(leaderboard);
            }
            setGameState('FINISHED');
        });

        return () => {
            socket.emit('leave_room');
            socket.off('lobby_update');
            socket.off('game_started');
            socket.off('new_question');
            socket.off('question_result');
            socket.off('question_ended');
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
            <div className="flex justify-between items-center mb-4 pl-12">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">{avatar}</span>
                    <div className="font-bold text-base">{nickname}</div>
                </div>
                <div className="bg-marriott px-3 py-1 rounded-full text-sm font-bold shadow-lg">{score} pts</div>
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
                            {lobbyPlayers.length > 0 ? (
                                // Lobby view
                                <div className="w-full max-w-2xl space-y-6">
                                    <h2 className="text-xl font-bold text-marriott">Lobby</h2>
                                    <div className="bg-gray-800 rounded-xl p-4 space-y-2">
                                        {lobbyPlayers.map((player, index) => (
                                            <div
                                                key={index}
                                                className="flex items-center gap-3 bg-gray-700 rounded-lg p-3"
                                            >
                                                <span className="text-2xl">{player.avatar}</span>
                                                <span className="text-base font-bold flex-1">{player.nickname}</span>
                                                {player.isHost && (
                                                    <span className="bg-marriott px-2 py-0.5 rounded-full text-xs font-bold">
                                                        Host
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="text-gray-400 animate-pulse">
                                        Waiting for host to start the game...
                                    </div>
                                </div>
                            ) : (
                                // Loading spinner
                                <>
                                    <div className="w-12 h-12 border-4 border-marriott border-t-transparent rounded-full animate-spin" />
                                    <div className="text-xl font-bold text-gray-400 animate-pulse">
                                        {lastResult ? "Waiting for next question..." : "Get Ready!"}
                                    </div>
                                </>
                            )}
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
                            {/* Question Text */}
                            <div className="text-center mb-6">
                                {currentQuestion.type === 'multi-select' && (
                                    <div className="inline-block bg-purple-600 text-white px-3 py-1 rounded-full text-sm font-bold mb-3">
                                        ✨ Multi-Select Question
                                    </div>
                                )}
                                <h2 className="text-xl md:text-2xl font-bold text-white leading-tight">
                                    {highlightBrands(currentQuestion.text)}
                                </h2>
                            </div>

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
                                                className={`rounded-xl p-3 text-base font-bold transition-all border-b-4 shadow-xl flex items-center justify-center text-center leading-tight ${selectedAnswers.includes(i)
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
                                        className="w-full py-3 text-base"
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
                                            className="bg-gray-800 rounded-xl p-3 text-base font-bold hover:bg-gray-700 active:scale-95 transition-all border-b-4 border-gray-950 shadow-xl flex items-center justify-center text-center leading-tight"
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

                    {/* Intermediate Leaderboard */}
                    {gameState === 'LEADERBOARD' && (
                        <motion.div
                            key="leaderboard"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="text-center w-full"
                        >
                            {/* Correct Answer Display */}
                            {correctAnswerText && (
                                <div className="mb-6">
                                    <div className="text-lg text-gray-400 mb-2">Correct Answer{currentQuestion?.type === 'multi-select' ? 's' : ''}</div>
                                    {currentQuestion?.type === 'multi-select' ? (
                                        <div className="flex flex-wrap justify-center gap-2 max-w-4xl mx-auto">
                                            {currentQuestion.correctAnswers && currentQuestion.correctAnswers.map((idx) => (
                                                <div key={idx} className="text-base font-bold text-white bg-green-600 py-2 px-4 rounded-lg border border-green-400">
                                                    {currentQuestion.options[idx]}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-2xl font-bold text-green-400 bg-green-900/30 py-3 px-6 rounded-xl inline-block border border-green-500/50">
                                            {correctAnswerText}
                                        </div>
                                    )}
                                </div>
                            )}

                            <h2 className="text-4xl font-bold mb-8">Leaderboard</h2>
                            <LayoutGroup>
                                <div className="space-y-3 max-w-2xl mx-auto">
                                    <AnimatePresence>
                                        {Array.isArray(leaderboard) && leaderboard.map((p, i) => (
                                            <motion.div
                                                layout
                                                key={p.id}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.5 }}
                                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                                className={`p-4 rounded-xl flex justify-between items-center text-lg font-bold shadow-lg ${i === 0 ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-white'}`}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <span className="text-2xl w-10 text-left">{i === 0 ? '👑' : `#${i + 1}`}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-2xl">{p.avatar || '👤'}</span>
                                                        <span className="truncate max-w-[200px] text-left">{p.nickname}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    {p.lastRoundPoints > 0 && (
                                                        <motion.span
                                                            initial={{ opacity: 0, x: -20 }}
                                                            animate={{ opacity: 1, x: 0 }}
                                                            className="text-green-400 text-base"
                                                        >
                                                            +{p.lastRoundPoints}
                                                        </motion.span>
                                                    )}
                                                    <span className="w-24 text-right">{p.score} pts</span>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            </LayoutGroup>
                            <div className="text-lg text-gray-400 animate-pulse mt-6">
                                Next question in 3 seconds...
                            </div>
                        </motion.div>
                    )}

                    {/* Final Podium */}
                    {gameState === 'FINISHED' && (
                        <motion.div
                            key="finished"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-center w-full"
                        >
                            <h1 className="text-5xl font-black mb-12">🏆 Final Results 🏆</h1>
                            <LayoutGroup>
                                <div className="space-y-4 max-w-3xl mx-auto mb-12">
                                    <AnimatePresence>
                                        {Array.isArray(finalLeaderboard) && finalLeaderboard.map((p, i) => (
                                            <motion.div
                                                layout
                                                key={p.id}
                                                initial={{ opacity: 0, scale: 0.8 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                transition={{ delay: i * 0.2, type: "spring" }}
                                                className={`p-6 rounded-2xl flex justify-between items-center text-2xl font-bold shadow-2xl ${i === 0 ? 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-black scale-110' :
                                                    i === 1 ? 'bg-gradient-to-r from-gray-300 to-gray-400 text-black' :
                                                        i === 2 ? 'bg-gradient-to-r from-orange-400 to-orange-600 text-black' :
                                                            'bg-gray-800 text-white'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-6">
                                                    <span className="text-4xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
                                                    <span className="text-3xl">{p.avatar || '👤'}</span>
                                                    <span>{p.nickname}</span>
                                                </div>
                                                <span className="text-3xl font-black">{p.score} pts</span>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            </LayoutGroup>
                            <Button
                                onClick={() => window.location.reload()}
                                className="mt-8 w-full max-w-md py-4 text-lg"
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
