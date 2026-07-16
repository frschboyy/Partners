import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// anchor: a getBoundingClientRect()-shaped rect for the stat card that
// triggered the guard, so it appears right next to the edit instead of a
// fixed screen corner. Falls back to bottom-right if not provided.
export default function CheatGuard({ visible, anchor, onDone }) {
  // Read via ref rather than depending on onDone directly: Home re-renders
  // every second (the live streak timer), which recreates the inline
  // `onDone` callback each time — with `onDone` in the effect's dependency
  // array, the effect re-ran on every one of those renders, clearing and
  // restarting the dismiss timer before it ever reached 3.4s, so the guard
  // used to never actually go away on its own.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => onDoneRef.current?.(), 3400);
    return () => clearTimeout(t);
  }, [visible]);

  const positionStyle = anchor
    ? { position: 'fixed', top: anchor.bottom + 8, left: anchor.left, zIndex: 100 }
    : { position: 'fixed', bottom: 80, right: 0, zIndex: 100 };

  return (
    <AnimatePresence>
      {visible && (
        <div className="flex flex-col items-end pointer-events-none select-none" style={positionStyle}>
          {/* Speech bubble pops in after the character arrives */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ delay: 0.45, type: 'spring', damping: 14, stiffness: 200 }}
            className="mr-6 mb-1 bg-card border-2 border-border rounded-2xl px-4 py-2.5 shadow-xl"
            style={{ borderBottomRightRadius: 4 }}
          >
            <p className="text-sm font-bold whitespace-nowrap">nu-uh-uh 🫵</p>
            <p className="text-xs text-muted-foreground whitespace-nowrap">you can't do that, champ</p>
          </motion.div>

          {/* Character slides in from the right */}
          <motion.div
            initial={{ x: 160 }}
            animate={{ x: 0 }}
            exit={{ x: 180 }}
            transition={{ type: 'spring', damping: 16, stiffness: 100 }}
            className="w-36 h-36"
          >
            <motion.div
              className="w-full h-full flex items-center justify-center"
              style={{ fontSize: 72 }}
              animate={{ rotate: [0, -18, 18, -18, 18, -10, 0] }}
              transition={{ duration: 0.7, delay: 0.1 }}
            >
              🙅
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
