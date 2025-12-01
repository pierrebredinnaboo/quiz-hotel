import { useCallback } from 'react';

export const useSound = () => {
    const playClick = useCallback(() => {
        const audio = new Audio('/assets/sounds/clickanswer.mp3');
        audio.volume = 0.5;
        audio.play().catch(e => console.log("Audio play failed:", e));
    }, []);

    return { playClick };
};
