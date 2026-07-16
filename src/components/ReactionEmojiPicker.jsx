import React from 'react';
import { createPortal } from 'react-dom';
import Picker from '@emoji-mart/react';
import emojiData from '@emoji-mart/data';
import { motion } from 'framer-motion';

// Full emoji picker for the "+" button on the message-reaction bar — kept as its
// own lazy chunk (like ChatPicker) so emoji-mart's data doesn't bloat the main bundle.
export default function ReactionEmojiPicker({ onSelect }) {
  const pickerTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  // Portaled to <body> rather than rendered in place: this opens from inside
  // Chat's quick-action overlay, which itself sits inside App.jsx's tab-switch
  // wrapper (`motion.div` with `style={{ x: dragX }}`) — any non-`none`
  // `transform` on an ancestor makes IT the containing block for `position:
  // fixed` descendants instead of the real viewport, so without the portal
  // this was measuring itself against that wrapper's box rather than the
  // true visual viewport. On mobile that box can be shorter than the actual
  // visible screen (the same 100vh-vs-real-viewport gap fixed elsewhere via
  // `.h-app-screen`), which is what was cutting the bottom of the picker off.
  // maxHeight is a second safety net so it's never taller than the real
  // viewport even if something upstream changes again.
  return createPortal(
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 8 }}
      transition={{ type: 'spring', damping: 24, stiffness: 420 }}
      className="fixed z-[60] rounded-2xl border border-border shadow-2xl overflow-hidden"
      style={{
        background: 'hsl(var(--background))',
        width: 320,
        height: 360,
        maxHeight: '70dvh',
        top: '15%',
        // Centered via `left` instead of `transform: translateX(-50%)` —
        // this element also animates `scale`/`y` through Framer Motion's
        // `animate` prop, and Motion manages the `transform` CSS property
        // itself for those; a manual `transform` set alongside it gets
        // silently overwritten every frame, which is what was dropping the
        // horizontal centering and pushing the picker off the right edge.
        left: 'calc(50% - 160px)',
      }}
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
    </motion.div>,
    document.body
  );
}
