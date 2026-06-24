import React, { useState, useEffect } from 'react';
import { api, supabase } from '@/api/supabaseClient';
import { formatDateTime } from '@/lib/dateUtils';
import { motion } from 'framer-motion';
import { X, Bell } from 'lucide-react';
import { useToast, Toast } from '@/components/Toast';

function getAction(n) {
  switch (n.type) {
    case 'partner_request':
      return { label: 'View request', tab: 'home', intent: { action: 'openDiscover' } };
    case 'request_accepted':
      return { label: 'View partner', tab: 'home', intent: { action: 'viewPartners' } };
    case 'partnership_agreed':
      if (n.action_type === 'partnership_proposal') {
        return { label: 'View proposal', tab: 'home', intent: { action: 'openAgreement', partnershipId: n.action_id, fromUserId: n.from_user_id } };
      }
      return { label: 'View partnership', tab: 'home', intent: { action: 'viewPartners' } };
    case 'partnership_proposal':
      return { label: 'View new terms', tab: 'home', intent: { action: 'openAgreement', fromUserId: n.from_user_id } };
    case 'slip_confirmed':
    case 'slip_disputed':
    case 'balance_settled':
    case 'balance_denied':
      return { label: 'View financials', tab: 'home', intent: { action: 'viewPartners' } };
    case 'partnership_declined':
      return { label: 'View partners', tab: 'home', intent: { action: 'viewPartners' } };
    case 'new_message':
      return { label: 'Open chat', tab: 'chat', intent: { action: 'openChat', fromUserId: n.from_user_id } };
    case 'summertides_declared':
      return { label: 'View feed', tab: 'feed', intent: null };
    default:
      return null;
  }
}

export default function NotificationsPanel({ currentUser, profile, onClose, onNavigateToSettings, onNavigate }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingSlips, setPendingSlips] = useState([]);
  const { message: toastMessage, variant: toastVariant, show: showToast } = useToast();

  const needsSetPassword =
    !currentUser?.identities?.some(i => i.provider === 'email') &&
    !currentUser?.user_metadata?.has_set_password;

  useEffect(() => {
    loadAll();
    const unsubs = [
      api.entities.Notification.subscribeFiltered('user_id', currentUser.id, () => loadAll()),
      api.entities.Slip.subscribeFiltered('user_id', currentUser.id, () => loadAll()),
    ];
    return () => unsubs.forEach(fn => fn());
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [notifs, slips] = await Promise.all([
        api.entities.Notification.filter({ user_id: currentUser.id }, '-created_at', 30),
        api.entities.Slip.filter({ user_id: currentUser.id, status: 'pending' }),
      ]);
      const unreadIds = notifs.filter(n => !n.read).map(n => n.id);
      setNotifications(notifs.map(n => ({ ...n, read: true })));
      setPendingSlips(slips);

      // Fire-and-forget: mark read in background so the panel feels instant
      if (unreadIds.length > 0) {
        supabase
          .from('notifications')
          .update({ read: true })
          .in('id', unreadIds);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err?.message || err);
    }
    setLoading(false);
  }

  async function confirmSlip(slip) {
    await api.entities.Slip.update(slip.id, { status: 'confirmed' });
    if (slip.reporter_id) {
      const name = profile?.display_name || 'Your partner';
      const penaltyNote = slip.penalty_amount > 0 ? ` — ${slip.penalty_amount} KSH penalty applied` : '';
      await supabase.from('notifications').insert({
        user_id: slip.reporter_id,
        type: 'slip_confirmed',
        title: 'Slip confirmed',
        body: `${name} admitted the slip for "${slip.rule_title}"${penaltyNote}.`,
        from_user_id: currentUser.id,
        from_user_name: profile?.display_name,
        read: false,
      });
    }
    setPendingSlips(prev => prev.filter(s => s.id !== slip.id));
    showToast('Slip confirmed — penalty applied.');
  }

  async function disputeSlip(slip) {
    await api.entities.Slip.update(slip.id, { status: 'disputed' });
    if (slip.reporter_id) {
      const name = profile?.display_name || 'Your partner';
      await supabase.from('notifications').insert({
        user_id: slip.reporter_id,
        type: 'slip_disputed',
        title: 'Slip disputed',
        body: `${name} disputed the slip for "${slip.rule_title}" — no penalty applied.`,
        from_user_id: currentUser.id,
        from_user_name: profile?.display_name,
        read: false,
      });
    }
    setPendingSlips(prev => prev.filter(s => s.id !== slip.id));
    showToast('Slip disputed — your partner has been notified.');
  }

  async function confirmSettlement(n) {
    const now = new Date().toISOString();
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, actioned: true } : x));
    await supabase.from('partnerships').update({ balance_settled_at: now }).eq('id', n.action_id);
    supabase.from('notifications').update({ actioned: true, read: true }).eq('id', n.id);
    supabase.from('notifications').insert({
      user_id: n.from_user_id,
      type: 'balance_settled',
      title: 'Settlement confirmed',
      body: `${profile?.display_name || 'Your partner'} confirmed your balance settlement. Balance cleared.`,
      from_user_id: currentUser.id,
      from_user_name: profile?.display_name,
      read: false,
      actioned: false,
    });
    showToast('Balance settled ✓');
  }

  async function denySettlement(n) {
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, actioned: true } : x));
    supabase.from('notifications').update({ actioned: true, read: true }).eq('id', n.id);
    supabase.from('notifications').insert({
      user_id: n.from_user_id,
      type: 'balance_denied',
      title: 'Settlement not confirmed',
      body: `${profile?.display_name || 'Your partner'} did not confirm the settlement. The balance remains.`,
      from_user_id: currentUser.id,
      from_user_name: profile?.display_name,
      read: false,
      actioned: false,
    });
    showToast('Settlement denied — balance unchanged.');
  }

  const typeIcons = {
    partner_request: '🤝',
    request_accepted: '✅',
    request_declined: '❌',
    partnership_agreed: '🎉',
    slip_witnessed: '👀',
    slip_confirmed: '😔',
    slip_disputed: '🚫',
    new_message: '💬',
    summertides_declared: '🌊',
    partner_removed: '👋',
    balance_settled: '✅',
    balance_denied: '❌',
    partnership_declined: '❌',
  };

  const selfIcons = {
    self_post_created: '📸',
    self_rule_added: '📌',
    self_slip_logged: '😤',
    self_partnership_formed: '🤝',
    self_balance_cleared: '💸',
  };

  const selfNotifs = notifications.filter(n => n.type?.startsWith('self_'));
  // Unactioned settlement requests are handled as interactive cards, not in the main list
  const pendingSettlements = notifications.filter(n => n.type === 'balance_settle_request' && !n.actioned);
  const partnerNotifs = notifications.filter(n =>
    !n.type?.startsWith('self_') &&
    !(n.type === 'balance_settle_request' && !n.actioned)
  );

  const isEmpty = !loading && partnerNotifs.length === 0 && pendingSlips.length === 0 && pendingSettlements.length === 0 && !needsSetPassword;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col bg-card"
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
    >
      <Toast message={toastMessage} variant={toastVariant} />
      <div className="flex items-center gap-3 p-4 border-b border-border flex-shrink-0">
        <Bell size={20} />
        <h2 className="font-bold text-lg flex-1">Notifications</h2>
        <button onClick={onClose} className="p-2 rounded-full bg-secondary"><X size={18} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Set-password prompt for Google-only users */}
        {needsSetPassword && (
          <div className="card-brutal-accent p-4 space-y-3">
            <div className="flex gap-2">
              <span className="text-2xl">🔐</span>
              <div>
                <p className="font-bold text-sm">Set a password for your account</p>
                <p className="text-xs text-muted-foreground mt-1">
                  You signed up with Google. Set a password so you can also log in with your email.
                </p>
              </div>
            </div>
            <button
              onClick={() => { onClose(); onNavigateToSettings?.('password'); }}
              className="w-full py-2 rounded-lg font-bold text-sm"
              style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
            >
              Go to Settings →
            </button>
          </div>
        )}

        {/* Pending settlement confirmations */}
        {pendingSettlements.map(n => (
          <div key={n.id} className="card-brutal-accent p-4 space-y-3">
            <div className="flex gap-2">
              <span className="text-2xl">💸</span>
              <div>
                <p className="font-bold text-sm">{n.from_user_name} claims to have settled</p>
                <p className="text-sm text-muted-foreground mt-1">{n.body}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => confirmSettlement(n)}
                className="flex-1 py-2 rounded-lg font-bold text-sm"
                style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
              >
                Confirm
              </button>
              <button
                onClick={() => { onNavigate?.('home', { action: 'viewPartners' }); onClose(); }}
                className="px-3 py-2 rounded-lg font-semibold text-xs bg-secondary text-foreground"
              >
                View financials
              </button>
              <button
                onClick={() => denySettlement(n)}
                className="flex-1 py-2 rounded-lg font-semibold text-sm bg-secondary text-foreground"
              >
                Deny
              </button>
            </div>
          </div>
        ))}

        {/* Pending slip confirmations */}
        {pendingSlips.map(slip => (
          <div key={slip.id} className="card-brutal-accent p-4 space-y-3">
            <div className="flex gap-2">
              <span className="text-2xl">👀</span>
              <div>
                <p className="font-bold text-sm">Someone reported a witnessed slip</p>
                <p className="text-sm text-muted-foreground mt-1">Rule: <span className="font-semibold text-foreground">{slip.rule_title}</span></p>
                {slip.notes && <p className="text-xs text-muted-foreground mt-1 italic">"{slip.notes}"</p>}
                {slip.penalty_amount > 0 && (
                  <p className="text-xs text-destructive mt-1">Penalty: {slip.penalty_amount} KSH</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => confirmSlip(slip)}
                className="flex-1 py-2 rounded-lg font-bold text-sm bg-destructive text-destructive-foreground"
              >
                Confirm it happened
              </button>
              <button
                onClick={() => disputeSlip(slip)}
                className="flex-1 py-2 rounded-lg font-semibold text-sm bg-secondary text-foreground"
              >
                Dispute
              </button>
            </div>
          </div>
        ))}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <p className="text-4xl">🔔</p>
            <p className="font-semibold">All caught up</p>
            <p className="text-sm text-muted-foreground">Nothing new right now.</p>
          </div>
        ) : (
          partnerNotifs.map(n => {
            const action = getAction(n);
            const inner = (
              <>
                <span className="text-xl flex-shrink-0 mt-0.5">{typeIcons[n.type] || '🔔'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{formatDateTime(n.created_at)}</p>
                  {action && (
                    <p className="text-xs font-bold mt-1.5" style={{
                      color: n.actioned
                        ? 'hsl(var(--muted-foreground))'
                        : 'hsl(var(--theme-accent))'
                    }}>
                      {n.actioned ? 'Viewed' : `${action.label} →`}
                    </p>
                  )}
                </div>
                {!n.read && <div className="w-2 h-2 rounded-full bg-primary mt-1 flex-shrink-0" />}
              </>
            );

            const cls = `flex gap-3 p-3 rounded-xl border w-full text-left ${n.read ? 'border-border bg-card' : 'border-primary bg-accent-muted'}`;

            if (action && onNavigate && !n.actioned) {
              return (
                <motion.button
                  key={n.id}
                  whileTap={{ scale: 0.97 }}
                  className={cls}
                  onClick={() => {
                    supabase.from('notifications').update({ actioned: true }).eq('id', n.id);
                    onNavigate(action.tab, action.intent);
                  }}
                >
                  {inner}
                </motion.button>
              );
            }
            return <div key={n.id} className={cls}>{inner}</div>;
          })
        )}

        {/* Your Activity section */}
        {!loading && selfNotifs.length > 0 && (
          <>
            <div className={`pt-2 pb-1 ${partnerNotifs.length > 0 || pendingSlips.length > 0 || needsSetPassword ? 'border-t border-border mt-1' : ''}`}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Activity</p>
            </div>
            {selfNotifs.map(n => (
              <div key={n.id} className="flex gap-3 p-3 rounded-xl border border-border bg-secondary/60">
                <span className="text-xl flex-shrink-0 mt-0.5">{selfIcons[n.type] || '⚡'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">{formatDateTime(n.created_at)}</p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </motion.div>
  );
}
