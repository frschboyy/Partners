import React, { useState, useEffect } from 'react';
import { api } from '@/api/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell } from 'lucide-react';

export default function NotificationsPanel({ currentUser, profile, onClose, onNavigateToSettings }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingSlips, setPendingSlips] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);

  const needsSetPassword =
    !currentUser?.identities?.some(i => i.provider === 'email') &&
    !currentUser?.user_metadata?.has_set_password;

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [notifs, slips, requests] = await Promise.all([
      api.entities.Notification.filter({ user_id: currentUser.id }, '-created_at', 30),
      api.entities.Slip.filter({ user_id: currentUser.id, status: 'pending_confirmation' }),
      api.entities.PartnerRequest.filter({ recipient_id: currentUser.id, status: 'pending' }),
    ]);
    setNotifications(notifs);
    setPendingSlips(slips);
    setPendingRequests(requests);
    // Mark all as read
    await Promise.all(notifs.filter(n => !n.read).map(n =>
      api.entities.Notification.update(n.id, { read: true })
    ));
    setLoading(false);
  }

  async function confirmSlip(slip) {
    await api.entities.Slip.update(slip.id, { status: 'confirmed' });
    const myProfile = await api.entities.UserProfile.filter({ user_id: currentUser.id });
    if (myProfile[0] && slip.penalty_amount > 0) {
      await api.entities.UserProfile.update(myProfile[0].id, {
        total_owed: (myProfile[0].total_owed || 0) + slip.penalty_amount,
      });
    }
    if (slip.reporter_id) {
      const name = profile?.display_name || 'Your partner';
      const penaltyNote = slip.penalty_amount > 0 ? ` — ${slip.penalty_amount} KSH penalty applied` : '';
      await api.entities.Notification.create({
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
  }

  async function disputeSlip(slip) {
    await api.entities.Slip.update(slip.id, { status: 'disputed' });
    if (slip.reporter_id) {
      const name = profile?.display_name || 'Your partner';
      await api.entities.Notification.create({
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
  }

  async function handleAcceptRequest(req) {
    await api.entities.Partnership.create({
      user_a_id: req.requester_id,
      user_b_id: currentUser.id,
      user_a_name: req.requester_name,
      user_b_name: profile?.display_name || currentUser.full_name,
      status: 'negotiating',
      request_id: req.id,
    });
    await api.entities.PartnerRequest.update(req.id, { status: 'accepted' });
    await api.entities.Notification.create({
      user_id: req.requester_id,
      type: 'request_accepted',
      title: `${profile?.display_name || 'Your request'} was accepted!`,
      body: 'Chat is now open. Discuss and agree on your terms.',
      from_user_id: currentUser.id,
      from_user_name: profile?.display_name,
      read: false,
    });
    setPendingRequests(prev => prev.filter(r => r.id !== req.id));
  }

  async function handleDeclineRequest(req) {
    await api.entities.PartnerRequest.update(req.id, { status: 'declined' });
    await api.entities.Notification.create({
      user_id: req.requester_id,
      type: 'request_declined',
      title: 'Partner request declined',
      body: `${profile?.display_name || 'Someone'} declined your partnership request.`,
      from_user_id: currentUser.id,
      from_user_name: profile?.display_name,
      read: false,
    });
    setPendingRequests(prev => prev.filter(r => r.id !== req.id));
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
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col bg-card"
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
    >
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

        {/* Pending partner requests */}
        {pendingRequests.map(req => (
          <div key={req.id} className="card-brutal-accent p-4 space-y-3">
            <div className="flex gap-2">
              <span className="text-2xl">🤝</span>
              <div>
                <p className="font-bold text-sm">Partnership request from <span className="text-accent-custom">{req.requester_name}</span></p>
                {req.intro_message && <p className="text-sm text-muted-foreground mt-1 italic">"{req.intro_message}"</p>}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleAcceptRequest(req)}
                className="flex-1 py-2 rounded-lg font-bold text-sm"
                style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
              >
                Accept ✓
              </button>
              <button
                onClick={() => handleDeclineRequest(req)}
                className="flex-1 py-2 rounded-lg font-semibold text-sm bg-secondary text-foreground"
              >
                Decline ✕
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
        ) : notifications.length === 0 && pendingSlips.length === 0 && pendingRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <p className="text-4xl">🔔</p>
            <p className="font-semibold">All caught up</p>
            <p className="text-sm text-muted-foreground">Nothing new right now.</p>
          </div>
        ) : (
          notifications.map(n => (
            <div key={n.id} className={`flex gap-3 p-3 rounded-xl border ${n.read ? 'border-border bg-card' : 'border-primary bg-accent-muted'}`}>
              <span className="text-xl flex-shrink-0">{typeIcons[n.type] || '🔔'}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{n.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </div>
              {!n.read && <div className="w-2 h-2 rounded-full bg-primary mt-1 flex-shrink-0" />}
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}