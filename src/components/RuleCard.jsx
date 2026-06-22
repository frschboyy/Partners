import React, { useState } from 'react';
import { Pencil, Trash2, Check, X, Flame } from 'lucide-react';
import { api } from '@/api/supabaseClient';
import { getGoalEmoji } from '@/lib/goals';
import { motion } from 'framer-motion';


export default function RuleCard({ rule, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(rule.title);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSave() {
    setSaving(true);
    const updated = await api.entities.Rule.update(rule.id, { title });
    onUpdated?.(updated);
    setEditing(false);
    setSaving(false);
  }

  async function handleDelete() {
    await api.entities.Rule.delete(rule.id);
    onDeleted?.(rule.id);
  }

  const emoji = rule.emoji || getGoalEmoji(rule.category);
  const streak = rule.current_streak || 0;

  return (
    <motion.div
      layout
      className="card-brutal p-3 flex items-center gap-3"
    >
      <div className="text-2xl">{emoji}</div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            className="w-full bg-input border border-border rounded px-2 py-1 text-sm text-foreground"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        ) : (
          <p className="font-semibold text-foreground text-sm truncate">{rule.title}</p>
        )}
      </div>

      {/* Streak badge */}
      {!editing && (
        <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-accent-muted">
          <Flame size={12} style={{ color: 'hsl(var(--theme-accent))' }} />
          <span className="text-xs font-bold font-display-mono" style={{ color: 'hsl(var(--theme-accent))' }}>
            {streak}d
          </span>
        </div>
      )}

      {/* Actions */}
      {editing ? (
        <div className="flex gap-1">
          <motion.button whileTap={{ scale: 0.85 }} onClick={handleSave} disabled={saving}
            className="p-1.5 rounded-md bg-primary text-primary-foreground">
            <Check size={14} />
          </motion.button>
          <motion.button whileTap={{ scale: 0.85 }} onClick={() => setEditing(false)}
            className="p-1.5 rounded-md bg-secondary text-secondary-foreground">
            <X size={14} />
          </motion.button>
        </div>
      ) : confirmDelete ? (
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
        <div className="flex gap-1">
          <motion.button whileTap={{ scale: 0.85 }} onClick={() => setEditing(true)}
            className="p-1.5 rounded-md bg-secondary text-muted-foreground">
            <Pencil size={14} />
          </motion.button>
          <motion.button whileTap={{ scale: 0.85 }} onClick={() => setConfirmDelete(true)}
            className="p-1.5 rounded-md bg-secondary text-muted-foreground">
            <Trash2 size={14} />
          </motion.button>
        </div>
      )}
    </motion.div>
  );
}