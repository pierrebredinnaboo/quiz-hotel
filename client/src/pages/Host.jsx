import React, { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { HomeButton } from '../components/ui/HomeButton';
import { AvatarSelector } from '../components/ui/AvatarSelector';
import { highlightBrands } from '../utils/highlightBrands';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { hotelGroups } from '../data/brandsData';

// Simple Error Boundary Component
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 bg-red-900 text-white">
                    <h1 className="text-2xl font-bold mb-4">Something went wrong.</h1>
                    <pre className="bg-black p-4 rounded overflow-auto">
                        {this.state.error && this.state.error.toString()}
                        <br />
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </pre>
                </div>
            );
        }

        return this.props.children;
    }
}

export default function Host() {
    const { socket, isConnected } = useSocket();

    // Setup state
    const [hasSetup, setHasSetup] = useState(false);
    const [nickname, setNickname] = useState('');
    const [avatar, setAvatar] = useState('🎮');

    // Game state
    const [roomCode, setRoomCode] = useState(null);
    const roomCodeRef = React.useRef(null);

    useEffect(() => {
        roomCodeRef.current = roomCode;
    }, [roomCode]);

    const [players, setPlayers] = useState([]);
    const [gameState, setGameState] = useState('LOBBY'); // LOBBY, QUESTION, LEADERBOARD, FINISHED
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [leaderboard, setLeaderboard] = useState([]);
    const [timeLeft, setTimeLeft] = useState(15);
    const [answeredCount, setAnsweredCount] = useState(0);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [selectedAnswers, setSelectedAnswers] = useState([]); // For multi-select
    const [hasAnswered, setHasAnswered] = useState(false);
    const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);
    const [correctAnswerText, setCorrectAnswerText] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedGroups, setSelectedGroups] = useState(['MARRIOTT']);
    const [questionCount, setQuestionCount] = useState(10);
    const [linkCopied, setLinkCopied] = useState(false);

    // Play leaderboard sound
    useEffect(() => {
        if (gameState === 'LEADERBOARD') {
            const audio = new Audio('/assets/sounds/currentgameleaderboard.mp3');
            audio.volume = 0.10;
            audio.play().catch(e => console.log("Audio play failed:", e));

            // Cleanup function to stop audio if component unmounts or state changes
            return () => {
                audio.pause();
                audio.currentTime = 0;
            };
        }
    }, [gameState]);

    useEffect(() => {
        if (!socket || !hasSetup) return;

        socket.on('player_joined', (player) => {
            setPlayers(prev => [...prev, player]);
        });

        socket.on('lobby_update', ({ players: updatedPlayers }) => {
            // Update the full player list (handles both joins and leaves)
            setPlayers(updatedPlayers);
        });

        socket.on('game_started', () => {
            setGameState('QUESTION');
            setIsGenerating(false);
        });

        socket.on('new_question', ({ question }) => {
            setCurrentQuestion(question);
            setGameState('QUESTION');
            setTimeLeft(question.timeLimit || 12);
            setAnsweredCount(0);
            setSelectedAnswer(null);
            setSelectedAnswers([]); // Reset multi-select
            setHasAnswered(false);
            setCorrectAnswerText('');
            setIsGenerating(false);
        });

        socket.on('player_answered', () => {
            setAnsweredCount(prev => prev + 1);
        });

        socket.on('question_ended', ({ leaderboard, correctAnswerText, correctAnswers }) => {
            setLeaderboard(leaderboard);
            setCorrectAnswerText(correctAnswerText);

            if (correctAnswers) {
                setCurrentQuestion(prev => ({ ...prev, correctAnswers }));
            }

            setGameState('LEADERBOARD');

            // Auto-advance to next question after 5 seconds (increased to give time to read answer)
            setTimeout(() => {
                nextQuestion();
            }, 5000);
        });

        socket.on('game_over', ({ leaderboard }) => {
            setLeaderboard(leaderboard);
            setGameState('FINISHED');
        });

        return () => {
            socket.off('player_joined');
            socket.off('lobby_update');
            socket.off('game_started');
            socket.off('new_question');
            socket.off('player_answered');
            socket.off('question_ended');
            socket.off('game_over');
        };
    }, [socket, hasSetup]);

    // Timer for questions
    useEffect(() => {
        if (gameState === 'QUESTION' && timeLeft > 0) {
            const timer = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        handleTimeUp();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [gameState, timeLeft]);

    const createRoom = () => {
        if (!nickname.trim()) return;

        socket.emit('create_room', { nickname, avatar }, (response) => {
            if (response && response.roomCode) {
                const { roomCode } = response;
                setRoomCode(roomCode);
                // Host is automatically added as a player on the server
                setPlayers([{ nickname, avatar, isHost: true }]);

                // Small delay to ensure state updates propagate before switching view
                setTimeout(() => {
                    setHasSetup(true);
                }, 50);
            }
        });
    };

    const toggleGroup = (groupId) => {
        setSelectedGroups(prev => {
            if (prev.includes(groupId)) {
                // Don't allow deselecting if it's the last one
                if (prev.length === 1) return prev;
                return prev.filter(id => id !== groupId);
            } else {
                return [...prev, groupId];
            }
        });
    };

    const startGame = () => {
        if (players.length === 0) return;
        setIsGenerating(true);
        socket.emit('start_game', { roomCode, selectedGroups, questionCount });
    };

    const copyInviteLink = () => {
        const inviteUrl = `${window.location.origin}/?roomCode=${roomCode}`;
        navigator.clipboard.writeText(inviteUrl)
            .then(() => {
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
            })
            .catch(err => console.error('Failed to copy:', err));
    };

    const submitAnswer = (answer) => {
        if (hasAnswered) return;

        setSelectedAnswer(answer);
        setHasAnswered(true);
        socket.emit('submit_answer', { roomCode, answer });
        // Don't call time_up here - let the server handle it when all players answer or timer ends
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
        if (hasAnswered) return;
        setHasAnswered(true);
        socket.emit('submit_answer', { roomCode, answer: selectedAnswers });
    };

    const handleTimeUp = () => {
        if (!hasAnswered) {
            socket.emit('time_up', { roomCode });
        }
    };

    const nextQuestion = () => {
        if (roomCodeRef.current) {
            socket.emit('next_question', { roomCode: roomCodeRef.current });
        }
    };

    // Setup screen
    if (!hasSetup) {
        return (
            <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4 relative">
                <HomeButton />
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-full max-w-md space-y-6"
                >
                    <h1 className="text-4xl font-black text-center text-marriott mb-8">Host a Game</h1>

                    {!isConnected && (
                        <div className="bg-red-500/20 border border-red-500 text-red-200 p-4 rounded-xl text-center animate-pulse mb-6">
                            🔌 Connecting to server...
                        </div>
                    )}

                    <div className="space-y-6 bg-gray-800 p-8 rounded-3xl border border-gray-700">
                        <div>
                            <label className="block text-gray-400 mb-4 text-lg">Choose your Avatar</label>
                            <AvatarSelector selectedAvatar={avatar} onSelect={setAvatar} />
                        </div>

                        <Input
                            placeholder="Your Nickname"
                            value={nickname}
                            onChange={e => setNickname(e.target.value)}
                            onKeyPress={e => e.key === 'Enter' && createRoom()}
                            className="text-center text-xl py-4"
                            maxLength={15}
                        />
                    </div>

                    <Button
                        onClick={createRoom}
                        disabled={!nickname.trim() || !isConnected}
                        className="w-full text-2xl py-6 rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isConnected ? "Create Room" : "Connecting..."}
                    </Button>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 text-white p-4 flex flex-col overflow-hidden relative">
            <HomeButton />

            {/* Background Elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 opacity-20 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-marriott rounded-full blur-[150px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900 rounded-full blur-[150px]" />
            </div>

            {/* Debug Overlay */}
            <div className="absolute bottom-4 right-4 bg-black/50 p-2 rounded text-xs text-gray-400 pointer-events-none z-50">
                State: {gameState} | Room: {typeof roomCode === 'object' ? 'OBJ' : roomCode} | Setup: {hasSetup ? 'Yes' : 'No'} | Players: {players.length}
            </div>

            <div className="flex-1 flex flex-col max-w-6xl mx-auto w-full z-10 pl-12">
                <AnimatePresence mode="wait">
                    {gameState === 'LOBBY' && roomCode && (
                        <motion.div
                            key="lobby"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex-1 flex flex-col items-center justify-center"
                        >
                            <div className="text-center mb-12">
                                <h1 className="text-6xl font-black mb-4 text-marriott">Room Code</h1>
                                <div className="text-9xl font-black tracking-widest bg-gray-800 px-12 py-8 rounded-3xl border-4 border-marriott shadow-2xl">
                                    {typeof roomCode === 'object' ? JSON.stringify(roomCode) : roomCode}
                                </div>
                                <p className="text-2xl text-gray-400 mt-6">Players can join with this code</p>

                                {/* Copy Invite Link Button */}
                                <div className="mt-6">
                                    <Button
                                        onClick={copyInviteLink}
                                        className="px-8 py-3 text-lg rounded-xl bg-blue-600 hover:bg-blue-700 transition-colors shadow-lg"
                                    >
                                        {linkCopied ? (
                                            <span className="flex items-center gap-2">
                                                ✓ Link Copied!
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-2">
                                                📋 Copy Invite Link
                                            </span>
                                        )}
                                    </Button>
                                </div>
                            </div>

                            <div className="w-full max-w-4xl">
                                <h2 className="text-3xl font-bold mb-6 text-center">
                                    Players ({players.length})
                                </h2>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
                                    {players.map((p, i) => p ? (
                                        <motion.div
                                            key={i}
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            className="bg-gray-800 px-6 py-4 rounded-2xl text-xl font-bold shadow-lg border border-gray-700 flex flex-col items-center gap-2 relative"
                                        >
                                            {p.isHost && (
                                                <div className="absolute top-2 right-2 text-yellow-500 text-sm">👑</div>
                                            )}
                                            <span className="text-4xl">{p.avatar || '👤'}</span>
                                            <span className="text-center truncate w-full">{p.nickname}</span>
                                        </motion.div>
                                    ) : null)}
                                </div>
                            </div>

                            {/* Hotel Group Selection */}
                            <div className="w-full max-w-5xl mb-8">
                                <h2 className="text-3xl font-bold mb-4 text-center">Select Hotel Groups</h2>
                                <p className="text-gray-400 text-center mb-6">Choose which hotel groups to include in the quiz</p>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                    {Object.keys(hotelGroups).map((groupId) => {
                                        const group = hotelGroups[groupId];
                                        const isSelected = selectedGroups.includes(groupId);
                                        return (
                                            <motion.button
                                                key={groupId}
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                onClick={() => toggleGroup(groupId)}
                                                className={`p-4 rounded-xl text-sm font-bold transition-all ${isSelected
                                                    ? 'bg-marriott border-2 border-marriott text-white shadow-lg shadow-marriott/30'
                                                    : 'bg-gray-800 border-2 border-gray-700 text-gray-300 hover:border-gray-500'
                                                    }`}
                                            >
                                                <div className="text-xs opacity-75 mb-1">{group.name}</div>
                                                <div className="font-black">{groupId.replace(/_/g, ' ')}</div>
                                                <div className="text-xs mt-1 opacity-60">{group.brands.length} brands</div>
                                            </motion.button>
                                        );
                                    })}
                                </div>
                                <div className="text-center mt-4 text-sm text-gray-400">
                                    {selectedGroups.length} group{selectedGroups.length > 1 ? 's' : ''} selected
                                </div>
                            </div>

                            {/* Question Count Selection */}
                            <div className="w-full max-w-5xl mb-8">
                                <h2 className="text-3xl font-bold mb-4 text-center">Number of Questions</h2>
                                <div className="flex flex-col items-center gap-4">
                                    <div className="text-4xl font-black text-marriott bg-gray-800 px-8 py-4 rounded-2xl border-2 border-marriott shadow-lg">
                                        {questionCount}
                                    </div>
                                    <input
                                        type="range"
                                        min="5"
                                        max="25"
                                        step="1"
                                        value={questionCount}
                                        onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                                        className="w-full max-w-md h-4 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-marriott"
                                    />
                                    <div className="flex justify-between w-full max-w-md text-gray-400 text-sm">
                                        <span>5</span>
                                        <span>25</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4 justify-center">
                                <Button
                                    onClick={startGame}
                                    disabled={players.length === 0 || isGenerating}
                                    className="px-12 py-6 text-2xl rounded-2xl shadow-xl hover:scale-105 transition-transform"
                                >
                                    {isGenerating ? (
                                        <span className="flex items-center gap-3">
                                            <span className="animate-spin text-3xl">⚙️</span>
                                            Chargement en cours...
                                        </span>
                                    ) : (
                                        "Start Quiz"
                                    )}
                                </Button>
                            </div>
                        </motion.div>
                    )}

                    {gameState === 'QUESTION' && currentQuestion && (
                        <motion.div
                            key="question"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.1 }}
                            className="w-full flex-1 flex flex-col justify-center"
                        >
                            <div className="flex justify-between items-center mb-12">
                                <div className="text-3xl font-bold text-gray-400">Question {currentQuestion.index + 1}/{currentQuestion.total}</div>
                                <div className="text-6xl font-black font-mono bg-gray-800 px-6 py-2 rounded-xl border-2 border-gray-700">
                                    {timeLeft}s
                                </div>
                            </div>

                            <div className="text-5xl font-bold mb-8 text-center leading-tight">
                                {highlightBrands(currentQuestion.text)}
                            </div>

                            {currentQuestion.type === 'multi-select' && (
                                <div className="flex justify-center mb-8">
                                    <span className="bg-blue-600 text-white px-6 py-2 rounded-full text-xl font-bold animate-pulse shadow-lg border-2 border-blue-400">
                                        ✨ Multi-Select Question
                                    </span>
                                </div>
                            )}

                            {currentQuestion.type === 'multi-select' ? (
                                // Multi-select UI for Host
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-6">
                                        {currentQuestion.options.map((opt, i) => (
                                            <motion.button
                                                key={i}
                                                onClick={() => {
                                                    if (!hasAnswered) {
                                                        toggleAnswer(i);
                                                    }
                                                }}
                                                disabled={hasAnswered}
                                                whileHover={!hasAnswered ? { scale: 1.02 } : {}}
                                                whileTap={!hasAnswered ? { scale: 0.98 } : {}}
                                                className={`p-8 rounded-2xl text-3xl font-bold border-2 flex items-center shadow-lg transition-all ${selectedAnswers.includes(i)
                                                    ? 'bg-marriott border-marriott text-white'
                                                    : 'bg-gray-800 border-gray-700 hover:border-marriott hover:bg-gray-700 cursor-pointer'
                                                    } ${hasAnswered ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                                <span className={`w-12 h-12 rounded-full flex items-center justify-center mr-6 text-2xl shrink-0 ${selectedAnswers.includes(i) ? 'bg-white text-marriott' : 'bg-gray-700 text-gray-400'
                                                    }`}>
                                                    {String.fromCharCode(65 + i)}
                                                </span>
                                                {opt}
                                            </motion.button>
                                        ))}
                                    </div>
                                    {!hasAnswered && (
                                        <div className="flex justify-center">
                                            <Button
                                                onClick={submitMultiSelect}
                                                disabled={selectedAnswers.length === 0}
                                                className="px-12 py-6 text-2xl rounded-2xl shadow-xl"
                                            >
                                                Submit Answers ({selectedAnswers.length})
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                // Standard UI for Host
                                <div className="grid grid-cols-2 gap-6">
                                    {currentQuestion.options.map((opt, i) => (
                                        <motion.button
                                            key={i}
                                            onClick={() => submitAnswer(i)}
                                            disabled={hasAnswered}
                                            whileHover={!hasAnswered ? { scale: 1.02 } : {}}
                                            whileTap={!hasAnswered ? { scale: 0.98 } : {}}
                                            className={`p-8 rounded-2xl text-3xl font-bold border-2 flex items-center shadow-lg transition-all ${hasAnswered && selectedAnswer === i
                                                ? 'bg-marriott border-marriott text-white'
                                                : hasAnswered
                                                    ? 'bg-gray-800 border-gray-700 opacity-50 cursor-not-allowed'
                                                    : 'bg-gray-800 border-gray-700 hover:border-marriott hover:bg-gray-700 cursor-pointer'
                                                }`}
                                        >
                                            <span className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center mr-6 text-2xl text-gray-400">
                                                {String.fromCharCode(65 + i)}
                                            </span>
                                            {opt}
                                        </motion.button>
                                    ))}
                                </div>
                            )}

                            <div className="mt-8 text-center text-2xl text-gray-400">
                                {answeredCount} / {players.length} Answered
                            </div>
                        </motion.div>
                    )}

                    {gameState === 'LEADERBOARD' && (
                        <motion.div
                            key="leaderboard"
                            initial={{ opacity: 0, x: 100 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -100 }}
                            className="text-center flex-1 flex flex-col justify-center"
                        >
                            {correctAnswerText && (
                                <div className="mb-8">
                                    <div className="text-2xl text-gray-400 mb-2">Correct Answer{currentQuestion?.type === 'multi-select' ? 's' : ''}</div>
                                    {currentQuestion?.type === 'multi-select' ? (
                                        <div className="flex flex-wrap justify-center gap-3 max-w-4xl mx-auto">
                                            {currentQuestion.correctAnswers.map((idx) => (
                                                <div key={idx} className="text-3xl font-bold text-white bg-green-600 py-3 px-6 rounded-xl border border-green-400 shadow-lg">
                                                    {currentQuestion.options[idx]}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-4xl font-bold text-green-400 bg-green-900/30 py-4 px-8 rounded-xl inline-block border border-green-500/50">
                                            {correctAnswerText}
                                        </div>
                                    )}
                                </div>
                            )}
                            <h2 className="text-6xl font-bold mb-12">Leaderboard</h2>
                            <LayoutGroup>
                                <div className="space-y-4 max-w-4xl mx-auto mb-12 w-full px-8">
                                    <AnimatePresence>
                                        {leaderboard.map((p, i) => (
                                            <motion.div
                                                layout
                                                key={p.id}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.5 }}
                                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                                className={`p-6 rounded-2xl flex justify-between items-center text-3xl font-bold shadow-lg ${i === 0 ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-white'}`}
                                            >
                                                <div className="flex items-center gap-8">
                                                    <span className="text-4xl w-16 text-left">{i === 0 ? '👑' : `#${i + 1}`}</span>
                                                    <div className="flex items-center gap-4">
                                                        <span className="text-4xl">{p.avatar || '👤'}</span>
                                                        <span className="truncate max-w-[300px] text-left">{p.nickname}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-8">
                                                    {p.lastRoundPoints > 0 && (
                                                        <motion.span
                                                            initial={{ opacity: 0, x: -20 }}
                                                            animate={{ opacity: 1, x: 0 }}
                                                            className="text-green-400 text-2xl"
                                                        >
                                                            +{p.lastRoundPoints}
                                                        </motion.span>
                                                    )}
                                                    <span className="w-32 text-right">{p.score} pts</span>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            </LayoutGroup>
                            <div className="text-2xl text-gray-400 animate-pulse">
                                Next question in 3 seconds...
                            </div>
                        </motion.div>
                    )}

                    {gameState === 'FINISHED' && (
                        <motion.div
                            key="finished"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-center flex-1 flex flex-col justify-center relative z-10"
                            onAnimationComplete={() => {
                                // Play drumroll sound
                                const audio = new Audio('/assets/sounds/drumroll.mp3');
                                audio.volume = 0.5;
                                audio.play().catch(e => console.log("Audio play failed (user interaction needed?):", e));
                            }}
                        >
                            <h1 className="text-5xl font-black mb-4 text-marriott drop-shadow-lg mt-8">Final Results</h1>

                            {!showFullLeaderboard ? (
                                <>
                                    {/* Animated Podium with Shake */}
                                    <motion.div
                                        className="flex items-end justify-center gap-4 mb-8 h-[400px] pt-12"
                                        animate={{ x: [-5, 5, -5, 5, 0] }}
                                        transition={{ duration: 0.5, delay: 0.2 }}
                                    >
                                        {/* 2nd Place */}
                                        {leaderboard[1] && (
                                            <motion.div
                                                initial={{ y: 200, opacity: 0 }}
                                                animate={{ y: 0, opacity: 1 }}
                                                transition={{ delay: 2, type: 'spring', damping: 12 }}
                                                className="flex flex-col items-center z-10"
                                            >
                                                <motion.div
                                                    animate={{ y: [0, -10, 0] }}
                                                    transition={{ repeat: Infinity, duration: 2, delay: 1 }}
                                                    className="text-4xl mb-2"
                                                >
                                                    {leaderboard[1].avatar || '👤'}
                                                </motion.div>
                                                <div className="text-xl font-bold mb-1">{leaderboard[1].nickname}</div>
                                                <div className="text-lg text-gray-400 mb-2">{leaderboard[1].score} pts</div>
                                                <div className="w-32 h-48 bg-gradient-to-t from-gray-600 to-gray-500 rounded-t-2xl flex items-center justify-center text-4xl border-4 border-gray-400 shadow-xl">
                                                    🥈
                                                </div>
                                            </motion.div>
                                        )}

                                        {/* 1st Place */}
                                        {leaderboard[0] && (
                                            <motion.div
                                                initial={{ y: 200, opacity: 0 }}
                                                animate={{ y: 0, opacity: 1 }}
                                                transition={{ delay: 4, type: 'spring', damping: 12 }}
                                                className="flex flex-col items-center z-20 -mx-2 mb-4"
                                            >
                                                <motion.div
                                                    animate={{
                                                        y: [0, -15, 0],
                                                        rotate: [0, 5, -5, 0]
                                                    }}
                                                    transition={{ repeat: Infinity, duration: 2, delay: 1.5 }}
                                                    className="text-6xl mb-4 relative"
                                                >
                                                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-4xl animate-bounce">👑</span>
                                                    {leaderboard[0].avatar || '👤'}
                                                </motion.div>
                                                <div className="text-2xl font-black mb-1 text-yellow-300">{leaderboard[0].nickname}</div>
                                                <div className="text-xl text-white font-bold mb-4 bg-marriott px-4 py-1 rounded-full shadow-lg">{leaderboard[0].score} pts</div>
                                                <div className="w-40 h-64 bg-gradient-to-t from-yellow-600 to-yellow-400 rounded-t-2xl flex items-center justify-center text-6xl border-4 border-yellow-300 shadow-2xl relative overflow-hidden">
                                                    <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                                                    🏆
                                                </div>
                                            </motion.div>
                                        )}

                                        {/* 3rd Place */}
                                        {leaderboard[2] && (
                                            <motion.div
                                                initial={{ y: 200, opacity: 0 }}
                                                animate={{ y: 0, opacity: 1 }}
                                                transition={{ delay: 0.5, type: 'spring', damping: 12 }}
                                                className="flex flex-col items-center z-0"
                                            >
                                                <motion.div
                                                    animate={{ y: [0, -8, 0] }}
                                                    transition={{ repeat: Infinity, duration: 2, delay: 0.5 }}
                                                    className="text-3xl mb-2"
                                                >
                                                    {leaderboard[2].avatar || '👤'}
                                                </motion.div>
                                                <div className="text-lg font-bold mb-1">{leaderboard[2].nickname}</div>
                                                <div className="text-base text-gray-400 mb-2">{leaderboard[2].score} pts</div>
                                                <div className="w-32 h-32 bg-gradient-to-t from-orange-800 to-orange-600 rounded-t-2xl flex items-center justify-center text-3xl border-4 border-orange-500 shadow-xl">
                                                    🥉
                                                </div>
                                            </motion.div>
                                        )}
                                    </motion.div>

                                    <div className="flex gap-4 justify-center mb-8">
                                        <Button
                                            onClick={() => setShowFullLeaderboard(true)}
                                            className="text-lg px-6 py-3 bg-gray-700 hover:bg-gray-600"
                                        >
                                            View Full Leaderboard
                                        </Button>
                                        <Button
                                            onClick={() => window.location.reload()}
                                            className="text-lg px-6 py-3"
                                            variant="outline"
                                        >
                                            New Game
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="max-w-4xl mx-auto w-full h-[600px] overflow-y-auto pr-4 custom-scrollbar"
                                >
                                    <div className="space-y-3">
                                        {leaderboard.map((p, i) => (
                                            <div key={i} className={`flex justify-between items-center p-4 rounded-xl ${i < 3 ? 'bg-marriott/20 border border-marriott' : 'bg-gray-800'}`}>
                                                <div className="flex items-center gap-4">
                                                    <span className="font-bold w-8 text-gray-500 text-2xl">#{i + 1}</span>
                                                    <span className="text-3xl">{p.avatar || '👤'}</span>
                                                    <span className="font-bold text-2xl">{p.nickname}</span>
                                                </div>
                                                <span className="font-mono font-bold text-2xl">{p.score} pts</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-8 flex justify-center">
                                        <Button
                                            onClick={() => setShowFullLeaderboard(false)}
                                            className="text-xl px-8 py-4"
                                        >
                                            Back to Podium
                                        </Button>
                                    </div>
                                </motion.div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div >
    );
}
