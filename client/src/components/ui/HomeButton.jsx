import React from 'react';
import { Button } from './Button';

export const HomeButton = ({ className = "" }) => {
    return (
        <Button
            variant="ghost"
            onClick={() => window.location.href = '/'}
            className={`absolute top-4 left-4 z-50 text-gray-400 hover:text-white p-2 rounded-full hover:bg-gray-800 transition-all ${className}`}
            title="Back to Home"
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
        </Button>
    );
};
