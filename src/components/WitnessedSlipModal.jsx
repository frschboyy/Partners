import React, { useState, useEffect } from 'react';
import { api, supabase } from '@/api/supabaseClient';
import { motion } from 'framer-motion';
import { useToast, Toast } from '@/components/Toast';

export default function WitnessedSlipModal({ currentUser, profile, partnerName, partnerId, partnership, onClose }) {
  const [partnerRules, setPartnerRules] = useState([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const { message: toastMessage, show: showToast } = useToast();

  useEffect(() => {
    async function fetchPartnerRules() {
      try {
        const fetched = await api.entities.Rule.filter({ user_id: partnerId });
        setPartnerRules(fetched.filter(r => r.active));
      } catch (err) {
        console.error('Failed to load partner rules:', err?.message || err);
      }
      setLoadingRules(false);
    }
    fetchPartnerRules();
  }, [partnerId]);

  async function submit() {
    if (!selectedRuleId) return;
    setSaving(true);
    try {
      const rule = partnerRules.find(r => r.id === selectedRuleId);
      await api.entities.Slip.create({
        user_id: partnerId,
        reporter_id: currentUser.id,
        partnership_id: partnership.id,
        rule_id: selectedRuleId,
        rule_title: rule?.title || '',
        penalty_amount: partnership.penalty_amount || 0,
        slip_type: 'witnessed',
        status: 'pending',
        slip_date: new Date().toISOString().split('T')[0],
        notes,
      });
      await supabase.from('notifications').insert({
        user_id: partnerId,
        type: 'slip_witnessed',
        title: `${profile?.display_name || 'Your partner'} reported a slip`,
        body: `They say you broke: ${rule?.title}. Confirm or dispute?`,
        from_user_id: currentUser.id,
        from_user_name: profile?.display_name,
        action_id: partnership.id,
        action_type: 'witnessed_slip',
        read: false,
      });
      showToast('Slip reported — your partner will be notified.');
      setTimeout(onClose, 1500);
    } catch (err) {
      console.error('Failed to report slip:', err?.message || err);
      showToast('Failed to report slip — please try again');
    }
    setSaving(false);
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <Toast message={toastMessage} />
      <motion.div
        className="w-full max-w-lg bg-card rounded-t-2xl p-6 space-y-4"
        initial={{ y: '100%' }} animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        <h2 className="font-bold text-lg">Report witnessed slip</h2>
        <p className="text-sm text-muted-foreground">
          Reporting against <span className="font-semibold text-foreground">{partnerName}</span>. They'll be asked to confirm or dispute.
        </p>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Which rule?</label>
          {loadingRules ? (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="h-11 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : partnerRules.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">{partnerName} has no active rules.</p>
          ) : (
            partnerRules.map(r => (
              <button
                key={r.id}
                onClick={() => setSelectedRuleId(r.id)}
                className={`w-full text-left p-3 rounded-lg border text-sm transition-all ${selectedRuleId === r.id ? 'border-destructive bg-destructive/10' : 'border-border bg-secondary'}`}
              >
                {r.title}
              </button>
            ))
          )}
        </div>

        <textarea
          className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm resize-none"
          rows={2}
          placeholder="What did you see? (optional)"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-border font-semibold text-sm">Cancel</button>
          <button
            onClick={submit}
            disabled={!selectedRuleId || saving}
            className="flex-1 py-3 rounded-xl font-bold text-sm bg-destructive text-destructive-foreground disabled:opacity-60"
          >
            {saving ? 'Reporting…' : 'Report Slip'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
