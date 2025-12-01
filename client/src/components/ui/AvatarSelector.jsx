import React from 'react';
import { motion } from 'framer-motion';

const AVATARS = ['🐼', '🦊', '🦁', '🐯', '🐸', '🐙', '🦄', '🐲', '👽', '🤖', '👻', '🐱', '🐶', '🐹', '🐰', '🐨'];

export const AvatarSelector = ({ selectedAvatar, onSelect }) => {
    return (
        <div className="grid grid-cols-4 gap-4 p-4 bg-gray-800 rounded-2xl border-2 border-gray-700">
            {AVATARS.map((avatar) => (
                <motion.button
                    key={avatar}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => onSelect(avatar)}
                    className={`text-4xl p-2 rounded-xl transition-colors ${selectedAvatar === avatar ? 'bg-marriott shadow-lg scale-110' : 'hover:bg-gray-700'}`}
                >
                    {avatar}
                </motion.button>
            ))}
        </div>
    );
};
