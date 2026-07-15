import React, { useState, useEffect, useRef, lazy, Suspense, useCallback } from 'react';
import { api, supabase } from '@/api/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import Avatar from '@/components/Avatar';
import PostImage from '@/components/PostImage';
const ChatPicker = lazy(() => import('@/components/ChatPicker'));
import { Send, ArrowLeft, Pencil, Trash2, Check, X as XIcon, Smile, Star, CornerUpLeft, Copy, MoreVertical } from 'lucide-react';
import { haptic } from '@/lib/haptic';
import { useToast, Toast } from '@/components/Toast';

function formatTime(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short' });
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Chat({ currentUser, profile, onTabChange, navIntent, onClearNavIntent }) {
  const [partnerships, setPartnerships] = useState([]);
  const [loadingPartnerships, setLoadingPartnerships] = useState(true);
  const [partnerProfiles, setPartnerProfiles] = useState({});
  const [selectedPartnership, setSelectedPartnership] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [lastActivity, setLastActivity] = useState({});
  const [activeMessageId, setActiveMessageId] = useState(null);
  const [savingSticker, setSavingSticker] = useState(null);
  const [stickerSavedMsg, setStickerSavedMsg] = useState(false);
  const [partnerLastReadAt, setPartnerLastReadAt] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState('');
  // Reply
  const [replyingTo, setReplyingTo] = useState(null);
  // Delete-for-me (client-side hidden set)
  const [hiddenMsgIds, setHiddenMsgIds] = useState(new Set());
  // Sticker preview
  const [stickerPreview, setStickerPreview] = useState(null);
  const [mineFilenames, setMineFilenames] = useState(new Set());
  // Per-message ⋮ dropdown
  const [menuMsgId, setMenuMsgId] = useState(null);
  // Show delete submenu in action bar
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  // Copied feedback
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const [typingPartners, setTypingPartners] = useState({});
  const [showPicker, setShowPicker] = useState(false);
  const { message: toastMessage, variant: toastVariant, show: showToast } = useToast();
  const bottomRef = useRef(null);
  const pickerRef = useRef(null);
  const selectedPartnershipRef = useRef(null);
  const msgRefs = useRef({});
  const typingChannelsRef = useRef({});
  const typingTimersRef = useRef({});
  const typingThrottleRef = useRef(null);
  const longPressTimer = useRef(null);
  const longPressActivated = useRef(false);

  // Keep a mutable ref in sync so the global ChatMessage subscription (which only
  // mounts once on [currentUser]) can read the current chat without being re-subscribed.
  useEffect(() => { selectedPartnershipRef.current = selectedPartnership; }, [selectedPartnership]);

  useEffect(() => {
    if (!navIntent || navIntent.action !== 'openChat' || loadingPartnerships) return;
    const p = partnerships.find(p =>
      p.user_a_id === navIntent.fromUserId || p.user_b_id === navIntent.fromUserId
    );
    if (p) setSelectedPartnership(p);
    onClearNavIntent?.();
  }, [navIntent, loadingPartnerships, partnerships]);

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
    const pId = selectedPartnership.user_a_id === currentUser.id
      ? selectedPartnership.user_b_id
      : selectedPartnership.user_a_id;
    setMessages([]);
    setPartnerLastReadAt(null);
    setReplyingTo(null);
    loadMessages(pid, pId);
    loadMineFilenames();

    const channel = supabase
      .channel(`chat-${pid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages', filter: `partnership_id=eq.${pid}` },
        payload => {
          const type = payload.eventType;
          const data = type === 'DELETE' ? payload.old : payload.new;

          if (type === 'INSERT' && data.sender_id !== currentUser.id) {
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'partnership_read_positions', filter: `partnership_id=eq.${pid}` },
        payload => {
          if (payload.new?.user_id === pId) {
            setPartnerLastReadAt(payload.new.last_read_at);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      setUnreadCounts(prev => ({ ...prev, [pid]: 0 }));
    };
  }, [selectedPartnership]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadPartnerships() {
    setLoadingPartnerships(true);
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
    } finally {
      setLoadingPartnerships(false);
    }
  }

  async function loadMessages(partnershipId, partnerUserId) {
    setLoadingMessages(true);
    try {
      // Fetch newest-first so the 100-row limit captures recent history, then
      // reverse to chronological order — realtime inserts below assume ascending order.
      const msgs = await api.entities.ChatMessage.filter({ partnership_id: partnershipId }, '-created_at', 100);
      setMessages(msgs.slice().reverse());
      await supabase
        .from('partnership_read_positions')
        .upsert(
          { partnership_id: partnershipId, user_id: currentUser.id, last_read_at: new Date().toISOString() },
          { onConflict: 'partnership_id,user_id' }
        );
      setUnreadCounts(prev => ({ ...prev, [partnershipId]: 0 }));
      if (partnerUserId) {
        const { data: readPos } = await supabase
          .from('partnership_read_positions')
          .select('last_read_at')
          .eq('partnership_id', partnershipId)
          .eq('user_id', partnerUserId)
          .maybeSingle();
        setPartnerLastReadAt(readPos?.last_read_at || null);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }

  async function loadMineFilenames() {
    try {
      const { data } = await supabase.storage.from('uploads')
        .list(`stickers/${currentUser.id}`, { limit: 200 });
      setMineFilenames(new Set(
        (data || []).filter(f => f.name !== '.emptyFolderPlaceholder').map(f => f.name)
      ));
    } catch {}
  }

  function isStickerInMine(url) {
    const raw = decodeURIComponent(url.split('/').pop()?.split('?')[0] || '');
    if (mineFilenames.has(raw)) return true;
    return [...mineFilenames].some(n => n.endsWith('_' + raw) || raw.endsWith('_' + n));
  }

  function scrollToMessage(msgId) {
    msgRefs.current[msgId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function copyMessage(msg) {
    try { await navigator.clipboard.writeText(msg.content || ''); } catch {}
    setActiveMessageId(null);
    setMenuMsgId(null);
    setCopiedFeedback(true);
    setTimeout(() => setCopiedFeedback(false), 1800);
  }

  function deleteForMe(msg) {
    setActiveMessageId(null);
    setMenuMsgId(null);
    setHiddenMsgIds(prev => new Set([...prev, msg.id]));
  }

  async function addStickerToMineWeb(url) {
    setSavingSticker(url);
    try {
      const marker = '/object/public/uploads/';
      const idx = url.indexOf(marker);
      if (idx === -1) throw new Error('Cannot save this sticker');
      const sourcePath = url.slice(idx + marker.length);
      const filename = sourcePath.split('/').pop();
      const destName = `${Date.now()}_${filename}`;
      const { error } = await supabase.storage.from('uploads').copy(sourcePath, `stickers/${currentUser.id}/${destName}`);
      if (error) throw error;
      setMineFilenames(prev => new Set([...prev, destName]));
      setStickerPreview(null);
      setStickerSavedMsg(true);
      setTimeout(() => setStickerSavedMsg(false), 2500);
    } catch (err) {
      console.error('Failed to save sticker:', err);
    }
    setSavingSticker(null);
  }

  async function removeFromMineWeb(url) {
    const raw = decodeURIComponent(url.split('/').pop()?.split('?')[0] || '');
    const match = mineFilenames.has(raw) ? raw
      : [...mineFilenames].find(n => n.endsWith('_' + raw) || raw.endsWith('_' + n));
    if (!match) { setStickerPreview(null); return; }
    try {
      // This file's public URL is embedded directly in any chat message that ever sent
      // it (including this one) — deleting it breaks it in every conversation it was
      // used in, forever. Block it if it's actually referenced by a message.
      const { count, error: checkError } = await supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('content', url);
      if (checkError) throw checkError;
      if (count > 0) {
        window.alert(`This sticker has been sent in ${count} chat message${count === 1 ? '' : 's'} — deleting it would break it in those conversations, so it can't be removed.`);
        return;
      }
      await supabase.storage.from('uploads').remove([`stickers/${currentUser.id}/${match}`]);
      setMineFilenames(prev => { const s = new Set(prev); s.delete(match); return s; });
      setStickerPreview(null);
    } catch (err) {
      console.error('Failed to remove sticker:', err);
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

  async function saveStickerToMine(stickerUrl) {
    setSavingSticker(stickerUrl);
    try {
      const marker = '/object/public/uploads/';
      const idx = stickerUrl.indexOf(marker);
      if (idx === -1) throw new Error('Cannot save this sticker');
      const sourcePath = stickerUrl.slice(idx + marker.length);
      const filename = sourcePath.split('/').pop();
      const destPath = `stickers/${currentUser.id}/${Date.now()}_${filename}`;
      const { error } = await supabase.storage.from('uploads').copy(sourcePath, destPath);
      if (error) throw error;
      setActiveMessageId(null);
      setStickerSavedMsg(true);
      setTimeout(() => setStickerSavedMsg(false), 2500);
    } catch (err) {
      console.error('Failed to save sticker:', err);
    }
    setSavingSticker(null);
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

  // Close ⋮ dropdown when clicking elsewhere
  useEffect(() => {
    if (!menuMsgId) return;
    function onMouseDown() { setMenuMsgId(null); }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [menuMsgId]);

  async function sendMedia(previewUrl, fullUrl, type) {
    if (!selectedPartnership) return;
    setShowPicker(false);
    const replySnapshot = replyingTo;
    setReplyingTo(null);
    try {
      await api.entities.ChatMessage.create({
        partnership_id: selectedPartnership.id,
        sender_id: currentUser.id,
        sender_name: profile?.display_name || currentUser.full_name,
        content: fullUrl || previewUrl,
        message_type: type,
        reply_to_id: replySnapshot?.id || null,
      });
    } catch (err) {
      setReplyingTo(replySnapshot); // restore so the user doesn't lose their reply context
      console.error('Failed to send media message:', err);
      showToast('Failed to send — please try again', 'error');
    }
  }

  async function sendMessage() {
    if (!text.trim() || !selectedPartnership) return;
    haptic([10]);
    setSending(true);
    const content = text.trim();
    const replySnapshot = replyingTo;
    setText('');
    setReplyingTo(null);
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
        reply_to_id: replySnapshot?.id || null,
      });
      // Only add if not already added by the subscription (dedupe by id)
      setMessages(prev => {
        const exists = prev.some(m => m.id === msg.id);
        if (exists) return prev;
        return [...prev, msg];
      });
    } catch (err) {
      setText(content); // restore text so user doesn't lose their message
      setReplyingTo(replySnapshot); // restore so the user doesn't lose their reply context
      console.error('Failed to send message:', err);
      showToast('Failed to send — please try again', 'error');
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
      <div className="flex flex-col h-full bg-background" data-no-swipe-nav>
        <Toast message={toastMessage} variant={toastVariant} />
        {stickerSavedMsg && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-4 py-2 rounded-full bg-yellow-500/20 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 text-sm font-semibold shadow-lg pointer-events-none">
            <Star size={13} /> Saved to Mine!
          </div>
        )}
        {copiedFeedback && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-4 py-2 rounded-full bg-secondary border border-border text-sm text-muted-foreground shadow-lg pointer-events-none">
            Copied to clipboard
          </div>
        )}

        {/* Sticker preview modal */}
        <AnimatePresence>
          {stickerPreview && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.85)' }}
              onClick={() => setStickerPreview(null)}
            >
              <motion.div
                initial={{ scale: 0.85 }} animate={{ scale: 1 }} exit={{ scale: 0.85 }}
                className="flex flex-col items-center gap-5 p-6"
                onClick={e => e.stopPropagation()}
              >
                <img src={stickerPreview.content} alt="sticker" style={{ width: 220, height: 220, objectFit: 'contain' }} />
                {isStickerInMine(stickerPreview.content) ? (
                  <button
                    onClick={() => removeFromMineWeb(stickerPreview.content)}
                    className="px-6 py-2.5 rounded-xl text-sm font-semibold border transition-colors"
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                  >
                    Remove from Mine
                  </button>
                ) : (
                  <button
                    onClick={() => addStickerToMineWeb(stickerPreview.content)}
                    disabled={!!savingSticker}
                    className="px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-opacity"
                    style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
                  >
                    {savingSticker ? '…' : 'Add to Mine ⭐'}
                  </button>
                )}
                <button onClick={() => setStickerPreview(null)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Close
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header — replaced by action bar when activeMessageId is set */}
        {activeMessageId && !editingMessageId ? (() => {
          const sm = messages.find(m => m.id === activeMessageId);
          if (!sm) return null;
          const smIsMe = sm.sender_id === currentUser.id;
          const smAge = Date.now() - new Date(sm.created_at).getTime();
          const smCanEdit = smIsMe && !sm.is_deleted && sm.message_type === 'text' && smAge < 5 * 60 * 1000;
          const smCanDelAll = smIsMe && !sm.is_deleted && smAge < 30 * 60 * 1000;
          const smCanReply = !sm.is_deleted && sm.message_type !== 'system';
          const smCanCopy = !sm.is_deleted && sm.message_type === 'text';
          return (
            <div className="flex items-center gap-2 px-3 py-3 border-b border-border flex-shrink-0">
              <button
                onClick={() => { setActiveMessageId(null); setShowDeleteMenu(false); }}
                className="p-2 rounded-full bg-secondary hover:opacity-75 transition-opacity"
              >
                <XIcon size={17} />
              </button>
              <span className="flex-1 text-sm font-semibold text-foreground ml-1">1 selected</span>
              {smCanReply && (
                <button onClick={() => { setReplyingTo(sm); setActiveMessageId(null); }}
                  className="p-2.5 rounded-full bg-secondary hover:opacity-75 transition-opacity" title="Reply">
                  <CornerUpLeft size={16} />
                </button>
              )}
              {smCanCopy && (
                <button onClick={() => copyMessage(sm)}
                  className="p-2.5 rounded-full bg-secondary hover:opacity-75 transition-opacity" title="Copy">
                  <Copy size={16} />
                </button>
              )}
              {smCanEdit && (
                <button onClick={() => { setEditText(sm.content); setEditingMessageId(sm.id); setActiveMessageId(null); }}
                  className="p-2.5 rounded-full bg-secondary hover:opacity-75 transition-opacity" title="Edit">
                  <Pencil size={16} />
                </button>
              )}
              {!showDeleteMenu ? (
                <button onClick={() => setShowDeleteMenu(true)}
                  className="p-2.5 rounded-full bg-secondary hover:opacity-75 transition-opacity" title="Delete"
                  style={{ color: 'hsl(var(--destructive))' }}>
                  <Trash2 size={16} />
                </button>
              ) : (
                <div className="flex gap-1.5">
                  {smCanDelAll && (
                    <button
                      onClick={async () => { const m = sm; setActiveMessageId(null); setShowDeleteMenu(false); await deleteMessage(m); }}
                      className="text-[11px] font-semibold px-2.5 py-1.5 rounded-full transition-opacity hover:opacity-80"
                      style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
                    >For All</button>
                  )}
                  <button
                    onClick={() => deleteForMe(sm)}
                    className="text-[11px] font-semibold px-2.5 py-1.5 rounded-full transition-opacity hover:opacity-80"
                    style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}
                  >For Me</button>
                </div>
              )}
            </div>
          );
        })() : (
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
        )}

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
          {messages.filter(msg => !hiddenMsgIds.has(msg.id)).map(msg => {
            const isMe = msg.sender_id === currentUser.id;
            const ageMs = Date.now() - new Date(msg.created_at).getTime();
            const canEdit = isMe && !msg.is_deleted && msg.message_type === 'text' && ageMs < 5 * 60 * 1000;
            const canDelete = isMe && !msg.is_deleted && msg.message_type !== 'system' && ageMs < 30 * 60 * 1000;
            const canSaveSticker = !isMe && (msg.message_type === 'sticker') && !msg.is_deleted;
            const canAct = canEdit || canDelete || canSaveSticker || (!msg.is_deleted && msg.message_type !== 'system');
            const showMenu = menuMsgId === msg.id;
            const isEditing = editingMessageId === msg.id;
            const isRead = isMe && !!partnerLastReadAt && new Date(msg.created_at) <= new Date(partnerLastReadAt);
            const replyTo = msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : null;

            return (
              <motion.div
                key={msg.id}
                ref={el => { msgRefs.current[msg.id] = el; }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group`}
                style={activeMessageId === msg.id ? { background: 'hsl(var(--theme-accent) / 0.06)', borderRadius: 12, margin: '0 -8px', padding: '2px 8px' } : {}}
                onContextMenu={e => { e.preventDefault(); if (canAct) { setActiveMessageId(msg.id); setShowDeleteMenu(false); } }}
              >
                {/* Reply-to reference */}
                {replyTo && !hiddenMsgIds.has(replyTo.id) && (
                  <button
                    onClick={() => scrollToMessage(replyTo.id)}
                    className={`max-w-[72%] text-left px-2.5 py-1.5 rounded-xl mb-1 border-l-2 transition-opacity hover:opacity-80`}
                    style={{ background: 'hsl(var(--theme-accent) / 0.07)', borderLeftColor: 'hsl(var(--theme-accent))' }}
                  >
                    <p className="text-[10px] font-semibold" style={{ color: 'hsl(var(--theme-accent))' }}>
                      {replyTo.sender_id === currentUser.id ? 'You' : partnerName}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {replyTo.message_type === 'sticker' || replyTo.message_type === 'gif' ? '✨ Sticker' : replyTo.content}
                    </p>
                  </button>
                )}

                {/* Sticker / GIF */}
                {(msg.message_type === 'gif' || msg.message_type === 'sticker') && !msg.is_deleted ? (
                  <>
                    <div
                      className={`relative max-w-[220px] rounded-2xl overflow-hidden ${isMe ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onPointerDown={() => handleMsgPointerDown(msg.id, canAct)}
                      onPointerUp={handleMsgPointerUp}
                      onPointerCancel={handleMsgPointerUp}
                      onClick={() => {
                        if (longPressActivated.current) { longPressActivated.current = false; return; }
                        setStickerPreview(msg);
                      }}
                    >
                      <PostImage
                        src={msg.content}
                        alt={msg.message_type}
                        className="w-full"
                        style={{ maxHeight: msg.message_type === 'sticker' ? 120 : 160, objectFit: 'cover', display: 'block' }}
                        loading="lazy"
                      />
                      {/* ⋮ button */}
                      {canAct && (
                        <button
                          onClick={e => { e.stopPropagation(); setMenuMsgId(prev => prev === msg.id ? null : msg.id); }}
                          className="absolute top-1 right-1 p-0.5 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
                        >
                          <MoreVertical size={13} color="white" />
                        </button>
                      )}
                    </div>
                    {isMe && (
                      <div className="flex items-center justify-end gap-0.5 mt-0.5 px-0.5">
                        <Check size={9} strokeWidth={3} style={{ color: 'hsl(var(--muted-foreground))', opacity: isRead ? 0.85 : 0.4 }} />
                        {isRead && <Check size={9} strokeWidth={3} style={{ color: 'hsl(var(--muted-foreground))', opacity: 0.85, marginLeft: -4 }} />}
                      </div>
                    )}
                  </>
                ) : (
                  /* Text / system bubble */
                  <div
                    className={`relative max-w-[78%] px-3.5 py-2.5 rounded-2xl ${isMe ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                    style={{
                      background: isMe ? 'hsl(var(--theme-accent))' : 'hsl(var(--secondary))',
                      color: isMe ? 'hsl(var(--theme-accent-fg))' : 'hsl(var(--foreground))',
                      cursor: canAct ? 'pointer' : 'default',
                      userSelect: 'none',
                    }}
                    onPointerDown={() => handleMsgPointerDown(msg.id, canAct)}
                    onPointerUp={handleMsgPointerUp}
                    onPointerCancel={handleMsgPointerUp}
                    onClick={() => handleMsgClick(msg.id, canAct)}
                  >
                    {/* ⋮ dropdown trigger */}
                    {canAct && !msg.is_deleted && msg.message_type !== 'system' && (
                      <button
                        onClick={e => { e.stopPropagation(); setMenuMsgId(prev => prev === msg.id ? null : msg.id); }}
                        className={`absolute top-1.5 ${isMe ? 'left-1.5' : 'right-1.5'} p-0.5 rounded-full opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity`}
                        style={{ color: isMe ? 'hsl(var(--theme-accent-fg))' : 'hsl(var(--foreground))' }}
                      >
                        <MoreVertical size={13} />
                      </button>
                    )}
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
                        <div className="flex items-center justify-end gap-0.5 mt-0.5">
                          <span className="text-[10px] opacity-60">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {isMe && (
                            <>
                              <Check size={9} strokeWidth={3} style={{ opacity: isRead ? 0.85 : 0.4 }} />
                              {isRead && <Check size={9} strokeWidth={3} style={{ opacity: 0.85, marginLeft: -4 }} />}
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ⋮ context dropdown menu */}
                {showMenu && (
                  <div
                    className={`flex flex-col gap-0.5 mt-1 min-w-[140px] rounded-xl border border-border shadow-lg overflow-hidden z-20`}
                    style={{ background: 'hsl(var(--popover))' }}
                    onClick={e => e.stopPropagation()}
                  >
                    {!msg.is_deleted && msg.message_type !== 'system' && (
                      <button
                        onClick={() => { setReplyingTo(msg); setMenuMsgId(null); }}
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors text-left"
                      >
                        <CornerUpLeft size={13} /> Reply
                      </button>
                    )}
                    {!msg.is_deleted && msg.message_type === 'text' && (
                      <button
                        onClick={() => copyMessage(msg)}
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors text-left"
                      >
                        <Copy size={13} /> Copy
                      </button>
                    )}
                    {canSaveSticker && (
                      <button
                        onClick={() => { setStickerPreview(msg); setMenuMsgId(null); }}
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors text-left"
                        style={{ color: '#ca8a04' }}
                      >
                        <Star size={13} /> Save to Mine
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => { setEditText(msg.content); setEditingMessageId(msg.id); setMenuMsgId(null); }}
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors text-left"
                      >
                        <Pencil size={13} /> Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => { deleteMessage(msg); setMenuMsgId(null); }}
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors text-left text-destructive"
                      >
                        <Trash2 size={13} /> Delete for All
                      </button>
                    )}
                    <button
                      onClick={() => deleteForMe(msg)}
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors text-left text-destructive"
                    >
                      <Trash2 size={13} /> Delete for Me
                    </button>
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

        {/* Reply composer */}
        {replyingTo && (
          <div className="flex items-center gap-2 px-4 py-2 border-t border-border flex-shrink-0"
            style={{ borderLeftWidth: 3, borderLeftColor: 'hsl(var(--theme-accent))' }}>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold" style={{ color: 'hsl(var(--theme-accent))' }}>
                {replyingTo.sender_id === currentUser.id ? 'Replying to yourself' : `Replying to ${partnerName}`}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {replyingTo.message_type === 'sticker' || replyingTo.message_type === 'gif'
                  ? '✨ Sticker' : replyingTo.content}
              </p>
            </div>
            <button onClick={() => setReplyingTo(null)} className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
              <XIcon size={14} />
            </button>
          </div>
        )}

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
        {loadingPartnerships ? (
          <div className="space-y-3 pt-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border animate-pulse">
                <div className="w-11 h-11 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-muted rounded w-32" />
                  <div className="h-2.5 bg-muted rounded w-48" />
                </div>
                <div className="h-2.5 bg-muted rounded w-8" />
              </div>
            ))}
          </div>
        ) : sortedPartnerships.length === 0 ? (
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