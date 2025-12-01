import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useSound } from '../../hooks/useSound';

export function Button({ className, variant = 'primary', onClick, ...props }) {
    const { playClick } = useSound();

    const handleClick = (e) => {
        playClick();
        if (onClick) {
            onClick(e);
        }
    };

    const baseStyles = "px-6 py-3 rounded-xl font-bold transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";

    const variants = {
        primary: "bg-marriott text-white hover:bg-red-700 shadow-lg shadow-red-900/20",
        secondary: "bg-gray-800 text-white hover:bg-gray-700",
        outline: "border-2 border-marriott text-marriott hover:bg-marriott/10",
        ghost: "text-gray-400 hover:text-white"
    };

    return (
        <button
            className={twMerge(baseStyles, variants[variant], className)}
            onClick={handleClick}
            {...props}
        />
    );
}
