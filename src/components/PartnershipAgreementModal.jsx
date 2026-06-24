import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, CheckCircle, Send, Lock, RefreshCw } from 'lucide-react';
import { api, supabase } from '@/api/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';

export default function PartnershipAgreementModal({ partnership, currentUserId, currentUserRules = [], onClose, onAgreed, onProposalSent }) {
  const [goals, setGoals] = useState(partnership.shared_goals || []);
  const [newGoal, setNewGoal] = useState('');
  const [penalty, setPenalty] = useState(partnership.penalty_amount || 100);
  const [userARules, setUserARules] = useState(partnership.user_a_rules || []);
  const [userBRules, setUserBRules] = useState(partnership.user_b_rules || []);
  const [newARule, setNewARule] = useState('');
  const [newBRule, setNewBRule] = useState('');
  const [specialAllowances, setSpecialAllowances] = useState(partnership.special_allowances || []);
  const [newAllowance, setNewAllowance] = useState({ name: '', for_user: 'both', date_start: '', date_end: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showRenegotiateConfirm, setShowRenegotiateConfirm] = useState(false);
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);

  // Live partnership state — kept fresh via on-mount fetch + real-time subscription
  const [livePartnership, setLivePartnership] = useState(partnership);

  const isUserA = currentUserId === partnership.user_a_id;
  const partnerName = isUserA ? partnership.user_b_name : partnership.user_a_name;
  const myName = isUserA ? partnership.user_a_name : partnership.user_b_name;

  // Fetch fresh state on open (prop may be stale if partner submitted before we opened)
  // and subscribe to real-time updates so we detect concurrent submissions instantly.
  useEffect(() => {
    supabase
      .from('partnerships')
      .select('*')
      .eq('id', partnership.id)
      .single()
      .then(({ data }) => { if (data) setLivePartnership(data); });

    const channel = supabase
      .channel(`partnership-modal-${partnership.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'partnerships',
        filter: `id=eq.${partnership.id}`,
      }, payload => {
        if (payload.new) setLivePartnership(payload.new);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [partnership.id]);

  // When the partner submits a proposal while we have the modal open, sync the
  // form fields so the user sees what the partner actually proposed.
  const prevCanAcceptRef = useRef(false);
  const lastProposerId = livePartnership.last_proposer_id;
  const iProposed = lastProposerId === currentUserId;
  const proposalPending = !!lastProposerId;
  const canAccept = proposalPending && !iProposed;

  useEffect(() => {
    if (!prevCanAcceptRef.current && canAccept) {
      setGoals(livePartnership.shared_goals || []);
      setPenalty(livePartnership.penalty_amount || 100);
      setUserARules(livePartnership.user_a_rules || []);
      setUserBRules(livePartnership.user_b_rules || []);
      setSpecialAllowances(livePartnership.special_allowances || []);
    }
    prevCanAcceptRef.current = canAccept;
  }, [canAccept]);

  // Prefill my rules section from personal rules (only if currently empty)
  useEffect(() => {
    if (isUserA && userARules.length === 0 && currentUserRules.length > 0) {
      setUserARules(currentUserRules.map(r => r.title));
    }
    if (!isUserA && userBRules.length === 0 && currentUserRules.length > 0) {
      setUserBRules(currentUserRules.map(r => r.title));
    }
  }, []);

  // Settled = both parties have agreed and status is active
  const isSettled = livePartnership.status === 'active'
    && livePartnership.user_a_agreed
    && livePartnership.user_b_agreed;

  function addGoal() {
    if (newGoal.trim()) { setGoals(g => [...g, newGoal.trim()]); setNewGoal(''); }
  }

  function addAllowance() {
    if (newAllowance.name.trim()) {
      setSpecialAllowances(a => [...a, { ...newAllowance, id: Date.now().toString() }]);
      setNewAllowance({ name: '', for_user: 'both', date_start: '', date_end: '' });
    }
  }

  async function handleSubmitProposal() {
    setSaving(true);
    setSaveError('');
    try {
      // Atomically claim the proposal slot — only succeeds if no one else has proposed
      const { data: claimed, error } = await supabase.rpc('claim_proposal_slot', {
        p_partnership_id: partnership.id,
        p_proposer_id:    currentUserId,
      });

      if (error) throw error;

      if (!claimed) {
        // Partner submitted first — refresh their terms so the UI shows them
        const { data: fresh } = await supabase
          .from('partnerships')
          .select('*')
          .eq('id', partnership.id)
          .single();
        if (fresh) setLivePartnership(fresh);
        setSaveError('Your partner already submitted a proposal. Review their terms above.');
        setSaving(false);
        return;
      }

      // Slot is ours — write the full proposal terms
      await api.entities.Partnership.update(partnership.id, {
        shared_goals:       goals,
        penalty_amount:     Number(penalty) || 0,
        user_a_rules:       userARules,
        user_b_rules:       userBRules,
        special_allowances: specialAllowances,
        user_a_agreed:      false,
        user_b_agreed:      false,
      });

      const partnerId = isUserA ? partnership.user_b_id : partnership.user_a_id;
      await supabase.from('notifications').insert({
        user_id: partnerId,
        type: 'partnership_agreed',
        title: `${myName} sent a proposal`,
        body: 'Review the terms and accept or counter-propose.',
        from_user_id: currentUserId,
        from_user_name: myName,
        action_id: partnership.id,
        action_type: 'partnership_proposal',
        read: false,
      });

      onProposalSent?.();
      onClose();
    } catch (err) {
      setSaveError(err?.message?.includes('duplicate') || err?.code === '23505'
        ? 'A proposal conflict occurred. Please close this modal and try again.'
        : 'Failed to send proposal — check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAccept() {
    setSaving(true);
    setSaveError('');
    try {
      await api.entities.Partnership.update(partnership.id, {
        user_a_agreed: true,
        user_b_agreed: true,
        status: 'active',
        agreed_at: new Date().toISOString(),
      });
      await supabase.from('notifications').insert([
        {
          user_id: partnership.user_a_id,
          type: 'partnership_agreed',
          title: '🎉 Partnership locked in!',
          body: `You and ${partnership.user_b_name} are now accountability partners.`,
          read: false,
        },
        {
          user_id: partnership.user_b_id,
          type: 'partnership_agreed',
          title: '🎉 Partnership locked in!',
          body: `You and ${partnership.user_a_name} are now accountability partners.`,
          read: false,
        },
      ]);
      onAgreed?.();
      onClose();
    } catch (err) {
      setSaveError('Failed to accept the agreement — please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDecline() {
    setSaving(true);
    setSaveError('');
    try {
      await api.entities.Partnership.update(partnership.id, {
        status: 'dissolved',
        user_a_agreed: false,
        user_b_agreed: false,
        last_proposer_id: null,
      });
      const proposerId = livePartnership.last_proposer_id;
      if (proposerId) {
        await supabase.from('notifications').insert({
          user_id: proposerId,
          type: 'partnership_declined',
          title: `${myName} declined your proposal`,
          body: `${myName} has declined the partnership agreement. The partnership has ended.`,
          from_user_id: currentUserId,
          from_user_name: myName,
          action_id: partnership.id,
          read: false,
        });
      }
      setShowDeclineConfirm(false);
      onClose();
    } catch (err) {
      setSaveError('Failed to decline — please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRenegotiate() {
    setSaving(true);
    setSaveError('');
    try {
      await api.entities.Partnership.update(partnership.id, {
        user_a_agreed: false,
        user_b_agreed: false,
        last_proposer_id: null,
        status: 'negotiating',
      });
      const partnerId = isUserA ? partnership.user_b_id : partnership.user_a_id;
      await supabase.from('notifications').insert({
        user_id: partnerId,
        type: 'partnership_proposal',
        title: `${myName} wants to renegotiate`,
        body: 'Your partnership terms have been re-opened for negotiation.',
        from_user_id: currentUserId,
        from_user_name: myName,
        read: false,
      });
      setShowRenegotiateConfirm(false);
      onClose();
    } catch (err) {
      setSaveError('Failed to re-open negotiation — please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ——— Settled / locked view ———
  if (isSettled) {
    return (
      <AnimatePresence>
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={e => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            className="w-full max-w-lg bg-card rounded-t-2xl flex flex-col"
            style={{ maxHeight: '92vh' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <div className="p-5 border-b border-border flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Lock size={16} className="text-green-500" /> Partnership Agreement
                </h2>
                <p className="text-xs text-muted-foreground">with {partnerName} · Locked in ✅</p>
              </div>
              <button onClick={onClose} className="p-2 rounded-full bg-secondary"><X size={18} /></button>
            </div>

            {/* Settled banner */}
            <div className="px-5 pt-4 flex-shrink-0">
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-center space-y-1">
                <p className="text-sm font-bold text-green-500 flex items-center justify-center gap-2">
                  <CheckCircle size={15} /> Agreed & settled
                </p>
                {partnership.agreed_at && (
                  <p className="text-xs text-muted-foreground">
                    Agreed on {new Date(partnership.agreed_at).toLocaleDateString(undefined, { dateStyle: 'long' })}
                  </p>
                )}
              </div>
            </div>

            {/* Read-only agreement terms */}
            <div className="overflow-y-auto flex-1 p-5 space-y-5">
              {goals.length > 0 && (
                <section className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Shared Goals</h3>
                  {goals.map((g, i) => (
                    <div key={i} className="bg-secondary rounded-lg px-3 py-2 text-sm">{g}</div>
                  ))}
                </section>
              )}

              <section className="space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{partnership.user_a_name}'s Rules</h3>
                {userARules.length > 0
                  ? userARules.map((r, i) => <div key={i} className="bg-secondary rounded-lg px-3 py-2 text-sm">{r}</div>)
                  : <p className="text-sm text-muted-foreground">No rules specified.</p>}
              </section>

              <section className="space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{partnership.user_b_name}'s Rules</h3>
                {userBRules.length > 0
                  ? userBRules.map((r, i) => <div key={i} className="bg-secondary rounded-lg px-3 py-2 text-sm">{r}</div>)
                  : <p className="text-sm text-muted-foreground">No rules specified.</p>}
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Penalty per Slip</h3>
                <div className="bg-secondary rounded-lg px-3 py-2 text-sm font-mono font-bold">
                  {penalty} KSH
                </div>
              </section>

              {specialAllowances.length > 0 && (
                <section className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Special Allowances</h3>
                  {specialAllowances.map((a, i) => (
                    <div key={i} className="bg-secondary rounded-lg px-3 py-2 text-sm">
                      {a.name} {a.date_start && `(${a.date_start}${a.date_end ? ` – ${a.date_end}` : ''})`}
                    </div>
                  ))}
                </section>
              )}
            </div>

            {/* Footer: only renegotiate available */}
            <div className="p-5 border-t border-border flex-shrink-0">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => setShowRenegotiateConfirm(true)}
                className="w-full py-2.5 rounded-lg border border-border text-sm font-semibold text-muted-foreground flex items-center justify-center gap-2"
              >
                <RefreshCw size={14} /> Propose Changes
              </motion.button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                This will re-open negotiation and require fresh mutual acceptance.
              </p>
            </div>
          </motion.div>

          {/* Renegotiate confirm dialog */}
          <AnimatePresence>
            {showRenegotiateConfirm && (
              <motion.div
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-6"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={e => e.target === e.currentTarget && setShowRenegotiateConfirm(false)}
              >
                <motion.div
                  className="bg-card rounded-2xl p-6 space-y-4 w-full max-w-sm"
                  initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
                >
                  <div className="text-center">
                    <p className="text-3xl mb-2">📝</p>
                    <h3 className="font-bold">Propose Changes?</h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      This will re-open negotiation. Both you and {partnerName} will need to accept the new terms before it's locked again.
                    </p>
                  </div>
                  {saveError && (
                    <p className="text-xs text-destructive text-center">{saveError}</p>
                  )}
                  <div className="flex gap-3">
                    <button onClick={() => setShowRenegotiateConfirm(false)}
                      className="flex-1 py-2.5 rounded-xl border border-border font-semibold text-sm">
                      Cancel
                    </button>
                    <button onClick={handleRenegotiate} disabled={saving}
                      className="flex-1 py-2.5 rounded-xl font-bold text-sm"
                      style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}>
                      {saving ? 'Re-opening…' : 'Yes, renegotiate'}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ——— Negotiation view ———
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/70"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          className="w-full max-w-lg bg-card rounded-t-2xl flex flex-col"
          style={{ maxHeight: '92vh' }}
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          <div className="p-5 border-b border-border flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-lg font-bold">Partnership Agreement</h2>
              <p className="text-xs text-muted-foreground">with {partnerName}</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-full bg-secondary"><X size={18} /></button>
          </div>

          {/* Status banner */}
          <div className="px-5 pt-4 flex-shrink-0">
            {!proposalPending && (
              <div className="p-3 rounded-lg bg-secondary text-xs text-muted-foreground text-center">
                Fill in the terms below and tap <strong>Submit Proposal</strong> to send to {partnerName}.
              </div>
            )}
            {proposalPending && iProposed && (
              <div className="p-3 rounded-lg bg-accent-muted text-xs text-center font-semibold" style={{ color: 'hsl(var(--theme-accent))' }}>
                <CheckCircle size={14} className="inline mr-1.5 -mt-0.5" />
                Proposal sent — waiting for {partnerName} to accept or counter-propose.
              </div>
            )}
            {proposalPending && canAccept && (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-xs text-center font-semibold text-yellow-500 space-y-1">
                <p>🚫 {partnerName} already submitted a proposal.</p>
                <p className="font-normal text-yellow-400">Review the terms below, then Accept or Counter-Propose — you cannot submit a new proposal right now.</p>
              </div>
            )}
          </div>

          <div className="overflow-y-auto flex-1 p-5 space-y-6">
            {/* Shared Goals */}
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Shared Goals</h3>
              {goals.map((g, i) => (
                <div key={i} className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2 text-sm">
                  <span className="flex-1">{g}</span>
                  <button onClick={() => setGoals(goals.filter((_, j) => j !== i))}><Trash2 size={13} className="text-muted-foreground" /></button>
                </div>
              ))}
              <div className="flex gap-2">
                <input className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm" placeholder="Add a shared goal" value={newGoal} onChange={e => setNewGoal(e.target.value)} onKeyDown={e => e.key === 'Enter' && addGoal()} />
                <button onClick={addGoal} className="p-2 rounded-lg bg-secondary"><Plus size={16} /></button>
              </div>
            </section>

            {/* Rules per person — prefilled from personal rules */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{partnership.user_a_name}'s Rules</h3>
                {isUserA && currentUserRules.length > 0 && (
                  <button
                    onClick={() => setUserARules(currentUserRules.map(r => r.title))}
                    className="text-[10px] text-muted-foreground underline"
                  >
                    Reset to my rules
                  </button>
                )}
              </div>
              {userARules.map((r, i) => (
                <div key={i} className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2 text-sm">
                  <span className="flex-1">{r}</span>
                  <button onClick={() => setUserARules(userARules.filter((_, j) => j !== i))}><Trash2 size={13} className="text-muted-foreground" /></button>
                </div>
              ))}
              <div className="flex gap-2">
                <input className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm" placeholder="Add rule" value={newARule} onChange={e => setNewARule(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newARule.trim()) { const t = newARule.trim(); setUserARules(r => r.some(x => x.toLowerCase() === t.toLowerCase()) ? r : [...r, t]); setNewARule(''); }}} />
                <button onClick={() => { if (newARule.trim()) { const t = newARule.trim(); setUserARules(r => r.some(x => x.toLowerCase() === t.toLowerCase()) ? r : [...r, t]); setNewARule(''); }}} className="p-2 rounded-lg bg-secondary"><Plus size={16} /></button>
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{partnership.user_b_name}'s Rules</h3>
                {!isUserA && currentUserRules.length > 0 && (
                  <button
                    onClick={() => setUserBRules(currentUserRules.map(r => r.title))}
                    className="text-[10px] text-muted-foreground underline"
                  >
                    Reset to my rules
                  </button>
                )}
              </div>
              {userBRules.map((r, i) => (
                <div key={i} className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2 text-sm">
                  <span className="flex-1">{r}</span>
                  <button onClick={() => setUserBRules(userBRules.filter((_, j) => j !== i))}><Trash2 size={13} className="text-muted-foreground" /></button>
                </div>
              ))}
              <div className="flex gap-2">
                <input className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm" placeholder="Add rule" value={newBRule} onChange={e => setNewBRule(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newBRule.trim()) { const t = newBRule.trim(); setUserBRules(r => r.some(x => x.toLowerCase() === t.toLowerCase()) ? r : [...r, t]); setNewBRule(''); }}} />
                <button onClick={() => { if (newBRule.trim()) { const t = newBRule.trim(); setUserBRules(r => r.some(x => x.toLowerCase() === t.toLowerCase()) ? r : [...r, t]); setNewBRule(''); }}} className="p-2 rounded-lg bg-secondary"><Plus size={16} /></button>
              </div>
            </section>

            {/* Penalty */}
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Penalty per Slip (KSH)</h3>
              <input type="number" className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm" value={penalty} onChange={e => setPenalty(e.target.value)} />
              <p className="text-xs text-muted-foreground">Honor system — settled outside the app.</p>
            </section>

            {/* Special allowances */}
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Special Allowances</h3>
              <p className="text-xs text-muted-foreground">Pre-agreed exceptions (birthdays, vacations, etc.)</p>
              {specialAllowances.map((a, i) => (
                <div key={i} className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2 text-sm">
                  <span className="flex-1">{a.name} {a.date_start && `(${a.date_start}${a.date_end ? ` – ${a.date_end}` : ''})`}</span>
                  <button onClick={() => setSpecialAllowances(specialAllowances.filter((_, j) => j !== i))}><Trash2 size={13} className="text-muted-foreground" /></button>
                </div>
              ))}
              <div className="space-y-2 p-3 bg-secondary rounded-lg">
                <input className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm" placeholder="Allowance name (e.g. Birthday)" value={newAllowance.name} onChange={e => setNewAllowance(a => ({ ...a, name: e.target.value }))} />
                <div className="flex gap-2">
                  <input type="date" className="flex-1 bg-input border border-border rounded px-2 py-1.5 text-sm" value={newAllowance.date_start} onChange={e => setNewAllowance(a => ({ ...a, date_start: e.target.value }))} />
                  <input type="date" className="flex-1 bg-input border border-border rounded px-2 py-1.5 text-sm" value={newAllowance.date_end} onChange={e => setNewAllowance(a => ({ ...a, date_end: e.target.value }))} />
                </div>
                <button onClick={addAllowance} className="w-full py-1.5 rounded bg-primary text-primary-foreground text-xs font-semibold">Add Allowance</button>
              </div>
            </section>
          </div>

          {/* Footer actions */}
          <div className="p-5 border-t border-border flex-shrink-0 space-y-3">
            {saveError && (
              <p className="text-xs text-destructive text-center px-1">{saveError}</p>
            )}
            {canAccept ? (
              <>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={handleAccept}
                  disabled={saving}
                  className="w-full py-3 rounded-lg font-bold text-sm"
                  style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
                >
                  {saving ? 'Accepting…' : '✅ Accept these terms'}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={handleSubmitProposal}
                  disabled={saving}
                  className="w-full py-2.5 rounded-lg border border-border text-sm font-semibold text-foreground flex items-center justify-center gap-2"
                >
                  <Send size={14} /> Counter-Propose
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setShowDeclineConfirm(true)}
                  disabled={saving}
                  className="w-full py-2 rounded-lg text-xs font-semibold text-destructive border border-destructive/30 bg-destructive/5"
                >
                  Decline partnership
                </motion.button>
              </>
            ) : (
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleSubmitProposal}
                disabled={saving || iProposed}
                className="w-full py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
              >
                <Send size={15} />
                {saving ? 'Sending…' : iProposed ? 'Proposal sent — awaiting response' : 'Submit Proposal'}
              </motion.button>
            )}
          </div>
        </motion.div>
      {/* Decline confirm dialog */}
      <AnimatePresence>
        {showDeclineConfirm && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={e => e.target === e.currentTarget && setShowDeclineConfirm(false)}
          >
            <motion.div
              className="bg-card rounded-2xl p-6 space-y-4 w-full max-w-sm"
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
            >
              <div className="text-center">
                <p className="text-3xl mb-2">❌</p>
                <h3 className="font-bold">Decline partnership?</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  This will end the partnership with {partnerName}. They'll be notified that you declined. This cannot be undone.
                </p>
              </div>
              {saveError && (
                <p className="text-xs text-destructive text-center">{saveError}</p>
              )}
              <div className="flex gap-3">
                <button onClick={() => setShowDeclineConfirm(false)} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl border border-border font-semibold text-sm">
                  Cancel
                </button>
                <button onClick={handleDecline} disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm">
                  {saving ? 'Declining…' : 'Yes, decline'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}