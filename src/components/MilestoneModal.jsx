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
    body: "Your profile is ready. Here's what you configured:",
  },
};

export default function MilestoneModal({ type, onDismiss, summary }) {
  const m = MILESTONES[type];
  const dismissDelay = summary ? 8000 : 5000;

  useEffect(() => {
    const t = setTimeout(onDismiss, dismissDelay);
    return () => clearTimeout(t);
  }, []);

  if (!m) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/85 overflow-hidden px-5"
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
        className="bg-card rounded-3xl p-6 w-full max-w-sm text-center space-y-4 shadow-2xl border border-border"
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

        {/* Setup summary */}
        {summary && (
          <div className="space-y-2 text-left">
            {/* Identity */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary">
              {summary.photoUrl ? (
                <img src={summary.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <span className="text-2xl">{summary.emoji}</span>
              )}
              <div>
                <p className="font-bold text-sm">{summary.displayName}</p>
                <p className="text-[11px] text-muted-foreground">Your identity</p>
              </div>
            </div>

            {/* Goals */}
            {summary.goals.length > 0 && (
              <div className="p-3 rounded-xl bg-secondary">
                <p className="text-[11px] text-muted-foreground mb-1.5">Your goals</p>
                <div className="flex flex-wrap gap-1.5">
                  {summary.goals.map(g => (
                    <span key={g} className="text-xs bg-card px-2 py-0.5 rounded-full border border-border">{g}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Rules */}
            <div className="p-3 rounded-xl bg-secondary flex items-center justify-between">
              {summary.rulesCount > 0 ? (
                <>
                  <p className="text-sm font-semibold">
                    {summary.rulesCount} rule{summary.rulesCount !== 1 ? 's' : ''} added
                  </p>
                  <p className="text-[11px] text-muted-foreground">Streak tracking is live</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">No rules yet</p>
                  <p className="text-[11px] text-muted-foreground">Add them from Home</p>
                </>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground text-center pt-1">
              Next step: find an accountability partner on the Home tab.
            </p>
          </div>
        )}

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
