import React, { useState, useEffect, useRef, lazy, Suspense, useCallback } from 'react';
import { api, supabase } from '@/api/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import Avatar from '@/components/Avatar';
const ChatPicker = lazy(() => import('@/components/ChatPicker'));
import { Send, ArrowLeft, Pencil, Trash2, Check, X as XIcon, Smile } from 'lucide-react';
import { haptic } from '@/lib/haptic';

function formatTime(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short' });
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Chat({ currentUser, profile, onTabChange }) {
  const [partnerships, setPartnerships] = useState([]);
  const [partnerProfiles, setPartnerProfiles] = useState({});
  const [selectedPartnership, setSelectedPartnership] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [lastActivity, setLastActivity] = useState({});
  const [activeMessageId, setActiveMessageId] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState('');
  const [typingPartners, setTypingPartners] = useState({});
  const [showPicker, setShowPicker] = useState(false);
  const bottomRef = useRef(null);
  const pickerRef = useRef(null);
  const selectedPartnershipRef = useRef(null);
  const typingChannelsRef = useRef({});
  const typingTimersRef = useRef({});
  const typingThrottleRef = useRef(null);
  const longPressTimer = useRef(null);
  const longPressActivated = useRef(false);

  // Keep a mutable ref in sync so the global ChatMessage subscription (which only
  // mounts once on [currentUser]) can read the current chat without being re-subscribed.
  useEffect(() => { selectedPartnershipRef.current = selectedPartnership; }, [selectedPartnership]);

  useEffect(() => {
    if (!currentUser) return;
    loadPartnerships();
    const partnershipUnsub = api.entities.Partnership.subscribe(() => loadPartnerships());

    // Update the list view in real-time when any new message arrives
    const msgUnsub = api.entities.ChatMessage.subscribe(async event => {
      if (!event.data?.partnership_id) return;
      const pid = event.data.partnership_id;

      if (event.type === 'insert') {
        setLastActivity(prev => ({
          ...prev,
          [pid]: { time: event.data.created_at, text: event.data.content, senderId: event.data.sender_id, msgType: event.data.message_type },
        }));
        if (
          event.data.sender_id !== currentUser.id &&
          selectedPartnershipRef.current?.id !== pid
        ) {
          setUnreadCounts(prev => ({ ...prev, [pid]: (prev[pid] || 0) + 1 }));
        }
      } else if (event.type === 'update' && event.data.is_deleted) {
        // Soft-deleted message — re-fetch to find the new latest non-deleted message
        const msgs = await api.entities.ChatMessage.filter({ partnership_id: pid }, '-created_at', 50);
        const latest = msgs.find(m => !m.is_deleted);
        setLastActivity(prev => ({
          ...prev,
          [pid]: latest
            ? { time: latest.created_at, text: latest.content, senderId: latest.sender_id, msgType: latest.message_type }
            : null,
        }));
      }
    });

    return () => { partnershipUnsub(); msgUnsub(); };
  }, [currentUser]);

  useEffect(() => {
    Object.values(typingChannelsRef.current).forEach(ch => supabase.removeChannel(ch));
    typingChannelsRef.current = {};
    Object.values(typingTimersRef.current).forEach(clearTimeout);
    typingTimersRef.current = {};

    partnerships.forEach(p => {
      const partnerId = p.user_a_id === currentUser.id ? p.user_b_id : p.user_a_id;

      const ch = supabase
        .channel(`typing-${p.id}`)
        .on('presence', { event: 'sync' }, () => {
          const state = ch.presenceState();
          const partnerTyping = Object.values(state)
            .flat()
            .some(entry => entry.user_id === partnerId && entry.isTyping);
          setTypingPartners(prev => ({ ...prev, [p.id]: partnerTyping }));
        })
        .subscribe();

      typingChannelsRef.current[p.id] = ch;
    });

    return () => {
      Object.values(typingChannelsRef.current).forEach(ch => supabase.removeChannel(ch));
      typingChannelsRef.current = {};
      Object.values(typingTimersRef.current).forEach(clearTimeout);
      typingTimersRef.current = {};
    };
  }, [partnerships]);

  useEffect(() => {
    if (!selectedPartnership) return;
    const pid = selectedPartnership.id;
    setMessages([]);
    loadMessages(pid);

    const channel = supabase
      .channel(`chat-${pid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages', filter: `partnership_id=eq.${pid}` },
        payload => {
          const type = payload.eventType;
          const data = type === 'DELETE' ? payload.old : payload.new;

          if (type === 'INSERT' && data.sender_id !== currentUser.id) {
            // Advance read position so unread count stays at zero while the chat is open
            supabase
              .from('partnership_read_positions')
              .upsert(
                { partnership_id: pid, user_id: currentUser.id, last_read_at: new Date().toISOString() },
                { onConflict: 'partnership_id,user_id' }
              )
              .catch(() => {});
          }

          setMessages(prev => {
            if (type === 'INSERT') {
              const exists = prev.some(m => m.id === data.id);
              if (exists) return prev.map(m => m.id === data.id ? data : m);
              return [...prev, data];
            }
            if (type === 'UPDATE') return prev.map(m => m.id === data.id ? data : m);
            if (type === 'DELETE') return prev.filter(m => m.id !== data?.id);
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      // Zero out the unread count for this chat when leaving so the dot clears
      // immediately without waiting for a DB round-trip.
      setUnreadCounts(prev => ({ ...prev, [pid]: 0 }));
    };
  }, [selectedPartnership]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadPartnerships() {
    try {
      const { data: myPartnerships = [] } = await supabase
        .from('partnerships')
        .select('*')
        .or(`user_a_id.eq.${currentUser.id},user_b_id.eq.${currentUser.id}`)
        .in('status', ['active', 'negotiating']);
      setPartnerships(myPartnerships);

      const partnerIds = myPartnerships.map(p =>
        p.user_a_id === currentUser.id ? p.user_b_id : p.user_a_id
      );
      const { data: profileRows = [] } = await supabase
        .from('user_profiles')
        .select('*')
        .in('user_id', partnerIds);
      const profileMap = {};
      profileRows.forEach(pr => { profileMap[pr.user_id] = pr; });
      if (profile) profileMap[currentUser.id] = profile;
      setPartnerProfiles(profileMap);

      if (!myPartnerships.length) return;
      const partnershipIds = myPartnerships.map(p => p.id);

      // Unread counts via RPC — one round trip for all partnerships
      const { data: counts = [] } = await supabase.rpc('get_unread_counts', {
        p_partnership_ids: partnershipIds,
        p_user_id: currentUser.id,
      });
      const unread = {};
      counts.forEach(row => { unread[row.partnership_id] = Number(row.unread_count); });
      setUnreadCounts(unread);

      // Last non-deleted message per partnership — one query, group client-side
      const { data: recentMsgs = [] } = await supabase
        .from('chat_messages')
        .select('partnership_id, content, created_at, sender_id, message_type')
        .in('partnership_id', partnershipIds)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(50);

      const activity = {};
      recentMsgs.forEach(m => {
        if (!activity[m.partnership_id]) {
          activity[m.partnership_id] = {
            time: m.created_at,
            text: m.content,
            senderId: m.sender_id,
            msgType: m.message_type,
          };
        }
      });
      setLastActivity(activity);
    } catch (err) {
      console.error('Failed to load partnerships:', err);
    }
  }

  async function loadMessages(partnershipId) {
    setLoadingMessages(true);
    try {
      const msgs = await api.entities.ChatMessage.filter({ partnership_id: partnershipId }, 'created_at', 100);
      setMessages(msgs);
      // Single upsert marks this chat as fully read — replaces N individual read_by updates
      await supabase
        .from('partnership_read_positions')
        .upsert(
          { partnership_id: partnershipId, user_id: currentUser.id, last_read_at: new Date().toISOString() },
          { onConflict: 'partnership_id,user_id' }
        );
      setUnreadCounts(prev => ({ ...prev, [partnershipId]: 0 }));
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }

  async function saveEdit(msg) {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === msg.content) { setEditingMessageId(null); return; }
    await api.entities.ChatMessage.update(msg.id, { content: trimmed });
    setEditingMessageId(null);
  }

  async function deleteMessage(msg) {
    setActiveMessageId(null);
    await api.entities.ChatMessage.update(msg.id, { is_deleted: true });
  }

  const handleMsgPointerDown = useCallback((msgId, canAct) => {
    if (!canAct) return;
    longPressActivated.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressActivated.current = true;
      setActiveMessageId(prev => prev === msgId ? null : msgId);
      haptic([30, 15, 50]);
    }, 480);
  }, []);

  const handleMsgPointerUp = useCallback(() => {
    clearTimeout(longPressTimer.current);
  }, []);

  const handleMsgClick = useCallback((msgId, canAct) => {
    if (longPressActivated.current) { longPressActivated.current = false; return; }
    if (canAct) setActiveMessageId(prev => prev === msgId ? null : msgId);
  }, []);

  useEffect(() => {
    if (!showPicker) return;
    function onMouseDown(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [showPicker]);

  async function sendMedia(previewUrl, fullUrl, type) {
    if (!selectedPartnership) return;
    setShowPicker(false);
    await api.entities.ChatMessage.create({
      partnership_id: selectedPartnership.id,
      sender_id: currentUser.id,
      sender_name: profile?.display_name || currentUser.full_name,
      content: fullUrl || previewUrl,
      message_type: type,
    });
  }

  async function sendMessage() {
    if (!text.trim() || !selectedPartnership) return;
    haptic([10]);
    setSending(true);
    const content = text.trim();
    setText('');
    clearTimeout(typingThrottleRef.current);
    const ch = typingChannelsRef.current[selectedPartnership.id];
    if (ch) ch.track({ user_id: currentUser.id, isTyping: false });
    try {
      const msg = await api.entities.ChatMessage.create({
        partnership_id: selectedPartnership.id,
        sender_id: currentUser.id,
        sender_name: profile?.display_name || currentUser.full_name,
        content,
        message_type: 'text',
      });
      // Only add if not already added by the subscription (dedupe by id)
      setMessages(prev => {
        const exists = prev.some(m => m.id === msg.id);
        if (exists) return prev;
        return [...prev, msg];
      });
    } catch (err) {
      setText(content); // restore text so user doesn't lose their message
      console.error('Failed to send message:', err);
    }
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
            <div className="space-y-3 animate-pulse pt-2">
              {[
                { isMe: false, w: '52%' },
                { isMe: true,  w: '38%' },
                { isMe: false, w: '64%' },
                { isMe: true,  w: '44%' },
                { isMe: false, w: '56%' },
              ].map((b, i) => (
                <div key={i} className={`flex ${b.isMe ? 'justify-end' : 'justify-start'}`}>
                  {!b.isMe && <div className="w-7 h-7 rounded-full bg-muted flex-shrink-0 mr-2 mt-1" />}
                  <div
                    className={`h-10 rounded-2xl ${b.isMe ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                    style={{
                      width: b.w,
                      background: b.isMe ? 'hsl(var(--theme-accent) / 0.25)' : 'hsl(var(--muted))',
                    }}
                  />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <p className="text-4xl">💬</p>
              <p className="text-sm text-muted-foreground text-center">Chat is open. Say something →</p>
            </div>
          ) : null}
          {messages.map(msg => {
            const isMe = msg.sender_id === currentUser.id;
            const ageMs = Date.now() - new Date(msg.created_at).getTime();
            const canEdit = isMe && !msg.is_deleted && msg.message_type === 'text' && ageMs < 5 * 60 * 1000;
            const canDelete = isMe && !msg.is_deleted && msg.message_type !== 'system' && ageMs < 30 * 60 * 1000;
            const showActions = activeMessageId === msg.id && !editingMessageId;
            const isEditing = editingMessageId === msg.id;

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                {(msg.message_type === 'gif' || msg.message_type === 'sticker') && !msg.is_deleted ? (
                  <div
                    className={`max-w-[220px] rounded-2xl overflow-hidden ${isMe ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                    style={{ cursor: canDelete ? 'pointer' : 'default', userSelect: 'none' }}
                    onPointerDown={() => handleMsgPointerDown(msg.id, canDelete)}
                    onPointerUp={handleMsgPointerUp}
                    onPointerCancel={handleMsgPointerUp}
                    onClick={() => handleMsgClick(msg.id, canDelete)}
                  >
                    <img
                      src={msg.content}
                      alt={msg.message_type}
                      className="w-full"
                      style={{ maxHeight: msg.message_type === 'sticker' ? 120 : 160, objectFit: 'cover', display: 'block' }}
                      loading="lazy"
                    />
                  </div>
                ) : (
                  <div
                    className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl ${isMe ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                    style={{
                      background: isMe ? 'hsl(var(--theme-accent))' : 'hsl(var(--secondary))',
                      color: isMe ? 'hsl(var(--theme-accent-fg))' : 'hsl(var(--foreground))',
                      cursor: (canEdit || canDelete) ? 'pointer' : 'default',
                      userSelect: 'none',
                    }}
                    onPointerDown={() => handleMsgPointerDown(msg.id, canEdit || canDelete)}
                    onPointerUp={handleMsgPointerUp}
                    onPointerCancel={handleMsgPointerUp}
                    onClick={() => handleMsgClick(msg.id, canEdit || canDelete)}
                  >
                    {msg.is_deleted ? (
                      <p className="text-xs italic opacity-50">Message deleted</p>
                    ) : msg.message_type === 'system' ? (
                      <p className="text-xs italic opacity-70">{msg.content}</p>
                    ) : isEditing ? (
                      <div className="flex items-center gap-2 min-w-[160px]">
                        <input
                          autoFocus
                          className="bg-transparent border-none outline-none text-sm flex-1 min-w-0"
                          style={{ color: 'inherit' }}
                          value={editText}
                          onChange={e => setEditText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveEdit(msg);
                            if (e.key === 'Escape') setEditingMessageId(null);
                          }}
                        />
                        <button onClick={e => { e.stopPropagation(); saveEdit(msg); }} className="opacity-80 flex-shrink-0">
                          <Check size={14} />
                        </button>
                        <button onClick={e => { e.stopPropagation(); setEditingMessageId(null); }} className="opacity-80 flex-shrink-0">
                          <XIcon size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                        <p className="text-[10px] opacity-60 mt-0.5 text-right">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </>
                    )}
                  </div>
                )}
                {showActions && (
                  <div className="flex gap-1.5 mt-1">
                    {canEdit && (
                      <button
                        onClick={() => { setEditText(msg.content); setEditingMessageId(msg.id); setActiveMessageId(null); }}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground bg-secondary px-2.5 py-1 rounded-full"
                      >
                        <Pencil size={10} /> Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => deleteMessage(msg)}
                        className="flex items-center gap-1 text-[11px] text-destructive px-2.5 py-1 rounded-full"
                        style={{ background: 'hsl(var(--destructive) / 0.1)' }}
                      >
                        <Trash2 size={10} /> Delete
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
          {typingPartners[selectedPartnership.id] && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start"
            >
              <div className="px-3.5 py-3 rounded-2xl rounded-bl-sm bg-secondary">
                <div className="flex gap-1 items-center">
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-muted-foreground"
                      animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input — sits above bottom nav (nav is ~56px + safe area) */}
        <div className="relative flex-shrink-0 border-t border-border" ref={pickerRef}>
          <AnimatePresence>
            {showPicker && (
              <Suspense fallback={null}>
                <ChatPicker
                  onEmojiSelect={emoji => { setText(prev => prev + emoji); setShowPicker(false); }}
                  onMediaSelect={sendMedia}
                  currentUser={currentUser}
                />
              </Suspense>
            )}
          </AnimatePresence>
          <div className="flex items-center gap-2 px-4 py-3 pb-20">
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => setShowPicker(p => !p)}
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={showPicker
                ? { background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }
                : { background: 'hsl(var(--secondary))', color: 'hsl(var(--muted-foreground))' }
              }
            >
              <Smile size={18} />
            </motion.button>
            <input
              className="flex-1 bg-input border border-border rounded-full px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Message…"
              value={text}
              onChange={e => {
                setText(e.target.value);
                const ch = typingChannelsRef.current[selectedPartnership.id];
                if (!ch) return;
                if (e.target.value) {
                  ch.track({ user_id: currentUser.id, isTyping: true });
                  clearTimeout(typingThrottleRef.current);
                  typingThrottleRef.current = setTimeout(() => {
                    ch.track({ user_id: currentUser.id, isTyping: false });
                  }, 3000);
                } else {
                  clearTimeout(typingThrottleRef.current);
                  ch.track({ user_id: currentUser.id, isTyping: false });
                }
              }}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              onFocus={() => setShowPicker(false)}
            />
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={sendMessage}
              disabled={sending || !text.trim()}
              className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40 flex-shrink-0"
              style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
            >
              <Send size={16} />
            </motion.button>
          </div>
        </div>
      </div>
    );
  }

  const sortedPartnerships = [...partnerships].sort((a, b) => {
    const timeA = lastActivity[a.id]?.time || a.created_at || '';
    const timeB = lastActivity[b.id]?.time || b.created_at || '';
    return timeB > timeA ? 1 : -1;
  });

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-2xl font-bold font-heading">Messages</h1>
        <p className="text-sm text-muted-foreground mt-1">Your accountability chats</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-2">
        {sortedPartnerships.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-6">
            <motion.span
              className="text-5xl"
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              💬
            </motion.span>
            <div className="space-y-1">
              <p className="font-semibold">No conversations yet</p>
              <p className="text-sm text-muted-foreground">Form a partnership first — then you'll be able to message your accountability partner here.</p>
            </div>
            {onTabChange && (
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => onTabChange('home')}
                animate={{ boxShadow: ['0 0 0 0px hsl(var(--theme-accent)/0.4)', '0 0 0 7px hsl(var(--theme-accent)/0)', '0 0 0 0px hsl(var(--theme-accent)/0.4)'] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm"
                style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
              >
                Find a partner on Home →
              </motion.button>
            )}
          </div>
        ) : (
          sortedPartnerships.map(p => {
            const partnerId = p.user_a_id === currentUser.id ? p.user_b_id : p.user_a_id;
            const partnerName = p.user_a_id === currentUser.id ? p.user_b_name : p.user_a_name;
            const partnerProfile = partnerProfiles[partnerId];
            const unread = unreadCounts[p.id] || 0;
            const activity = lastActivity[p.id];
            const isTyping = !!typingPartners[p.id] && p.status !== 'negotiating';
            const activityText = activity
              ? activity.msgType === 'gif' ? '🎞 GIF'
              : activity.msgType === 'sticker' ? '✨ Sticker'
              : activity.senderId === currentUser.id ? `You: ${activity.text}` : activity.text
              : null;
            const preview = isTyping
              ? `${partnerName.split(' ')[0]} is typing…`
              : p.status === 'negotiating'
                ? '📋 Negotiating terms'
                : activityText || 'Tap to open chat';

            return (
              <motion.button
                key={p.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => setSelectedPartnership(p)}
                className="w-full flex items-center gap-3 p-4 card-brutal text-left"
              >
                <Avatar profile={partnerProfile} size="sm" noAutoFlip />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${unread > 0 ? 'font-bold' : 'font-semibold'}`}>{partnerName}</p>
                    {activity?.time && (
                      <p className="text-[11px] text-muted-foreground flex-shrink-0">{formatTime(activity.time)}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p
                      className={`text-xs truncate ${isTyping ? 'font-medium' : unread > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
                      style={isTyping ? { color: 'hsl(var(--theme-accent))' } : undefined}
                    >
                      {preview}
                    </p>
                    {unread > 0 && (
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: 'hsl(var(--theme-accent))' }}
                      />
                    )}
                  </div>
                </div>
              </motion.button>
            );
          })
        )}
      </div>
    </div>
  );
}