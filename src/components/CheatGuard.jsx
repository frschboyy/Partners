import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Lottie from 'lottie-react';
import animationData from '@/assets/cheat-guard.json';

// Replace src/assets/cheat-guard.json with any Lottie JSON from lottiefiles.com
// (search "finger wag" or "no no" → download JSON → drop in place)
const hasAnimation = animationData?.layers?.length > 0;

export default function CheatGuard({ visible, onDone }) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(onDone, 3400);
    return () => clearTimeout(t);
  }, [visible, onDone]);

  return (
    <AnimatePresence>
      {visible && (
        <div className="fixed bottom-20 right-0 z-[100] flex flex-col items-end pointer-events-none select-none">
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
            {hasAnimation ? (
              <Lottie
                animationData={animationData}
                loop
                autoplay
                style={{ width: '100%', height: '100%' }}
              />
            ) : (
              // Emoji fallback until a real Lottie file is added
              <motion.div
                className="w-full h-full flex items-center justify-center"
                style={{ fontSize: 72 }}
                animate={{ rotate: [0, -18, 18, -18, 18, -10, 0] }}
                transition={{ duration: 0.7, delay: 0.1 }}
              >
                🙅
              </motion.div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
