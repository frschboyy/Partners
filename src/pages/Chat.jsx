import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/api/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import Avatar from '@/components/Avatar';
import { Send, ArrowLeft } from 'lucide-react';

export default function Chat({ currentUser, profile }) {
  const [partnerships, setPartnerships] = useState([]);
  const [partnerProfiles, setPartnerProfiles] = useState({});
  const [selectedPartnership, setSelectedPartnership] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});
  const bottomRef = useRef(null);

  useEffect(() => {
    if (currentUser) loadPartnerships();
  }, [currentUser]);

  useEffect(() => {
    if (!selectedPartnership) return;
    setMessages([]);
    loadMessages(selectedPartnership.id);
    const unsub = api.entities.ChatMessage.subscribe(event => {
      if (event.data?.partnership_id === selectedPartnership.id) {
        setMessages(prev => {
          if (event.type === 'create') {
            // Dedupe: if message already exists (added optimistically), replace by id
            const exists = prev.some(m => m.id === event.data.id);
            if (exists) return prev.map(m => m.id === event.data.id ? event.data : m);
            return [...prev, event.data];
          }
          if (event.type === 'update') return prev.map(m => m.id === event.data.id ? event.data : m);
          if (event.type === 'delete') return prev.filter(m => m.id !== event.data?.id);
          return prev;
        });
      }
    });
    return unsub;
  }, [selectedPartnership]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadPartnerships() {
    const [allPartnerships, allProfiles] = await Promise.all([
      api.entities.Partnership.list(),
      api.entities.UserProfile.list(),
    ]);

    const myPartnerships = allPartnerships.filter(
      p => (p.user_a_id === currentUser.id || p.user_b_id === currentUser.id) &&
        (p.status === 'active' || p.status === 'negotiating')
    );
    setPartnerships(myPartnerships);

    const profileMap = {};
    allProfiles.forEach(pr => { profileMap[pr.user_id] = pr; });
    if (profile) profileMap[currentUser.id] = profile;
    setPartnerProfiles(profileMap);

    // Load unread counts
    const unread = {};
    for (const p of myPartnerships) {
      const msgs = await api.entities.ChatMessage.filter({ partnership_id: p.id }, 'created_at', 100);
      unread[p.id] = msgs.filter(m => !m.read_by?.includes(currentUser.id) && m.sender_id !== currentUser.id).length;
    }
    setUnreadCounts(unread);
  }

  async function loadMessages(partnershipId) {
    setLoadingMessages(true);
    const msgs = await api.entities.ChatMessage.filter({ partnership_id: partnershipId }, 'created_at', 100);
    setMessages(msgs);
    setLoadingMessages(false);
    // Mark as read
    const unread = msgs.filter(m => !m.read_by?.includes(currentUser.id) && m.sender_id !== currentUser.id);
    await Promise.all(
      unread.map(m =>
        api.entities.ChatMessage.update(m.id, { read_by: [...(m.read_by || []), currentUser.id] })
      )
    );
    setUnreadCounts(prev => ({ ...prev, [partnershipId]: 0 }));
  }

  async function sendMessage() {
    if (!text.trim() || !selectedPartnership) return;
    setSending(true);
    const content = text.trim();
    setText('');
    const msg = await api.entities.ChatMessage.create({
      partnership_id: selectedPartnership.id,
      sender_id: currentUser.id,
      sender_name: profile?.display_name || currentUser.full_name,
      content,
      message_type: 'text',
      read_by: [currentUser.id],
    });
    // Only add if not already added by the subscription (dedupe by id)
    setMessages(prev => {
      const exists = prev.some(m => m.id === msg.id);
      if (exists) return prev;
      return [...prev, msg];
    });
    setSending(false);
  }

  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  if (selectedPartnership) {
    const partnerId = selectedPartnership.user_a_id === currentUser.id
      ? selectedPartnership.user_b_id
      : selectedPartnership.user_a_id;
    const partnerName = selectedPartnership.user_a_id === currentUser.id
      ? selectedPartnership.user_b_name
      : selectedPartnership.user_a_name;
    const partnerProfile = partnerProfiles[partnerId];

    return (
      <div className="flex flex-col h-full bg-background">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
          <motion.button
            whileTap={{ scale: 0.85, opacity: 0.7 }}
            onClick={() => setSelectedPartnership(null)}
            className="p-2.5 rounded-full bg-secondary"
          >
            <ArrowLeft size={18} />
          </motion.button>
          <Avatar profile={partnerProfile} size="sm" noAutoFlip />
          <div>
            <p className="font-bold">{partnerName}</p>
            <p className="text-xs text-muted-foreground">Accountability partner</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loadingMessages ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <p className="text-4xl">💬</p>
              <p className="text-sm text-muted-foreground text-center">Chat is open. Say something →</p>
            </div>
          ) : null}
          {messages.map(msg => {
            const isMe = msg.sender_id === currentUser.id;
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl ${isMe ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                  style={{
                    background: isMe ? 'hsl(var(--theme-accent))' : 'hsl(var(--secondary))',
                    color: isMe ? 'hsl(var(--theme-accent-fg))' : 'hsl(var(--foreground))',
                  }}>
                  {msg.message_type === 'system' ? (
                    <p className="text-xs italic opacity-70">{msg.content}</p>
                  ) : (
                    <>
                      <p className="text-sm leading-relaxed">{msg.content}</p>
                      <p className="text-[10px] opacity-60 mt-0.5 text-right">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </>
                  )}
                </div>
              </motion.div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input — sits above bottom nav (nav is ~56px + safe area) */}
        <div className="flex gap-2 px-4 py-3 border-t border-border flex-shrink-0 pb-20">
          <input
            className="flex-1 bg-input border border-border rounded-full px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Message…"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          />
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={sendMessage}
            disabled={sending || !text.trim()}
            className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40"
            style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
          >
            <Send size={16} />
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-2xl font-bold font-heading">Messages</h1>
        <p className="text-sm text-muted-foreground mt-1">Your accountability chats</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-2">
        {partnerships.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <p className="text-4xl">💬</p>
            <p className="font-semibold text-center">No conversations yet</p>
            <p className="text-sm text-muted-foreground text-center">Form a partnership on your Home screen to start chatting.</p>
          </div>
        ) : (
          partnerships.map(p => {
            const partnerId = p.user_a_id === currentUser.id ? p.user_b_id : p.user_a_id;
            const partnerName = p.user_a_id === currentUser.id ? p.user_b_name : p.user_a_name;
            const partnerProfile = partnerProfiles[partnerId];
            const unread = unreadCounts[p.id] || 0;

            return (
              <motion.button
                key={p.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => setSelectedPartnership(p)}
                className="w-full flex items-center gap-3 p-4 card-brutal text-left"
              >
                <Avatar profile={partnerProfile} size="sm" noAutoFlip />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">{partnerName}</p>
                  <p className="text-xs text-muted-foreground truncate">
            {p.status === 'negotiating' ? '📋 Negotiating terms' : 'Tap to open chat'}
          </p>
                </div>
                {unread > 0 && (
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                    {unread}
                  </span>
                )}
              </motion.button>
            );
          })
        )}
      </div>
    </div>
  );
}