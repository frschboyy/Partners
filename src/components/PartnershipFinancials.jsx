import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { api, supabase } from '@/api/supabaseClient';
import { formatDate } from '@/lib/dateUtils';

export default function PartnershipFinancials({
  partnership,
  currentUserId,
  currentUserName,
  partnerName,
  partnerUserId,
  currencyLabel = 'KSH',
  onToast,
  onSettled,
}) {
  const [slips, setSlips] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [settling, setSettling] = useState(false);
  const [settlePending, setSettlePending] = useState(false);

  useEffect(() => {
    loadSlips();
  }, [partnership.id]);

  async function loadSlips() {
    setLoading(true);
    try {
      const all = await api.entities.Slip.filter({ partnership_id: partnership.id });
      setSlips(all.filter(s => s.status !== 'disputed'));
    } catch (err) {
      console.error('Failed to load slips:', err);
      setSlips([]);
    }
    setLoading(false);
  }

  if (loading || !slips) {
    return <div className="h-6 w-32 bg-muted rounded animate-pulse mt-2" />;
  }

  // Only count slips after balance_settled_at (if set)
  const settledSince = partnership.balance_settled_at;
  const relevantSlips = settledSince
    ? slips.filter(s => new Date(s.slip_date + 'T00:00:00') >= new Date(settledSince))
    : slips;

  const mySlips = relevantSlips.filter(s => s.user_id === currentUserId);
  const partnerSlips = relevantSlips.filter(s => s.user_id !== currentUserId);

  function effectivePenalty(s) {
    if (s.penalty_waived) return 0;
    return s.slip_type === 'self'
      ? Math.round((s.penalty_amount || 0) * 0.5)
      : (s.penalty_amount || 0);
  }

  const amountLost = mySlips.reduce((sum, s) => sum + effectivePenalty(s), 0);
  const amountGained = partnerSlips.reduce((sum, s) => sum + (s.penalty_waived ? 0 : (s.penalty_amount || 0)), 0);
  const net = amountGained - amountLost;

  const netColumnLabel = net > 0 ? 'Owed' : net < 0 ? 'Debt' : 'Even';
  const netLabel = net < 0
    ? `You owe ${partnerName}`
    : net > 0
    ? `${partnerName} owes you`
    : "You're even";

  async function handleSettle() {
    if (settling || settlePending) return;
    setSettling(true);
    try {
      if (net < 0) {
        // I owe — send a settlement claim to partner
        await supabase.from('notifications').insert({
          user_id: partnerUserId,
          type: 'balance_settle_request',
          title: 'Balance settlement claimed',
          body: `${currentUserName} claims to have settled the ${Math.abs(net)} ${currencyLabel} balance.`,
          from_user_id: currentUserId,
          from_user_name: currentUserName,
          action_id: partnership.id,
          read: false,
          actioned: false,
        });
        setSettlePending(true);
        onToast?.(`Settlement request sent to ${partnerName}`);
      } else {
        // I'm owed — forgive immediately, log it
        const now = new Date().toISOString();
        await supabase.from('partnerships').update({ balance_settled_at: now }).eq('id', partnership.id);
        await supabase.from('notifications').insert({
          user_id: currentUserId,
          type: 'self_balance_cleared',
          title: 'Balance cleared',
          body: `You cleared the ${net} ${currencyLabel} balance with ${partnerName}.`,
          from_user_id: currentUserId,
          from_user_name: currentUserName,
          read: true,
          actioned: false,
        });
        onSettled?.();
        onToast?.('Balance cleared ✓');
      }
    } catch (err) {
      console.error('Settle error:', err);
      onToast?.('Failed to settle — please try again');
    }
    setSettling(false);
  }

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-2">
      <button className="w-full text-left" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Financials</span>
          {expanded ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
        </div>
        <div className="flex gap-4 mt-2">
          <div className="flex-1 text-center">
            <p className="text-xs text-muted-foreground">You lost</p>
            <p className="font-bold text-sm text-destructive font-display-mono">
              {amountLost > 0 ? `-${amountLost}` : '0'} <span className="font-normal text-xs">{currencyLabel}</span>
            </p>
          </div>
          <div className="flex-1 text-center">
            <p className="text-xs text-muted-foreground">You gained</p>
            <p className="font-bold text-sm font-display-mono" style={{ color: amountGained > 0 ? 'hsl(var(--theme-accent))' : 'inherit' }}>
              +{amountGained} <span className="font-normal text-xs">{currencyLabel}</span>
            </p>
          </div>
          <div className="flex-1 text-center">
            <p className="text-xs text-muted-foreground">{netColumnLabel}</p>
            <p
              className={`font-bold text-sm font-display-mono ${net < 0 ? 'text-destructive' : net === 0 ? 'text-muted-foreground' : ''}`}
              style={net > 0 ? { color: 'hsl(var(--theme-accent))' } : {}}
            >
              {net > 0 ? `+${net}` : net} <span className="font-normal text-xs">{currencyLabel}</span>
            </p>
          </div>
        </div>
      </button>

      {/* Settle balance button — only when balance outstanding */}
      {net !== 0 && (
        <button
          onClick={handleSettle}
          disabled={settling || settlePending}
          className="w-full py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50"
          style={
            settlePending
              ? { borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))', background: 'hsl(var(--secondary))' }
              : net < 0
              ? { borderColor: 'hsl(var(--destructive) / 0.4)', color: 'hsl(var(--destructive))', background: 'hsl(var(--destructive) / 0.06)' }
              : { borderColor: 'hsl(var(--theme-accent) / 0.4)', color: 'hsl(var(--theme-accent))', background: 'hsl(var(--theme-accent) / 0.06)' }
          }
        >
          {settling ? 'Processing…'
            : settlePending ? '⏳ Awaiting confirmation'
            : net < 0 ? '💸 I settled this'
            : '✓ Mark as settled'}
        </button>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-4">
              {settledSince && (
                <p className="text-[10px] text-muted-foreground text-center">
                  Showing slips since last settlement · {new Date(settledSince).toLocaleDateString()}
                </p>
              )}

              {/* My slips */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">Your slips</p>
                {mySlips.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No slips recorded 🎉</p>
                ) : (
                  <div className="space-y-1.5">
                    {mySlips.map(s => {
                      const eff = effectivePenalty(s);
                      return (
                        <div key={s.id} className="flex items-start justify-between gap-2 bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">
                              Broke: <span className="text-destructive">{s.rule_title || 'Unknown rule'}</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {formatDate(s.slip_date)}
                              {s.slip_type === 'witnessed' ? ` · witnessed by ${partnerName}` : ' · self-reported (50%)'}
                              {s.penalty_waived ? ' · waived' : ''}
                            </p>
                          </div>
                          <p className="text-xs font-bold text-destructive whitespace-nowrap font-display-mono">
                            {s.penalty_waived
                              ? <span className="line-through opacity-50">-{eff}</span>
                              : `-${eff}`}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Partner slips */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">{partnerName}'s slips</p>
                {partnerSlips.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No slips from {partnerName} yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {partnerSlips.map(s => (
                      <div
                        key={s.id}
                        className="flex items-start justify-between gap-2 rounded-lg px-3 py-2"
                        style={{ background: 'hsl(var(--theme-accent-muted))', border: '1px solid hsl(var(--theme-accent) / 0.2)' }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {partnerName} broke:{' '}
                            <span style={{ color: 'hsl(var(--theme-accent))' }}>{s.rule_title || 'Unknown rule'}</span>
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {formatDate(s.slip_date)}
                            {s.reporter_id === currentUserId ? ' · reported by you' : ' · self-reported'}
                            {s.penalty_waived ? ' · waived' : ''}
                          </p>
                        </div>
                        <p
                          className="text-xs font-bold whitespace-nowrap font-display-mono"
                          style={{ color: s.penalty_waived ? undefined : 'hsl(var(--theme-accent))' }}
                        >
                          {s.penalty_waived
                            ? <span className="line-through opacity-50">+{s.penalty_amount}</span>
                            : `+${s.penalty_amount}`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Net summary */}
              <div className="bg-card border border-border rounded-lg px-3 py-2.5 flex items-center justify-between">
                <p className="text-xs font-semibold">{netLabel}</p>
                <p
                  className={`text-sm font-bold font-display-mono ${net < 0 ? 'text-destructive' : ''}`}
                  style={net > 0 ? { color: 'hsl(var(--theme-accent))' } : {}}
                >
                  {Math.abs(net)} {currencyLabel}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
