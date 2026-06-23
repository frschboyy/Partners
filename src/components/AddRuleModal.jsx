import React, { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/api/supabaseClient';
import { PREDEFINED_RULES } from '@/lib/rules';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast, Toast } from '@/components/Toast';

const CUSTOM_EMOJIS = ['📌', '🎯', '💡', '⚡', '🔒', '🧠', '🌱', '💼', '🏃', '🍃', '✅', '🛑', '🔥', '💪', '🧘', '🚫'];

export default function AddRuleModal({ userId, existingRuleTitles = [], onAdded, onClose }) {
  const { message: toastMessage, show: showToast } = useToast();
  const [ruleSearch, setRuleSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedRule, setSelectedRule] = useState(null);
  const [isCustom, setIsCustom] = useState(false);
  const [customEmoji, setCustomEmoji] = useState('📌');
  const [hasRecurring, setHasRecurring] = useState(false);
  const [intervalDays, setIntervalDays] = useState(30);
  const [saving, setSaving] = useState(false);

  const existingLower = existingRuleTitles.map(t => t.toLowerCase());
  const trimmed = ruleSearch.trim();

  const filteredRules = trimmed
    ? PREDEFINED_RULES.filter(r =>
        r.title.toLowerCase().includes(trimmed.toLowerCase()) &&
        !existingLower.includes(r.title.toLowerCase())
      )
    : [];

  const showCustomOption =
    trimmed.length >= 2 &&
    !existingLower.includes(trimmed.toLowerCase()) &&
    !PREDEFINED_RULES.some(r => r.title.toLowerCase() === trimmed.toLowerCase());

  function pickRule(rule) {
    setSelectedRule(rule);
    setRuleSearch(rule.title);
    setShowDropdown(false);
    setIsCustom(false);
  }

  function pickCustom() {
    setSelectedRule({ title: trimmed, emoji: customEmoji, category: 'custom' });
    setIsCustom(true);
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
        category: selectedRule.category || 'custom',
        emoji: isCustom ? customEmoji : selectedRule.emoji,
        current_streak: 0,
        longest_streak: 0,
        active: true,
        recurring_allowance: hasRecurring,
        allowance_interval_days: hasRecurring ? Number(intervalDays) : undefined,
      });
      onAdded?.(rule);
      onClose?.();
    } catch (err) {
      console.error('Failed to add rule:', err);
      showToast('Failed to add rule — please try again');
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
          <Toast message={toastMessage} />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold font-heading">Add a Rule</h2>
            <button onClick={onClose} aria-label="Close" className="p-2 rounded-full bg-secondary">
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Search / type field */}
            <div className="relative">
              <label htmlFor="rule-search" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                Search or type a custom rule
              </label>
              <div className="relative flex items-center">
                {selectedRule && (
                  <span className="absolute left-3 text-base pointer-events-none" aria-hidden="true">
                    {isCustom ? customEmoji : selectedRule.emoji}
                  </span>
                )}
                <input
                  id="rule-search"
                  className={`w-full bg-input border border-border rounded-xl py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${selectedRule ? 'pl-9 pr-4' : 'px-4'}`}
                  placeholder="e.g. No Alcohol, Daily Running…"
                  value={ruleSearch}
                  onChange={e => {
                    setRuleSearch(e.target.value);
                    setSelectedRule(null);
                    setIsCustom(false);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                />
              </div>

              <AnimatePresence>
                {showDropdown && (filteredRules.length > 0 || showCustomOption) && (
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

                    {showCustomOption && (
                      <button
                        type="button"
                        onMouseDown={pickCustom}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-secondary text-left transition-colors border-t border-border"
                      >
                        <span className="text-base">✏️</span>
                        <span className="font-medium text-muted-foreground">
                          Add <span className="text-foreground font-semibold">"{trimmed}"</span> as custom rule
                        </span>
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Custom emoji picker */}
            {isCustom && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  Pick an emoji
                </label>
                <div className="grid grid-cols-8 gap-1.5">
                  {CUSTOM_EMOJIS.map(e => (
                    <motion.button
                      key={e}
                      type="button"
                      whileTap={{ scale: 0.8 }}
                      onClick={() => {
                        setCustomEmoji(e);
                        setSelectedRule(r => r ? { ...r, emoji: e } : r);
                      }}
                      className={`aspect-square text-xl rounded-lg flex items-center justify-center border-2 transition-all ${
                        customEmoji === e ? 'border-primary bg-accent-muted' : 'border-transparent bg-secondary'
                      }`}
                    >
                      {e}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

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
                <label htmlFor="interval-days" className="text-sm text-muted-foreground">Allow once every</label>
                <input
                  id="interval-days"
                  type="number"
                  className="w-16 bg-input border border-border rounded px-2 py-1 text-sm text-foreground"
                  value={intervalDays}
                  onChange={e => setIntervalDays(e.target.value)}
                />
                <span className="text-sm text-muted-foreground" aria-hidden="true">days</span>
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
