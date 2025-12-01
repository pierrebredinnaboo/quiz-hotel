import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function Input({ className, ...props }) {
    return (
        <input
            className={twMerge(
                "w-full px-4 py-3 rounded-xl bg-gray-800 border-2 border-gray-700 text-white placeholder-gray-500 focus:border-marriott focus:outline-none transition-colors",
                className
            )}
            {...props}
        />
    );
}
