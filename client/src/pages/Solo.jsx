import React, { useEffect, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { Button } from '../components/ui/Button';
import { HomeButton } from '../components/ui/HomeButton';
import { motion, AnimatePresence } from 'framer-motion';
import { AvatarSelector } from '../components/ui/AvatarSelector';
import { useSound } from '../hooks/useSound';
import { hotelGroups } from '../data/brandsData';

export default function Solo() {
    const { socket } = useSocket();
    const { playClick } = useSound();
    const [roomCode, setRoomCode] = useState(null);
    const [gameState, setGameState] = useState('INIT'); // INIT, SETUP, QUESTION, RESULT, FINISHED
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [timeLeft, setTimeLeft] = useState(15);
    const [nickname, setNickname] = useState(localStorage.getItem('solo_nickname') || '');
    const [avatar, setAvatar] = useState(localStorage.getItem('solo_avatar') || '🐼');
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [dailyLeaderboard, setDailyLeaderboard] = useState([]);
    const [score, setScore] = useState(0);
    const [lastResult, setLastResult] = useState(null);
    const [streak, setStreak] = useState(0);
    const [hasAnswered, setHasAnswered] = useState(false);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [selectedAnswers, setSelectedAnswers] = useState([]); // For multi-select
    const [selectedGroups, setSelectedGroups] = useState(['MARRIOTT']);
    const [questionCount, setQuestionCount] = useState(10);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!socket) return;

        // 1. Create Room for Solo Mode
        socket.emit('create_room', ({ roomCode }) => {
            setRoomCode(roomCode);
            // Show setup screen instead of auto-starting
            setGameState('SETUP');
        });

        socket.on('new_question', ({ question }) => {
            setCurrentQuestion(question);
            setGameState('QUESTION');
            setTimeLeft(question.timeLimit);
            setLastResult(null);
            setHasAnswered(false);
            setSelectedAnswer(null);
            setSelectedAnswers([]); // Reset multi-select
            setIsLoading(false);
        });

        socket.on('question_result', (result) => {
            setLastResult(result);
            setScore(result.score);
            setStreak(result.streak);
            setGameState('RESULT');
        });

        socket.on('game_over', () => {
            setGameState('FINISHED');
        });

        socket.on('solo_score_submitted', (data) => {
            // This event could be used for confirmation, but we handle state locally
        });

        socket.on('daily_leaderboard', (data) => {
            setDailyLeaderboard(data);
        });

        return () => {
            socket.off('new_question');
            socket.off('question_result');
            socket.off('game_over');
            socket.off('solo_score_submitted');
            socket.off('daily_leaderboard');
        };
    }, [socket]);

    // Timer Logic (Host side logic running in client)
    useEffect(() => {
        if (gameState === 'QUESTION' && timeLeft > 0) {
            const timer = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        socket.emit('time_up', { roomCode });
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timer);
        }
    }, [gameState, timeLeft, roomCode, socket]);

    const submitAnswer = (i) => {
        if (hasAnswered) return;
        setHasAnswered(true);
        setSelectedAnswer(i);

        if (!socket || !socket.connected) {
            console.error('Socket not connected');
            alert('Connection error. Please refresh the page.');
            return;
        }

        socket.emit('submit_answer', { roomCode, answer: i });
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

        if (!socket || !socket.connected) {
            console.error('Socket not connected');
            alert('Connection error. Please refresh the page.');
            return;
        }

        socket.emit('submit_answer', { roomCode, answer: selectedAnswers });
    };

    const toggleGroup = (groupId) => {
        setSelectedGroups(prev => {
            if (prev.includes(groupId)) {
                if (prev.length === 1) return prev;
                return prev.filter(id => id !== groupId);
            } else {
                return [...prev, groupId];
            }
        });
    };

    const startGame = () => {
        if (!roomCode) return;
        setIsLoading(true);
        socket.emit('start_game', { roomCode, selectedGroups, questionCount });
    };

    const nextQuestion = () => {
        socket.emit('next_question', { roomCode });
    };

    const submitScore = () => {
        if (!nickname.trim()) {
            console.log('Nickname is empty, cannot submit');
            return;
        }

        console.log('Submitting score:', { nickname, score, avatar, socket: socket?.connected });

        if (!socket || !socket.connected) {
            console.error('Socket not connected');
            alert('Connection error. Please refresh the page.');
            return;
        }

        localStorage.setItem('solo_nickname', nickname);
        localStorage.setItem('solo_avatar', avatar);

        socket.emit('submit_solo_score', { nickname, score, avatar }, (response) => {
            console.log('Score submitted response:', response);
            if (response && response.success) {
                setIsSubmitted(true);
                // Fetch daily leaderboard
                socket.emit('get_daily_leaderboard', (data) => {
                    console.log('Daily leaderboard received:', data);
                    setDailyLeaderboard(data);
                });
            } else {
                console.error('Failed to submit score:', response);
                alert('Failed to submit score. Please try again.');
            }
        });
    };

    // Setup screen for group selection
    if (gameState === 'SETUP') {
        return (
            <div className="min-h-screen bg-gray-900 text-white p-4 flex flex-col items-center justify-center relative">
                <HomeButton />
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 opacity-20 pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-marriott rounded-full blur-[150px]" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900 rounded-full blur-[150px]" />
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-5xl"
                >
                    <h1 className="text-5xl font-black text-center mb-4 text-marriott">Solo Mode</h1>
                    <p className="text-center text-gray-400 mb-12 text-xl">Select hotel groups to practice</p>

                    {/* Hotel Group Selection */}
                    <div className="bg-gray-800/50 p-8 rounded-3xl border border-gray-700 mb-8">
                        <h2 className="text-3xl font-bold mb-6 text-center">Select Hotel Groups</h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
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
                        <div className="text-center mt-4 text-sm text-gray-400 mb-8">
                            {selectedGroups.length} group{selectedGroups.length > 1 ? 's' : ''} selected
                        </div>

                        {/* Question Count Selection */}
                        <div className="w-full mb-8">
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

                        <div className="flex justify-center">
                            <Button
                                onClick={startGame}
                                disabled={isLoading}
                                className="px-12 py-6 text-2xl rounded-2xl shadow-xl hover:scale-105 transition-transform"
                            >
                                {isLoading ? (
                                    <span className="flex items-center gap-3">
                                        <span className="animate-spin text-3xl">⚙️</span>
                                        Generating Quiz...
                                    </span>
                                ) : (
                                    "Start Quiz"
                                )}
                            </Button>
                        </div>
                    </div>
                </motion.div>
            </div>
        );
    }

    if (!currentQuestion && gameState !== 'FINISHED') {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white relative">
                <HomeButton />
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 opacity-20 pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-marriott rounded-full blur-[150px]" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900 rounded-full blur-[150px]" />
                </div>
                <div className="flex flex-col items-center gap-4">
                    <span className="animate-spin text-6xl">⚙️</span>
                    <div className="text-2xl">Chargement en cours...</div>
                </div>
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

            <div className="flex justify-between items-center mb-6 z-10 pl-12 relative">
                <div className="font-bold text-xl">Solo Mode</div>
                <div className="flex gap-4">
                    <div className="bg-gray-800 px-4 py-2 rounded-full text-lg font-bold border border-gray-700">
                        Time: {timeLeft}s
                    </div>
                    <div className="bg-marriott px-4 py-2 rounded-full text-lg font-bold shadow-lg">
                        {score} pts
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col justify-center max-w-4xl mx-auto w-full z-10">
                <AnimatePresence mode="wait">
                    {gameState === 'QUESTION' && currentQuestion && (
                        <motion.div
                            key="question"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="w-full"
                        >
                            <div className="text-center mb-8 text-gray-400 text-xl">
                                Question {currentQuestion.index + 1}/{currentQuestion.total}
                            </div>
                            <div className="text-3xl md:text-5xl font-bold mb-12 text-center leading-tight">
                                {currentQuestion.text.split(/(\*\*.*?\*\*)/).map((part, index) =>
                                    part.startsWith('**') && part.endsWith('**') ? (
                                        <span key={index} className="text-marriott">{part.slice(2, -2)}</span>
                                    ) : (
                                        part
                                    )
                                )}
                            </div>

                            {currentQuestion.type === 'multi-select' ? (
                                // Multi-select UI
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {currentQuestion.options.map((opt, i) => (
                                            <motion.button
                                                key={i}
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={() => {
                                                    if (!hasAnswered) {
                                                        playClick();
                                                        toggleAnswer(i);
                                                    }
                                                }}
                                                disabled={hasAnswered}
                                                className={`p-6 rounded-2xl text-xl md:text-2xl font-bold border-2 transition-all shadow-lg text-left flex items-center ${selectedAnswers.includes(i)
                                                    ? 'bg-marriott border-marriott text-white'
                                                    : 'bg-gray-800 border-gray-700 hover:border-marriott hover:bg-gray-750'
                                                    } ${hasAnswered ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                                <span className={`w-10 h-10 rounded-full flex items-center justify-center mr-4 text-lg shrink-0 ${selectedAnswers.includes(i) ? 'bg-white text-marriott' : 'bg-gray-700 text-gray-400'
                                                    }`}>
                                                    {String.fromCharCode(65 + i)}
                                                </span>
                                                {opt}
                                            </motion.button>
                                        ))}
                                    </div>
                                    {!hasAnswered && (
                                        <Button
                                            onClick={() => {
                                                playClick();
                                                submitMultiSelect();
                                            }}
                                            disabled={selectedAnswers.length === 0}
                                            className="w-full text-2xl py-4"
                                        >
                                            Submit ({selectedAnswers.length} selected)
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                // Standard single-select UI
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {currentQuestion.options.map((opt, i) => (
                                        <motion.button
                                            key={i}
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => {
                                                playClick();
                                                submitAnswer(i);
                                            }}
                                            className="bg-gray-800 p-6 rounded-2xl text-xl md:text-2xl font-bold border-2 border-gray-700 hover:border-marriott hover:bg-gray-750 transition-all shadow-lg text-left flex items-center"
                                        >
                                            <span className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center mr-4 text-lg text-gray-400 shrink-0">
                                                {String.fromCharCode(65 + i)}
                                            </span>
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
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="text-center"
                        >
                            <div className={`inline-block p-12 rounded-3xl shadow-2xl mb-8 ${lastResult.correct ? 'bg-green-600' : 'bg-red-600'}`}>
                                <h2 className="text-6xl font-black mb-4">{lastResult.correct ? "Correct!" : "Wrong!"}</h2>
                                <div className="text-4xl font-bold mb-2">+{lastResult.points} pts</div>
                                {lastResult.type === 'multi-select' && (
                                    <div className="text-2xl font-bold opacity-90">
                                        {lastResult.correctCount}/{lastResult.totalCorrect} correct selections
                                    </div>
                                )}
                            </div>

                            {lastResult.streak > 2 && (
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="mb-8 text-yellow-300 font-black text-3xl flex items-center justify-center gap-2"
                                >
                                    🔥 Streak: {lastResult.streak}
                                </motion.div>
                            )}

                            <div className="mb-12 text-2xl text-gray-300">
                                {lastResult.type === 'multi-select' ? (
                                    <div className="flex flex-col gap-2">
                                        <span className="mb-2">Correct Answers:</span>
                                        <div className="flex flex-wrap justify-center gap-2">
                                            {lastResult.correctAnswers && currentQuestion && lastResult.correctAnswers.map((idx) => (
                                                <span key={idx} className="bg-marriott px-4 py-2 rounded-lg font-bold text-white text-lg">
                                                    {currentQuestion.options[idx]}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        Correct Answer: <span className="font-bold text-white">{lastResult.correctAnswer}</span>
                                    </>
                                )}
                            </div>

                            <Button
                                onClick={nextQuestion}
                                className="text-2xl px-12 py-4 rounded-full"
                            >
                                Next Question
                            </Button>
                        </motion.div>
                    )}

                    {gameState === 'FINISHED' && (
                        <motion.div
                            key="finished"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-center w-full max-w-2xl mx-auto"
                        >
                            <h1 className="text-6xl font-black mb-8 text-marriott">Game Over</h1>
                            <div className="text-4xl font-bold mb-12">Final Score: {score}</div>

                            {!isSubmitted ? (
                                <div className="bg-gray-800 p-8 rounded-3xl shadow-2xl border border-gray-700">
                                    <h3 className="text-2xl font-bold mb-6">Save your score to the Daily Leaderboard</h3>

                                    <div className="mb-8">
                                        <label className="block text-gray-400 mb-4 text-lg">Choose your Avatar</label>
                                        <AvatarSelector selectedAvatar={avatar} onSelect={setAvatar} />
                                    </div>

                                    <div className="flex gap-4">
                                        <input
                                            type="text"
                                            value={nickname}
                                            onChange={(e) => setNickname(e.target.value)}
                                            placeholder="Enter Nickname"
                                            className="flex-1 bg-gray-900 border-2 border-gray-600 rounded-xl px-6 py-4 text-xl focus:border-marriott outline-none transition-colors"
                                            maxLength={15}
                                        />
                                        <Button
                                            onClick={submitScore}
                                            disabled={!nickname.trim()}
                                            className="px-8 py-4 text-xl"
                                        >
                                            Submit
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-8">
                                    <div className="bg-gray-800 p-8 rounded-3xl shadow-2xl border border-gray-700">
                                        <h3 className="text-2xl font-bold mb-6 text-yellow-500">🏆 Today's Top Scores</h3>
                                        <div className="space-y-3">
                                            {dailyLeaderboard.length === 0 ? (
                                                <div className="text-gray-400">You are the first today!</div>
                                            ) : (
                                                dailyLeaderboard.map((s, i) => (
                                                    <div key={i} className={`flex justify - between items - center p - 3 rounded - xl ${s.nickname === nickname && s.score === score ? 'bg-marriott/20 border border-marriott' : 'bg-gray-900'} `}>
                                                        <div className="flex items-center gap-4">
                                                            <span className="font-bold w-6 text-gray-500">#{i + 1}</span>
                                                            <span className="text-2xl">{s.avatar || '👤'}</span>
                                                            <span className="font-bold">{s.nickname}</span>
                                                        </div>
                                                        <span className="font-mono font-bold">{s.score}</span>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>

                                    <Button
                                        onClick={() => window.location.reload()}
                                        className="text-2xl px-12 py-4 w-full"
                                        variant="outline"
                                    >
                                        Play Again
                                    </Button>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
