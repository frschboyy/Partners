import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  color: ['#f59e0b', '#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#06b6d4'][i % 7],
  size: 6 + Math.random() * 8,
  duration: 1.8 + Math.random() * 1.4,
  delay: Math.random() * 0.6,
  rotate: Math.random() * 720 - 360,
}));

const MILESTONES = {
  onboarding_complete: {
    emoji: '🚀',
    title: "You're all set!",
    body: "Your profile is ready. Now go find a partner and get to work.",
  },
};

export default function MilestoneModal({ type, onDismiss }) {
  const m = MILESTONES[type];

  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, []);

  if (!m) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/85 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onDismiss}
    >
      {CONFETTI.map(p => (
        <motion.div
          key={p.id}
          className="absolute pointer-events-none"
          style={{
            left: `${p.x}%`,
            top: -16,
            width: p.size,
            height: p.size * 0.55,
            background: p.color,
            borderRadius: 2,
          }}
          initial={{ y: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '110vh', rotate: p.rotate, opacity: [1, 1, 0.4, 0] }}
          transition={{ duration: p.duration, delay: p.delay, ease: [0.2, 0, 0.8, 1] }}
        />
      ))}

      <motion.div
        className="bg-card rounded-3xl p-8 mx-6 text-center space-y-4 shadow-2xl border border-border"
        initial={{ scale: 0.65, opacity: 0, y: 48 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.88, opacity: 0 }}
        transition={{ type: 'spring', damping: 18, stiffness: 240, delay: 0.08 }}
        onClick={e => e.stopPropagation()}
      >
        <motion.div
          className="text-7xl leading-none"
          animate={{ scale: [1, 1.3, 1], rotate: [0, -10, 10, 0] }}
          transition={{ duration: 0.65, delay: 0.25 }}
        >
          {m.emoji}
        </motion.div>
        <h2 className="text-2xl font-black">{m.title}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{m.body}</p>
        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={onDismiss}
          className="w-full py-3 rounded-xl font-bold text-sm"
          style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
        >
          Let's go! 🎉
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
