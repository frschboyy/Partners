import React, { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/api/supabaseClient';
import { PREDEFINED_RULES } from '@/lib/rules';
import { motion, AnimatePresence } from 'framer-motion';

export default function AddRuleModal({ userId, existingRuleTitles = [], onAdded, onClose }) {
  const [ruleSearch, setRuleSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedRule, setSelectedRule] = useState(null);
  const [hasRecurring, setHasRecurring] = useState(false);
  const [intervalDays, setIntervalDays] = useState(30);
  const [saving, setSaving] = useState(false);

  const existingLower = existingRuleTitles.map(t => t.toLowerCase());
  const filteredRules = ruleSearch.trim()
    ? PREDEFINED_RULES.filter(r =>
        r.title.toLowerCase().includes(ruleSearch.toLowerCase()) &&
        !existingLower.includes(r.title.toLowerCase())
      )
    : [];

  function pickRule(rule) {
    setSelectedRule(rule);
    setRuleSearch(rule.title);
    setShowDropdown(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedRule) return;
    setSaving(true);
    try {
      const rule = await api.entities.Rule.create({
        user_id: userId,
        title: selectedRule.title,
        category: selectedRule.category,
        emoji: selectedRule.emoji,
        current_streak: 0,
        longest_streak: 0,
        active: true,
        recurring_allowance: hasRecurring,
        allowance_interval_days: hasRecurring ? Number(intervalDays) : undefined,
      });
      onAdded?.(rule);
      onClose?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={e => e.target === e.currentTarget && onClose?.()}
      >
        <motion.div
          className="w-full max-w-lg bg-card rounded-t-2xl p-6 pb-10 space-y-5"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold font-heading">Add a Rule</h2>
            <button onClick={onClose} className="p-2 rounded-full bg-secondary">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Search rules</label>
              <div className="relative flex items-center">
                {selectedRule && (
                  <span className="absolute left-3 text-base pointer-events-none">{selectedRule.emoji}</span>
                )}
                <input
                  className={`w-full bg-input border border-border rounded-xl py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${selectedRule ? 'pl-9 pr-4' : 'px-4'}`}
                  placeholder="e.g. No Alcohol, Daily Running…"
                  value={ruleSearch}
                  onChange={e => {
                    setRuleSearch(e.target.value);
                    setSelectedRule(null);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                />
              </div>
              <AnimatePresence>
                {showDropdown && filteredRules.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.12 }}
                    className="absolute z-10 w-full mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto"
                  >
                    {filteredRules.map(rule => (
                      <button
                        key={rule.id}
                        type="button"
                        onMouseDown={() => pickRule(rule)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-secondary text-left transition-colors"
                      >
                        <span className="text-base">{rule.emoji}</span>
                        <span className="font-medium">{rule.title}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Recurring allowance */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasRecurring}
                  onChange={e => setHasRecurring(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Has recurring allowance</span>
              </label>
            </div>
            {hasRecurring && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Allow once every</span>
                <input
                  type="number"
                  className="w-16 bg-input border border-border rounded px-2 py-1 text-sm text-foreground"
                  value={intervalDays}
                  onChange={e => setIntervalDays(e.target.value)}
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
            )}

            <button
              type="submit"
              disabled={saving || !selectedRule}
              className="w-full py-3 rounded-lg font-bold text-sm transition-all disabled:opacity-50"
              style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
            >
              {saving ? 'Adding…' : 'Add Rule'}
            </button>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
