import React, { useState, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';

export function useToast({ duration = 2000 } = {}) {
  const [message, setMessage] = useState(null);
  const timerRef = useRef(null);

  const show = useCallback((msg) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(msg);
    timerRef.current = setTimeout(() => setMessage(null), duration);
  }, [duration]);

  return { message, show };
}

export function Toast({ message, position = 'bottom' }) {
  const isTop = position === 'top';

  const positionStyle = isTop
    ? { top: '1.25rem', left: '50%', transform: 'translateX(-50%)' }
    : { bottom: '6rem', left: '50%', transform: 'translateX(-50%)' };

  return ReactDOM.createPortal(
    <AnimatePresence>
      {message && (
        <motion.div
          key="toast"
          initial={{ opacity: 0, y: isTop ? -24 : 24, scale: 0.82 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: isTop ? -12 : 12, scale: 0.9 }}
          transition={{ type: 'spring', damping: 20, stiffness: 380 }}
          style={{ position: 'fixed', zIndex: 99999, pointerEvents: 'none', whiteSpace: 'nowrap', ...positionStyle }}
        >
          <div
            className="flex items-center gap-2.5 pl-3 pr-5 py-3 rounded-2xl shadow-2xl"
            style={{ background: 'hsl(var(--foreground))', color: 'hsl(var(--background))' }}
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'hsl(var(--theme-accent))' }}
            >
              <Check size={13} strokeWidth={3} style={{ color: 'hsl(var(--theme-accent-fg))' }} />
            </div>
            <span className="text-sm font-bold tracking-tight">{message}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
