import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { AdminButton } from '../components/ui/AdminButton';

export default function Home() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4 relative">
            <AdminButton />

            {/* Background Elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 opacity-20 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-marriott rounded-full blur-[150px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-900 rounded-full blur-[150px]" />
            </div>

            <div className="text-center">
                <h1 className="text-6xl font-black mb-4 text-marriott">Naboo Quiz</h1>
                <p className="text-xl text-gray-400 mb-12">Test your brand knowledge</p>

                <div className="flex flex-col sm:flex-row gap-6 w-full max-w-2xl">
                    <Button
                        onClick={() => navigate('/host')}
                        className="flex-1 py-8 text-xl"
                    >
                        Host Game
                    </Button>

                    <Button
                        variant="outline"
                        onClick={() => navigate('/play')}
                        className="flex-1 py-8 text-xl"
                    >
                        Join Game
                    </Button>

                    <Button
                        variant="secondary"
                        onClick={() => navigate('/solo')}
                        className="flex-1 py-8 text-xl"
                    >
                        Solo Mode
                    </Button>
                </div>

                <Button
                    variant="ghost"
                    onClick={() => navigate('/leaderboard')}
                    className="mt-8 text-gray-400 hover:text-white"
                >
                    View Global Leaderboard
                </Button>
            </div>
        </div>
    );
}
