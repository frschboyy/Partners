import React from 'react';
import Picker from '@emoji-mart/react';
import emojiData from '@emoji-mart/data';
import { motion } from 'framer-motion';

// Full emoji picker for the "+" button on the message-reaction bar — kept as its
// own lazy chunk (like ChatPicker) so emoji-mart's data doesn't bloat the main bundle.
export default function ReactionEmojiPicker({ onSelect }) {
  const pickerTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 8 }}
      transition={{ type: 'spring', damping: 24, stiffness: 420 }}
      className="fixed z-[60] rounded-2xl border border-border shadow-2xl overflow-hidden"
      style={{ background: 'hsl(var(--background))', width: 320, height: 360, top: '18%', left: '50%', transform: 'translateX(-50%)' }}
      onClick={e => e.stopPropagation()}
    >
      <Picker
        data={emojiData}
        onEmojiSelect={e => onSelect(e.native)}
        theme={pickerTheme}
        set="native"
        previewPosition="none"
        skinTonePosition="none"
        navPosition="bottom"
        perLine={8}
        emojiSize={20}
        emojiButtonSize={30}
        maxFrequentRows={1}
        style={{ width: '100%', height: '100%', border: 'none' }}
      />
    </motion.div>
  );
}
