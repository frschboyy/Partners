import React, { useState, useEffect, useRef } from 'react';
import { X, UserPlus, Search, Loader2 } from 'lucide-react';
import { api, supabase } from '@/api/supabaseClient';
import Avatar from '@/components/Avatar';
import { motion, AnimatePresence } from 'framer-motion';

export default function DiscoverOverlay({ currentUser, currentProfile, onClose, existingPartnerIds = [], onPartnershipChanged }) {
  const [profiles, setProfiles] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sentRequests, setSentRequests] = useState({});
  const [introMsg, setIntroMsg] = useState({});
  const [showIntroFor, setShowIntroFor] = useState(null);
  const [pendingOutgoing, setPendingOutgoing] = useState([]);
  const [sending, setSending] = useState(null);
  // { [reqId]: 'accepting' | 'declining' | 'accepted' | 'declined' | 'error' }
  const [requestStates, setRequestStates] = useState({});
  // loadData() also re-runs on any PartnerRequest/Partnership realtime event
  // (not just this user's own — the subscriptions here are unfiltered) and
  // after accepting a request, not just on open — gating the spinner to the
  // true first load stops someone else's unrelated action elsewhere in the
  // app from blanking this list back to a spinner mid-interaction.
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    loadData();
    const unsubs = [
      api.entities.PartnerRequest.subscribe(() => loadData()),
      api.entities.Partnership.subscribe(() => loadData()),
    ];
    return () => unsubs.forEach(fn => fn());
  }, []);

  async function loadData() {
    if (!hasLoadedOnceRef.current) setLoading(true);
    const [allProfiles, outgoing, incoming, allPartnerships] = await Promise.all([
      api.entities.UserProfile.list(),
      api.entities.PartnerRequest.filter({ requester_id: currentUser.id, status: 'pending' }),
      api.entities.PartnerRequest.filter({ recipient_id: currentUser.id, status: 'pending' }),
      api.entities.Partnership.list(),
    ]);

    const connectedIds = new Set(
      allPartnerships
        .filter(p =>
          (p.user_a_id === currentUser.id || p.user_b_id === currentUser.id) &&
          p.status !== 'dissolved'
        )
        .map(p => p.user_a_id === currentUser.id ? p.user_b_id : p.user_a_id)
    );

    const incomingIds = new Set(incoming.map(r => r.requester_id));

    // Enrich each incoming request with the requester's profile for avatar display
    setIncomingRequests(
      incoming.map(req => ({
        ...req,
        requesterProfile: allProfiles.find(p => p.user_id === req.requester_id),
      }))
    );

    // Discover list: exclude self, existing partners, connected, and incoming requesters
    const filtered = allProfiles.filter(p =>
      p.user_id !== currentUser.id &&
      !existingPartnerIds.includes(p.user_id) &&
      !connectedIds.has(p.user_id) &&
      !incomingIds.has(p.user_id)
    );
    setProfiles(filtered);
    setPendingOutgoing(outgoing.map(r => r.recipient_id));
    hasLoadedOnceRef.current = true;
    setLoading(false);
  }

  async function handleAcceptRequest(req) {
    setRequestStates(prev => ({ ...prev, [req.id]: 'accepting' }));
    try {
      // Avoid 409: if a dissolved partnership already exists between these users, revive it
      const allPartnerships = await api.entities.Partnership.list();
      const existing = allPartnerships.find(p =>
        (p.user_a_id === req.requester_id && p.user_b_id === currentUser.id) ||
        (p.user_a_id === currentUser.id && p.user_b_id === req.requester_id)
      );

      if (existing) {
        await api.entities.Partnership.update(existing.id, {
          user_a_name: existing.user_a_id === req.requester_id ? req.requester_name : (currentProfile?.display_name || currentUser.full_name),
          user_b_name: existing.user_b_id === currentUser.id ? (currentProfile?.display_name || currentUser.full_name) : req.requester_name,
          status: 'negotiating',
          dissolved_at: null,
        });
      } else {
        await api.entities.Partnership.create({
          user_a_id: req.requester_id,
          user_b_id: currentUser.id,
          user_a_name: req.requester_name,
          user_b_name: currentProfile?.display_name || currentUser.full_name,
          status: 'negotiating',
        });
      }
      await api.entities.PartnerRequest.update(req.id, { status: 'accepted' });
      // Insert without .select() to avoid SELECT-RLS blocking cross-user inserts
      await supabase.from('notifications').insert({
        user_id: req.requester_id,
        type: 'request_accepted',
        title: `${currentProfile?.display_name || 'Your request'} was accepted!`,
        body: 'Go to Discover to start the partnership.',
        from_user_id: currentUser.id,
        from_user_name: currentProfile?.display_name,
        read: false,
      });
      setRequestStates(prev => ({ ...prev, [req.id]: 'accepted' }));
      onPartnershipChanged?.();
      setTimeout(() => { setIncomingRequests(prev => prev.filter(r => r.id !== req.id)); loadData(); }, 1500);
    } catch (err) {
      console.error('[accept]', err);
      setRequestStates(prev => ({ ...prev, [req.id]: 'error' }));
    }
  }

  async function handleDeclineRequest(req) {
    setRequestStates(prev => ({ ...prev, [req.id]: 'declining' }));
    try {
      await api.entities.PartnerRequest.update(req.id, { status: 'declined' });
      await supabase.from('notifications').insert({
        user_id: req.requester_id,
        type: 'request_declined',
        title: 'Partner request declined',
        body: `${currentProfile?.display_name || 'Someone'} declined your partnership request.`,
        from_user_id: currentUser.id,
        from_user_name: currentProfile?.display_name,
        read: false,
      });
      setRequestStates(prev => ({ ...prev, [req.id]: 'declined' }));
      setTimeout(() => setIncomingRequests(prev => prev.filter(r => r.id !== req.id)), 1500);
    } catch (err) {
      console.error('[decline]', err);
      setRequestStates(prev => ({ ...prev, [req.id]: 'error' }));
    }
  }

  async function sendRequest(recipientProfile) {
    if (sending) return;
    setSending(recipientProfile.user_id);
    try {
      const [existing, reverse, allPartnerships] = await Promise.all([
        api.entities.PartnerRequest.filter({ requester_id: currentUser.id, recipient_id: recipientProfile.user_id, status: 'pending' }),
        api.entities.PartnerRequest.filter({ requester_id: recipientProfile.user_id, recipient_id: currentUser.id, status: 'pending' }),
        api.entities.Partnership.list(),
      ]);

      const alreadyConnected = allPartnerships.some(p =>
        ((p.user_a_id === currentUser.id && p.user_b_id === recipientProfile.user_id) ||
         (p.user_b_id === currentUser.id && p.user_a_id === recipientProfile.user_id)) &&
        p.status !== 'dissolved'
      );

      if (alreadyConnected || existing.length > 0 || reverse.length > 0) {
        if (existing.length > 0) setSentRequests(prev => ({ ...prev, [recipientProfile.user_id]: true }));
        setShowIntroFor(null);
        return;
      }

      const msg = introMsg[recipientProfile.user_id] || '';
      await api.entities.PartnerRequest.create({
        requester_id: currentUser.id,
        recipient_id: recipientProfile.user_id,
        requester_name: currentProfile?.display_name || currentUser.full_name,
        recipient_name: recipientProfile.display_name,
        intro_message: msg,
        status: 'pending',
      });
      await supabase.from('notifications').insert({
        user_id: recipientProfile.user_id,
        type: 'partner_request',
        title: 'New partnership request!',
        body: `${currentProfile?.display_name || 'Someone'} wants to hold you accountable.`,
        from_user_id: currentUser.id,
        from_user_name: currentProfile?.display_name || currentUser.full_name,
        read: false,
      });
      setSentRequests(prev => ({ ...prev, [recipientProfile.user_id]: true }));
      setShowIntroFor(null);
    } catch {
      // Re-check state so UI reflects reality
      const [existing] = await Promise.all([
        api.entities.PartnerRequest.filter({ requester_id: currentUser.id, recipient_id: recipientProfile.user_id, status: 'pending' }),
      ]).catch(() => [[]]);
      if (existing?.length > 0) setSentRequests(prev => ({ ...prev, [recipientProfile.user_id]: true }));
      setShowIntroFor(null);
    } finally {
      setSending(null);
    }
  }

  const displayed = profiles.filter(p =>
    !search || p.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end bg-black/70"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          className="w-full max-w-lg mx-auto bg-card rounded-t-2xl flex flex-col"
          style={{ maxHeight: '90vh' }}
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          {/* Header */}
          <div className="p-5 border-b border-border flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-lg font-bold">Discover Partners</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Find people on the same mission</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-full bg-secondary"><X size={18} /></button>
          </div>

          <div className="overflow-y-auto flex-1 p-4 space-y-3">
            {/* Incoming partnership requests */}
            <AnimatePresence>
              {incomingRequests.map(req => {
                const state = requestStates[req.id];
                const isBusy = state === 'accepting' || state === 'declining';
                return (
                  <motion.div
                    key={req.id}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="card-brutal-accent p-4 space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar profile={req.requesterProfile} size="sm" noAutoFlip />
                      <div className="flex-1">
                        <p className="font-bold text-sm">🤝 Partnership request from <span className="text-accent-custom">{req.requester_name}</span></p>
                        {req.intro_message && (
                          <p className="text-xs text-muted-foreground mt-0.5 italic">"{req.intro_message}"</p>
                        )}
                      </div>
                    </div>

                    {state === 'accepted' && (
                      <p className="text-sm font-semibold text-center py-1" style={{ color: 'hsl(var(--theme-accent))' }}>
                        ✓ Accepted — partnership started!
                      </p>
                    )}
                    {state === 'declined' && (
                      <p className="text-sm font-semibold text-center py-1 text-muted-foreground">
                        ✕ Request declined.
                      </p>
                    )}
                    {state === 'error' && (
                      <p className="text-sm text-destructive text-center">Something went wrong. Try again.</p>
                    )}

                    {(isBusy) && (
                      <div className="flex items-center justify-center gap-2 py-1 text-sm text-muted-foreground">
                        <Loader2 size={14} className="animate-spin" />
                        {state === 'accepting' ? 'Accepting…' : 'Declining…'}
                      </div>
                    )}

                    {(!state || state === 'error') && !isBusy && (
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
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Search */}
            <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
              <Search size={16} className="text-muted-foreground" />
              <input
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                placeholder="Search by name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Discover list */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : displayed.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-4xl mb-3">🔭</p>
                <p className="font-semibold">No one to discover yet</p>
                <p className="text-sm text-muted-foreground mt-1">Invite your friends to join!</p>
              </div>
            ) : (
              displayed.map(p => {
                const hasSent = sentRequests[p.user_id] || pendingOutgoing.includes(p.user_id);
                const isShowingIntro = showIntroFor === p.user_id;
                const isSending = sending === p.user_id;
                return (
                  <div key={p.id} className="card-brutal p-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <Avatar profile={p} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{p.display_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {p.goals?.length > 0 ? p.goals.join(' · ') : 'No goals shared yet'}
                        </p>
                      </div>
                      {hasSent ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-accent-muted text-accent-custom font-semibold">Sent ✓</span>
                      ) : (
                        <motion.button
                          whileTap={{ scale: 0.85 }}
                          onClick={() => setShowIntroFor(isShowingIntro ? null : p.user_id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
                          style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
                        >
                          <UserPlus size={13} /> Connect
                        </motion.button>
                      )}
                    </div>

                    {isShowingIntro && !hasSent && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-2"
                      >
                        <input
                          className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                          placeholder="Say hi (optional intro message)"
                          value={introMsg[p.user_id] || ''}
                          onChange={e => setIntroMsg(prev => ({ ...prev, [p.user_id]: e.target.value }))}
                          maxLength={200}
                        />
                        <button
                          onClick={() => sendRequest(p)}
                          disabled={isSending}
                          className="w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
                          style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
                        >
                          {isSending && <Loader2 size={12} className="animate-spin" />}
                          {isSending ? 'Sending…' : 'Send Request'}
                        </button>
                      </motion.div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
