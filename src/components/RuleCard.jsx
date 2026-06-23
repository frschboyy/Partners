import React, { useState } from 'react';
import { Trash2, X, Flame } from 'lucide-react';
import { api } from '@/api/supabaseClient';
import { getGoalEmoji } from '@/lib/goals';
import { motion } from 'framer-motion';

export default function RuleCard({ rule, onDeleted }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  async function handleDelete() {
    try {
      await api.entities.Rule.delete(rule.id);
      onDeleted?.(rule.id);
    } catch {
      setConfirmDelete(false);
      setDeleteError(true);
      setTimeout(() => setDeleteError(false), 3000);
    }
  }

  const emoji = rule.emoji || getGoalEmoji(rule.category);
  const streak = rule.current_streak || 0;

  return (
    <motion.div layout className="card-brutal p-3 flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <div className="text-2xl">{emoji}</div>
        <p className="flex-1 font-semibold text-foreground text-sm truncate">{rule.title}</p>

        {/* Streak badge */}
        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-accent-muted">
          <Flame size={12} style={{ color: 'hsl(var(--theme-accent))' }} />
          <span className="text-xs font-bold font-display-mono" style={{ color: 'hsl(var(--theme-accent))' }}>
            {streak}d
          </span>
        </div>

        {/* Delete */}
        {confirmDelete ? (
          <div className="flex gap-1">
            <motion.button whileTap={{ scale: 0.85 }} onClick={handleDelete}
              className="p-1.5 rounded-md bg-destructive text-destructive-foreground text-xs font-bold">
              Del
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => setConfirmDelete(false)}
              className="p-1.5 rounded-md bg-secondary text-secondary-foreground">
              <X size={14} />
            </motion.button>
          </div>
        ) : (
          <motion.button whileTap={{ scale: 0.85 }} onClick={() => setConfirmDelete(true)}
            className="p-1.5 rounded-md bg-secondary text-muted-foreground">
            <Trash2 size={14} />
          </motion.button>
        )}
      </div>

      {deleteError && (
        <p className="text-xs text-destructive px-1">Failed to delete — please try again.</p>
      )}
    </motion.div>
  );
}
