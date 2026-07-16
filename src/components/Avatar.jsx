import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function Avatar({ profile, size = 'md', className = '', onClick, noAutoFlip = false }) {
  const hasPhoto = !!profile?.photo_avatar_url;
  const hasEmoji = !!profile?.emoji_avatar;
  const canFlip = hasPhoto && hasEmoji;

  // true = front face (photo), false = back face (emoji)
  const [showPhoto, setShowPhoto] = useState(true);

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

  function handleClick() {
    if (canFlip) setShowPhoto(v => !v);
    onClick?.();
  }

  const emoji = profile?.emoji_avatar || '😎';

  return (
    <motion.div
      className={`${sizeClass} rounded-full overflow-hidden relative select-none flex-shrink-0 ${canFlip ? 'cursor-pointer' : ''} ${className}`}
      style={{
        border: '2px solid hsl(var(--theme-accent))',
        perspective: '600px',
      }}
      onClick={handleClick}
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
  );
}
