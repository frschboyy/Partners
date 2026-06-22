import React, { useState, useEffect } from 'react';
import { X, UserPlus, Search } from 'lucide-react';
import { api } from '@/api/supabaseClient';
import Avatar from '@/components/Avatar';
import { motion, AnimatePresence } from 'framer-motion';

export default function DiscoverOverlay({ currentUser, currentProfile, onClose, existingPartnerIds = [] }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sentRequests, setSentRequests] = useState({});
  const [introMsg, setIntroMsg] = useState({});
  const [showIntroFor, setShowIntroFor] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [allProfiles, myRequests] = await Promise.all([
      api.entities.UserProfile.list(),
      api.entities.PartnerRequest.filter({ requester_id: currentUser.id }),
    ]);
    const filtered = allProfiles.filter(p =>
      p.user_id !== currentUser.id && !existingPartnerIds.includes(p.user_id)
    );
    setProfiles(filtered);

    const pending = myRequests.filter(r => r.status === 'pending').map(r => r.recipient_id);
    setPendingRequests(pending);
    setLoading(false);
  }

  async function sendRequest(recipientProfile) {
    const msg = introMsg[recipientProfile.user_id] || '';
    await api.entities.PartnerRequest.create({
      requester_id: currentUser.id,
      recipient_id: recipientProfile.user_id,
      requester_name: currentProfile?.display_name || currentUser.full_name,
      recipient_name: recipientProfile.display_name,
      intro_message: msg,
      status: 'pending',
    });
    // Notify recipient
    await api.entities.Notification.create({
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
  }

  const displayed = profiles.filter(p =>
    !search || p.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end bg-black/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          className="w-full max-w-lg mx-auto bg-card rounded-t-2xl flex flex-col"
          style={{ maxHeight: '85vh' }}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          <div className="p-5 border-b border-border flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-lg font-bold">Discover Partners</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Find people on the same mission</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-full bg-secondary">
              <X size={18} />
            </button>
          </div>

          <div className="px-5 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
              <Search size={16} className="text-muted-foreground" />
              <input
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                placeholder="Search by name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-y-auto flex-1 p-4 space-y-3">
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
                const isSent = sentRequests[p.user_id] || pendingRequests.includes(p.user_id);
                const isShowingIntro = showIntroFor === p.user_id;
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
                      {isSent ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-accent-muted text-accent-custom font-semibold">Sent ✓</span>
                      ) : (
                        <motion.button
                          whileTap={{ scale: 0.85 }}
                          onClick={() => setShowIntroFor(isShowingIntro ? null : p.user_id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
                          style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
                        >
                          <UserPlus size={13} />
                          Connect
                        </motion.button>
                      )}
                    </div>

                    {isShowingIntro && !isSent && (
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
                          className="w-full py-2 rounded-lg text-xs font-bold"
                          style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
                        >
                          Send Request
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