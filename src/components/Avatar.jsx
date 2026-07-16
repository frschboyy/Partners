import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { haptic } from '@/lib/haptic';

const LONG_PRESS_MS = 450;

export default function Avatar({ profile, size = 'md', className = '', onClick, noAutoFlip = false }) {
  const hasPhoto = !!profile?.photo_avatar_url;
  const hasEmoji = !!profile?.emoji_avatar;
  const canFlip = hasPhoto && hasEmoji;

  // true = front face (photo), false = back face (emoji)
  const [showPhoto, setShowPhoto] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const longPressTimer = useRef(null);
  const longPressActivated = useRef(false);

  useEffect(() => () => clearTimeout(longPressTimer.current), []);

  const sizes = {
    xs: 'w-8 h-8 text-lg',
    sm: 'w-10 h-10 text-xl',
    md: 'w-14 h-14 text-3xl',
    lg: 'w-20 h-20 text-4xl',
    xl: 'w-28 h-28 text-6xl',
  };
  const sizeClass = sizes[size] || sizes.md;

  // Auto-flip every 7 seconds when both photo and emoji exist (disabled via noAutoFlip)
  useEffect(() => {
    if (!canFlip || noAutoFlip) return;
    const id = setInterval(() => setShowPhoto(v => !v), 7000);
    return () => clearInterval(id);
  }, [canFlip, noAutoFlip]);

  // Auto-close expanded overlay
  useEffect(() => {
    if (!expanded) return;
    const t = setTimeout(() => setExpanded(false), 2500);
    return () => clearTimeout(t);
  }, [expanded]);

  function handleClick() {
    if (longPressActivated.current) { longPressActivated.current = false; return; }
    if (canFlip) setShowPhoto(v => !v);
    onClick?.();
  }

  // Hold-to-preview: press-and-hold expands the overlay, releasing closes it —
  // the same long-press-vs-tap disambiguation pattern used for chat messages
  // (a completed long press suppresses the click that would otherwise follow
  // and fire the flip/onClick behavior instead).
  function handlePointerDown() {
    longPressActivated.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressActivated.current = true;
      haptic([15, 10, 20]);
      setExpanded(true);
    }, LONG_PRESS_MS);
  }

  function handlePointerUp() {
    clearTimeout(longPressTimer.current);
    if (longPressActivated.current) setExpanded(false);
  }

  const emoji = profile?.emoji_avatar || '😎';

  return (
    <>
      <motion.div
        className={`${sizeClass} rounded-full overflow-hidden relative select-none flex-shrink-0 ${canFlip ? 'cursor-pointer' : ''} ${className}`}
        style={{
          border: '2px solid hsl(var(--theme-accent))',
          perspective: '600px',
        }}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
        whileTap={canFlip ? { scale: 0.9 } : {}}
        title={canFlip ? 'Tap to flip' : undefined}
      >
        <motion.div
          className="w-full h-full relative"
          style={{ transformStyle: 'preserve-3d' }}
          animate={{ rotateY: showPhoto ? 0 : 180 }}
          transition={{ duration: 0.55, type: 'spring', stiffness: 180, damping: 22 }}
        >
          {/* Front face — photo */}
          <div
            className="absolute inset-0 rounded-full overflow-hidden"
            style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
          >
            {hasPhoto ? (
              <img
                src={profile.photo_avatar_url}
                alt="avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ background: 'hsl(var(--theme-accent-muted))' }}
              >
                <span className="leading-none">{emoji}</span>
              </div>
            )}
          </div>

          {/* Back face — emoji (pre-rotated 180° so it appears right-way-up when the card flips) */}
          <div
            className="absolute inset-0 rounded-full overflow-hidden flex items-center justify-center"
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              background: 'hsl(var(--theme-accent-muted))',
            }}
          >
            <span className="leading-none select-none">{emoji}</span>
          </div>
        </motion.div>
      </motion.div>

      {/* Tap-to-expand overlay */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setExpanded(false)}
          >
            <motion.div
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.3, opacity: 0 }}
              transition={{ type: 'spring', damping: 18, stiffness: 280 }}
              className="w-52 h-52 rounded-full overflow-hidden"
              style={{ border: '4px solid hsl(var(--theme-accent))' }}
              onClick={e => e.stopPropagation()}
            >
              {showPhoto && hasPhoto ? (
                <img src={profile.photo_avatar_url} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-8xl"
                  style={{ background: 'hsl(var(--theme-accent-muted))' }}
                >
                  {emoji}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
