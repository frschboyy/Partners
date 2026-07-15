import React, { useState, useEffect, useRef, lazy, Suspense, useCallback } from 'react';
import { api, supabase } from '@/api/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import Avatar from '@/components/Avatar';
import PostImage from '@/components/PostImage';
const ChatPicker = lazy(() => import('@/components/ChatPicker'));
const ReactionEmojiPicker = lazy(() => import('@/components/ReactionEmojiPicker'));
import { Send, ArrowLeft, Pencil, Trash2, Check, X as XIcon, Smile, Star, CornerUpLeft, Copy, Plus, ChevronDown, ImageOff } from 'lucide-react';
import { haptic } from '@/lib/haptic';
import { useToast, Toast } from '@/components/Toast';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '👏'];
const STORAGE_URL_MARKER = '/object/public/uploads/';

function guessImageExt(blobType) {
  if (blobType.includes('gif')) return 'gif';
  if (blobType.includes('webp')) return 'webp';
  if (blobType.includes('png')) return 'png';
  return 'jpg';
}

// A sticker/GIF hotlinked from an external CDN (pre-dating the re-host-at-send-time
// fix) can have its content pulled by the source later — the URL keeps resolving,
// but to a small placeholder graphic instead of a 404, so PostImage's onError never
// fires. Flagging anything suspiciously tiny as unavailable turns that confusing
// silent swap into a clear, honest message instead. Only applied to external URLs —
// anything already in our own storage is trusted outright.
function ChatMediaBubble({ src, alt, maxHeight, isExternal }) {
  const [unavailable, setUnavailable] = useState(false);

  if (unavailable) {
    return (
      <div
        className="w-full flex flex-col items-center justify-center gap-1 py-6 text-muted-foreground"
        style={{ minHeight: 80 }}
        onClick={e => e.stopPropagation()}
      >
        <ImageOff size={20} />
        <span className="text-xs">{alt === 'sticker' ? 'Sticker' : 'GIF'} unavailable</span>
      </div>
    );
  }

  return (
    <PostImage
      src={src}
      alt={alt}
      className="w-full"
      style={{ maxHeight, objectFit: 'cover', display: 'block' }}
      loading="lazy"
      onLoad={e => {
        if (isExternal && (e.target.naturalWidth < 60 || e.target.naturalHeight < 60)) {
          setUnavailable(true);
        }
      }}
    />
  );
}

const REACTION_BAR_HEIGHT = 48;
const REACTION_GAP = 10;
const MENU_GAP = 8;
const MENU_ITEM_HEIGHT = 46;
const HEADER_SAFE_TOP = 76;
const COMPOSER_SAFE_BOTTOM = 100;
const SWIPE_REPLY_THRESHOLD = 60;
const SWIPE_REPLY_MAX = 72;

// Positions the floating reaction bar + context menu around a message's measured
// rect — below the message when there's room, flipping both above it otherwise,
// always clamped to stay clear of the fixed header/composer and screen edges.
function getOverlayLayout(rect, itemCount) {
  if (!rect) return null;
  const vh = window.innerHeight;
  const menuHeight = itemCount * MENU_ITEM_HEIGHT + 8;

  const menuTopBelow = rect.bottom + MENU_GAP;
  const fitsBelow = menuTopBelow + menuHeight <= vh - COMPOSER_SAFE_BOTTOM;

  if (fitsBelow) {
    return {
      menuTop: menuTopBelow,
      reactionTop: Math.max(rect.top - REACTION_GAP - REACTION_BAR_HEIGHT, HEADER_SAFE_TOP),
      placement: 'below',
    };
  }

  const menuTopAbove = Math.max(rect.top - MENU_GAP - menuHeight, HEADER_SAFE_TOP);
  return {
    menuTop: menuTopAbove,
    reactionTop: Math.max(menuTopAbove - REACTION_GAP - REACTION_BAR_HEIGHT, HEADER_SAFE_TOP),
    placement: 'above',
  };
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short' });
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isMediaMsg(msg) {
  return msg?.message_type === 'sticker' || msg?.message_type === 'gif';
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
  // Mobile long-press overlay (reaction bar + floating menu)
  const [activeMessageId, setActiveMessageId] = useState(null);
  const [actionRect, setActionRect] = useState(null);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  // Desktop-only: chevron dropdown + double-click select
  const [chevronMenuMsgId, setChevronMenuMsgId] = useState(null);
  const [selectedMessageId, setSelectedMessageId] = useState(null);
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
  // Copied feedback
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const [typingPartners, setTypingPartners] = useState({});
  const [showPicker, setShowPicker] = useState(false);
  const { message: toastMessage, variant: toastVariant, show: showToast } = useToast();
  const bottomRef = useRef(null);
  const pickerRef = useRef(null);
  const chevronMenuRef = useRef(null);
  const selectedPartnershipRef = useRef(null);
  const msgRefs = useRef({});
  const replyIconRefs = useRef({});
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

  // "Delete for Me" persists to chat_message_hidden — this global (not per-partnership)
  // subscription is what lets it sync in real time to your other logged-in devices,
  // regardless of which conversation they currently have open.
  useEffect(() => {
    if (!currentUser) return;
    const channel = supabase
      .channel(`chat-hidden-${currentUser.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_message_hidden', filter: `user_id=eq.${currentUser.id}` },
        payload => {
          setHiddenMsgIds(prev => new Set([...prev, payload.new.message_id]));
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
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
      .subscribe(status => {
        // Diagnostic: if this never logs SUBSCRIBED, or logs CHANNEL_ERROR/TIMED_OUT,
        // realtime isn't actually connected — most likely `chat_messages` was never
        // added to the `supabase_realtime` publication (see migration 002/comment
        // below), rather than anything wrong with this subscription code.
        if (status !== 'SUBSCRIBED') console.warn('[chat realtime]', status, 'for partnership', pid);
      });

    // Safety net: don't depend entirely on the websocket subscription above — if
    // realtime silently isn't delivering events (misconfigured publication, a
    // dropped connection, etc.), this keeps the thread converging on the real
    // state within a few seconds instead of going stale until the user re-opens it.
    const pollInterval = setInterval(async () => {
      try {
        const latest = await api.entities.ChatMessage.filter({ partnership_id: pid }, '-created_at', 100);
        const latestMap = new Map(latest.map(m => [m.id, m]));
        setMessages(prev => {
          let changed = false;
          const merged = prev.map(m => {
            const fresh = latestMap.get(m.id);
            if (fresh && JSON.stringify(fresh) !== JSON.stringify(m)) { changed = true; return fresh; }
            return m;
          });
          const localIds = new Set(prev.map(m => m.id));
          const missing = latest.filter(m => !localIds.has(m.id));
          if (!missing.length) return changed ? merged : prev;
          return [...merged, ...missing].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        });
      } catch (_) {}
    }, 4000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
      setUnreadCounts(prev => ({ ...prev, [pid]: 0 }));
    };
  }, [selectedPartnership]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // If the message someone's mid-reply-to gets deleted for everyone before they
  // send, drop the staged reply rather than sending a reference to nothing.
  useEffect(() => {
    if (!replyingTo) return;
    const current = messages.find(m => m.id === replyingTo.id);
    if (current?.is_deleted) setReplyingTo(null);
  }, [messages, replyingTo]);

  // Desktop: Esc or a click outside the selected message clears the selection.
  useEffect(() => {
    if (!selectedMessageId) return;
    function onKeyDown(e) { if (e.key === 'Escape') setSelectedMessageId(null); }
    function onMouseDown(e) {
      const el = msgRefs.current[selectedMessageId];
      if (el && !el.contains(e.target)) setSelectedMessageId(null);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [selectedMessageId]);

  // Desktop: close the chevron dropdown on outside click.
  useEffect(() => {
    if (!chevronMenuMsgId) return;
    function onMouseDown(e) {
      if (chevronMenuRef.current && !chevronMenuRef.current.contains(e.target)) {
        setChevronMenuMsgId(null);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [chevronMenuMsgId]);

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

      // Pull in anything already hidden-for-me on another device/session — union
      // rather than replace, so a hide that hasn't finished persisting yet (e.g.
      // triggered moments ago on this same device) isn't dropped by this fetch.
      if (msgs.length) {
        const { data: hiddenRows } = await supabase
          .from('chat_message_hidden')
          .select('message_id')
          .eq('user_id', currentUser.id)
          .in('message_id', msgs.map(m => m.id));
        if (hiddenRows?.length) {
          setHiddenMsgIds(prev => new Set([...prev, ...hiddenRows.map(r => r.message_id)]));
        }
      }

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

  function getMsgPermissions(msg) {
    if (!msg) return {};
    const isMe = msg.sender_id === currentUser.id;
    const ageMs = Date.now() - new Date(msg.created_at).getTime();
    const canEdit = isMe && !msg.is_deleted && msg.message_type === 'text' && ageMs < 5 * 60 * 1000;
    const canDeleteAll = isMe && !msg.is_deleted && ageMs < 30 * 60 * 1000;
    const canSaveSticker = !isMe && msg.message_type === 'sticker' && !msg.is_deleted;
    const canReply = !msg.is_deleted && msg.message_type !== 'system';
    const canCopy = !msg.is_deleted && msg.message_type === 'text';
    // Even a message deleted for everyone still needs to be reachable — "Delete
    // for Me" (always offered below) is the only action left at that point, but
    // it has to stay available so the placeholder can be hidden from your own view.
    const canAct = canReply || canEdit || canDeleteAll || canSaveSticker || msg.is_deleted;
    return { isMe, canEdit, canDeleteAll, canSaveSticker, canReply, canCopy, canAct };
  }

  // Shared action list for the mobile overlay menu, the desktop chevron dropdown,
  // and the desktop selected-message header bar — each renders it with its own
  // layout, but the actions and their permission gating live in one place.
  function getMessageMenuActions(msg, perms, closeUI) {
    const actions = [];
    if (perms.canReply) {
      actions.push({ key: 'reply', label: 'Reply', icon: CornerUpLeft, onClick: () => { setReplyingTo(msg); closeUI(); } });
    }
    if (perms.canCopy) {
      actions.push({ key: 'copy', label: 'Copy', icon: Copy, onClick: () => { copyMessage(msg); closeUI(); } });
    }
    if (perms.canSaveSticker) {
      actions.push({ key: 'save', label: 'Save to Mine', icon: Star, accentColor: '#ca8a04', onClick: () => { setStickerPreview(msg); closeUI(); } });
    }
    if (perms.canEdit) {
      actions.push({ key: 'edit', label: 'Edit', icon: Pencil, onClick: () => { setEditText(msg.content); setEditingMessageId(msg.id); closeUI(); } });
    }
    if (perms.canDeleteAll) {
      actions.push({ key: 'deleteAll', label: 'Delete for All', icon: Trash2, destructive: true, onClick: () => { deleteMessage(msg); closeUI(); } });
    }
    actions.push({ key: 'deleteMe', label: 'Delete for Me', icon: Trash2, destructive: true, onClick: () => { deleteForMe(msg); closeUI(); } });
    return actions;
  }

  function openActionOverlay(msgId) {
    const el = msgRefs.current[msgId];
    if (el) setActionRect(el.getBoundingClientRect());
    setActiveMessageId(msgId);
    setSelectedMessageId(null);
    setChevronMenuMsgId(null);
    haptic([30, 15, 50]);
  }

  function closeActionOverlay() {
    setActiveMessageId(null);
    setActionRect(null);
    setShowReactionPicker(false);
  }

  async function copyMessage(msg) {
    try { await navigator.clipboard.writeText(msg.content || ''); } catch {}
    closeActionOverlay();
    setCopiedFeedback(true);
    setTimeout(() => setCopiedFeedback(false), 1800);
  }

  async function deleteForMe(msg) {
    setHiddenMsgIds(prev => new Set([...prev, msg.id]));
    closeActionOverlay();
    try {
      const { error } = await supabase
        .from('chat_message_hidden')
        .upsert({ message_id: msg.id, user_id: currentUser.id }, { onConflict: 'message_id,user_id', ignoreDuplicates: true });
      if (error) throw error;
    } catch (err) {
      // Already hidden locally for this session either way — just won't have
      // synced to other devices, and won't survive a reload here either.
      console.error('Failed to persist delete-for-me:', err);
    }
  }

  async function addStickerToMineWeb(url) {
    setSavingSticker(url);
    try {
      const idx = url.indexOf(STORAGE_URL_MARKER);
      let destName;
      if (idx !== -1) {
        // Already in our own storage (e.g. a partner's "My Stickers" upload) — cheap copy.
        const sourcePath = url.slice(idx + STORAGE_URL_MARKER.length);
        const filename = sourcePath.split('/').pop();
        destName = `${Date.now()}_${filename}`;
        const { error } = await supabase.storage.from('uploads').copy(sourcePath, `stickers/${currentUser.id}/${destName}`);
        if (error) throw error;
      } else {
        // External URL (e.g. a Giphy link sent before re-hosting existed) — fetch and upload directly.
        const res = await fetch(url);
        if (!res.ok) throw new Error('Could not fetch this sticker');
        const blob = await res.blob();
        destName = `${Date.now()}.${guessImageExt(blob.type)}`;
        const { error } = await supabase.storage.from('uploads').upload(`stickers/${currentUser.id}/${destName}`, blob, { contentType: blob.type || 'image/gif' });
        if (error) throw error;
      }
      setMineFilenames(prev => new Set([...prev, destName]));
      setStickerPreview(null);
      setStickerSavedMsg(true);
      setTimeout(() => setStickerSavedMsg(false), 2500);
    } catch (err) {
      console.error('Failed to save sticker:', err);
      showToast('Could not save this sticker — please try again', 'error');
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
    closeActionOverlay();
    setSelectedMessageId(null);
    // Optimistic: don't wait on the realtime round-trip to reflect the deletion
    // for the person who just triggered it — the other party still gets it via
    // the postgres_changes subscription like any other update. Reactions go away
    // with the message (mirrors the server-side soft_delete_chat_message RPC).
    const priorReactions = msg.reactions || [];
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_deleted: true, reactions: [] } : m));
    try {
      const { error } = await supabase.rpc('soft_delete_chat_message', { p_message_id: msg.id });
      if (error) throw error;
    } catch (err) {
      console.error('Failed to delete message:', err);
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_deleted: false, reactions: priorReactions } : m));
      const msg2 = err?.message?.includes('window')
        ? "Too late to delete this for everyone — it's outside the 30-minute window."
        : 'Failed to delete — please try again';
      showToast(msg2, 'error');
    }
  }

  async function toggleMessageReaction(msg, emoji) {
    const base = msg.reactions || [];
    const existing = base.find(r => r.user_id === currentUser.id);
    let updated;
    if (existing) {
      updated = existing.emoji === emoji
        ? base.filter(r => r.user_id !== currentUser.id)
        : base.map(r => r.user_id === currentUser.id ? { ...r, emoji } : r);
    } else {
      updated = [...base, { user_id: currentUser.id, emoji, created_at: new Date().toISOString() }];
    }
    // Optimistic so it feels instant even before the realtime echo arrives
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, reactions: updated } : m));
    closeActionOverlay();
    try {
      const { error } = await supabase.rpc('set_chat_message_reactions', {
        p_message_id: msg.id,
        p_reactions: updated,
      });
      if (error) throw error;
    } catch (err) {
      console.error('Failed to update reaction:', err);
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, reactions: base } : m));
      showToast('Failed to react — please try again', 'error');
    }
  }

  const handleMsgPointerDown = useCallback((msgId, canAct) => {
    if (!canAct) return;
    longPressActivated.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressActivated.current = true;
      openActionOverlay(msgId);
    }, 480);
  }, []);

  const handleMsgPointerUp = useCallback(() => {
    clearTimeout(longPressTimer.current);
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

  // Giphy (and any other external source) can remove or expire content later, at
  // which point their CDN can start serving a placeholder instead of the sticker/
  // GIF that was actually sent — and "Add to Mine" can't reach a URL we don't own.
  // Re-hosting into our own storage at send time makes the message permanent and
  // makes it work like any self-uploaded sticker from then on. Best-effort: if the
  // fetch/upload fails (e.g. a CORS-restricted source), fall back to the original
  // URL rather than blocking the send.
  async function rehostExternalMedia(url) {
    if (url.includes(STORAGE_URL_MARKER)) return url;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Fetch failed');
      const blob = await res.blob();
      const path = `chat-media/${currentUser.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${guessImageExt(blob.type)}`;
      const { error } = await supabase.storage.from('uploads').upload(path, blob, { contentType: blob.type || 'image/gif' });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(path);
      return publicUrl;
    } catch (err) {
      console.error('Failed to re-host media, sending original URL instead:', err);
      return url;
    }
  }

  async function sendMedia(previewUrl, fullUrl, type) {
    if (!selectedPartnership) return;
    setShowPicker(false);
    const replySnapshot = replyingTo;
    setReplyingTo(null);
    try {
      const hostedUrl = await rehostExternalMedia(fullUrl || previewUrl);
      await api.entities.ChatMessage.create({
        partnership_id: selectedPartnership.id,
        sender_id: currentUser.id,
        sender_name: profile?.display_name || currentUser.full_name,
        content: hostedUrl,
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

    const activeMsg = activeMessageId ? messages.find(m => m.id === activeMessageId) : null;
    const activePerms = activeMsg ? getMsgPermissions(activeMsg) : null;
    const activeMenuItems = activeMsg ? getMessageMenuActions(activeMsg, activePerms, closeActionOverlay) : [];
    const overlayLayout = activeMsg && actionRect ? getOverlayLayout(actionRect, activeMenuItems.length) : null;
    const overlaySide = activePerms?.isMe ? { right: 16 } : { left: 16 };

    const selectedMsg = selectedMessageId ? messages.find(m => m.id === selectedMessageId) : null;
    const selectedPerms = selectedMsg ? getMsgPermissions(selectedMsg) : null;

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

        {/* Mobile: message action overlay — dim/blur backdrop + floating reaction bar + context menu */}
        <AnimatePresence>
          {activeMsg && !editingMessageId && overlayLayout && (
            <React.Fragment key="action-overlay">
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-40"
                style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
                onClick={closeActionOverlay}
              />
              {/* A message deleted for everyone has nothing left to react to — only
                  "Delete for Me" remains in the menu below, so skip the reaction bar. */}
              {!activeMsg.is_deleted && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.85, y: overlayLayout.placement === 'below' ? 6 : -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.85, y: overlayLayout.placement === 'below' ? 6 : -6 }}
                  transition={{ type: 'spring', damping: 22, stiffness: 420 }}
                  className="fixed z-50 flex items-center gap-0.5 px-2 py-1.5 rounded-full shadow-2xl"
                  style={{ top: overlayLayout.reactionTop, ...overlaySide, background: 'hsl(var(--popover))' }}
                >
                  {REACTION_EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => toggleMessageReaction(activeMsg, emoji)}
                      className="w-8 h-8 flex items-center justify-center text-lg rounded-full hover:bg-secondary transition-transform active:scale-90"
                    >
                      {emoji}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowReactionPicker(true)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-secondary text-muted-foreground hover:opacity-80 transition-opacity flex-shrink-0"
                  >
                    <Plus size={15} />
                  </button>
                </motion.div>
              )}
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ type: 'spring', damping: 26, stiffness: 440 }}
                className="fixed z-50 flex flex-col min-w-[200px] rounded-2xl border border-border shadow-2xl overflow-hidden"
                style={{ top: overlayLayout.menuTop, ...overlaySide, background: 'hsl(var(--popover))' }}
              >
                {activeMenuItems.map((a, i) => (
                  <button
                    key={a.key}
                    onClick={a.onClick}
                    className={`flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-secondary transition-colors text-left ${i > 0 ? 'border-t border-border' : ''}`}
                    style={a.destructive ? { color: 'hsl(var(--destructive))' } : a.accentColor ? { color: a.accentColor } : undefined}
                  >
                    {a.label} <a.icon size={15} />
                  </button>
                ))}
              </motion.div>
              {showReactionPicker && (
                <Suspense fallback={null}>
                  <ReactionEmojiPicker onSelect={emoji => toggleMessageReaction(activeMsg, emoji)} />
                </Suspense>
              )}
            </React.Fragment>
          )}
        </AnimatePresence>

        {/* Header — swaps to a contextual action bar when a message is selected (desktop double-click) */}
        {selectedMsg ? (
          <div className="flex items-center gap-2 px-3 py-3 border-b border-border flex-shrink-0">
            <button
              onClick={() => setSelectedMessageId(null)}
              className="p-2 rounded-full bg-secondary hover:opacity-75 transition-opacity"
            >
              <XIcon size={17} />
            </button>
            <span className="flex-1 text-sm font-semibold text-foreground ml-1">1 selected</span>
            {getMessageMenuActions(selectedMsg, selectedPerms, () => setSelectedMessageId(null)).map(a => (
              <button
                key={a.key}
                onClick={a.onClick}
                className="p-2.5 rounded-full bg-secondary hover:opacity-75 transition-opacity"
                style={a.destructive ? { color: 'hsl(var(--destructive))' } : a.accentColor ? { color: a.accentColor } : undefined}
                title={a.label}
              >
                <a.icon size={16} />
              </button>
            ))}
          </div>
        ) : (
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
            const perms = getMsgPermissions(msg);
            const { isMe, canAct, canReply } = perms;
            const isEditing = editingMessageId === msg.id;
            const isActive = activeMessageId === msg.id;
            const isSelected = selectedMessageId === msg.id;
            const isRead = isMe && !!partnerLastReadAt && new Date(msg.created_at) <= new Date(partnerLastReadAt);
            const replyTo = msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : null;
            const reactionGroups = {};
            (msg.reactions || []).forEach(r => { reactionGroups[r.emoji] = (reactionGroups[r.emoji] || 0) + 1; });
            const reactionEntries = Object.entries(reactionGroups);
            const showChevronMenu = chevronMenuMsgId === msg.id;

            return (
              <motion.div
                key={msg.id}
                ref={el => { msgRefs.current[msg.id] = el; }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative"
              >
                {/* Swipe-to-reply reveal icon — lives outside the draggable layer so it stays put */}
                <div
                  ref={el => { replyIconRefs.current[msg.id] = el; }}
                  className="absolute left-2 top-1/2 pointer-events-none"
                  style={{ opacity: 0, transform: 'translateY(-50%) scale(0.5)' }}
                >
                  <CornerUpLeft size={18} style={{ color: 'hsl(var(--theme-accent))' }} />
                </div>

                <motion.div
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} relative`}
                  style={{
                    ...(isActive ? { zIndex: 55 } : {}),
                    ...(isSelected ? { background: 'hsl(var(--theme-accent) / 0.06)', borderRadius: 12, margin: '0 -8px', padding: '2px 8px' } : {}),
                  }}
                  drag={canReply && !isEditing ? 'x' : false}
                  dragDirectionLock
                  dragConstraints={{ left: 0, right: SWIPE_REPLY_MAX }}
                  dragElastic={{ left: 0, right: 0.3 }}
                  dragSnapToOrigin
                  onDragStart={() => clearTimeout(longPressTimer.current)}
                  onDrag={(e, info) => {
                    const icon = replyIconRefs.current[msg.id];
                    if (!icon) return;
                    const progress = Math.min(Math.max(info.offset.x / SWIPE_REPLY_THRESHOLD, 0), 1);
                    icon.style.opacity = String(progress);
                    icon.style.transform = `translateY(-50%) scale(${0.5 + 0.5 * progress})`;
                  }}
                  onDragEnd={(e, info) => {
                    const icon = replyIconRefs.current[msg.id];
                    if (icon) { icon.style.opacity = '0'; icon.style.transform = 'translateY(-50%) scale(0.5)'; }
                    if (info.offset.x > SWIPE_REPLY_THRESHOLD) {
                      haptic([20]);
                      setReplyingTo(msg);
                    }
                  }}
                  onPointerDown={() => handleMsgPointerDown(msg.id, canAct)}
                  onPointerUp={handleMsgPointerUp}
                  onPointerCancel={handleMsgPointerUp}
                  onContextMenu={e => { e.preventDefault(); if (canAct) openActionOverlay(msg.id); }}
                  onDoubleClick={() => { if (canAct) { setSelectedMessageId(msg.id); setActiveMessageId(null); setChevronMenuMsgId(null); } }}
                >
                  {/* Reply-to reference — hidden once either side of the reference is gone:
                      the original being quoted, or this reply message itself. */}
                  {replyTo && !replyTo.is_deleted && !msg.is_deleted && !hiddenMsgIds.has(replyTo.id) && (
                    <button
                      onClick={() => scrollToMessage(replyTo.id)}
                      className="max-w-[72%] text-left px-2.5 py-1.5 rounded-xl mb-1 border-l-2 transition-opacity hover:opacity-80 flex items-center gap-2"
                      style={{ background: 'hsl(var(--theme-accent) / 0.07)', borderLeftColor: 'hsl(var(--theme-accent))' }}
                    >
                      {isMediaMsg(replyTo) && (
                        <PostImage src={replyTo.content} alt="" className="w-8 h-8 rounded-md object-cover flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold" style={{ color: 'hsl(var(--theme-accent))' }}>
                          {replyTo.sender_id === currentUser.id ? 'You' : partnerName}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {replyTo.message_type === 'sticker' ? 'Sticker'
                            : replyTo.message_type === 'gif' ? 'GIF'
                            : replyTo.content}
                        </p>
                      </div>
                    </button>
                  )}

                  {/* Sticker / GIF */}
                  {isMediaMsg(msg) && !msg.is_deleted ? (
                    <>
                      {/* Chevron + dropdown live in a plain (non-clipping) wrapper — the image's
                          own overflow-hidden (for rounded corners) would otherwise clip the
                          dropdown, since it's positioned just below the image's bottom edge. */}
                      <div className="relative max-w-[220px]">
                        <motion.div
                          className={`relative rounded-2xl overflow-hidden ${isMe ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                          style={{ cursor: 'pointer', userSelect: 'none', boxShadow: isActive ? '0 8px 24px rgba(0,0,0,0.35)' : 'none' }}
                          animate={{ scale: isActive ? 1.04 : 1 }}
                          transition={{ type: 'spring', damping: 20, stiffness: 400 }}
                          onClick={() => {
                            if (longPressActivated.current) { longPressActivated.current = false; return; }
                            if (isActive) { closeActionOverlay(); return; }
                            setStickerPreview(msg);
                          }}
                        >
                          <ChatMediaBubble
                            src={msg.content}
                            alt={msg.message_type}
                            maxHeight={msg.message_type === 'sticker' ? 120 : 160}
                            isExternal={!msg.content.includes(STORAGE_URL_MARKER)}
                          />
                        </motion.div>
                        {canAct && (
                          <button
                            onClick={e => { e.stopPropagation(); setChevronMenuMsgId(prev => prev === msg.id ? null : msg.id); }}
                            className="desktop-only absolute top-1.5 right-1.5 items-center justify-center w-5 h-5 rounded-full opacity-40 hover:opacity-100 transition-opacity"
                            style={{ background: 'rgba(0,0,0,0.4)' }}
                          >
                            <ChevronDown size={13} color="white" />
                          </button>
                        )}
                        {showChevronMenu && (
                          <div
                            ref={chevronMenuRef}
                            className="absolute top-full right-0 mt-1 z-30 flex flex-col min-w-[180px] rounded-xl border border-border shadow-lg overflow-hidden"
                            style={{ background: 'hsl(var(--popover))' }}
                            onClick={e => e.stopPropagation()}
                          >
                            {getMessageMenuActions(msg, perms, () => setChevronMenuMsgId(null)).map(a => (
                              <button
                                key={a.key}
                                onClick={a.onClick}
                                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors text-left"
                                style={a.destructive ? { color: 'hsl(var(--destructive))' } : a.accentColor ? { color: a.accentColor } : undefined}
                              >
                                <a.icon size={13} /> {a.label}
                              </button>
                            ))}
                          </div>
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
                    <motion.div
                      className={`relative max-w-[78%] px-3.5 py-2.5 rounded-2xl ${isMe ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                      style={{
                        background: isMe ? 'hsl(var(--theme-accent))' : 'hsl(var(--secondary))',
                        color: isMe ? 'hsl(var(--theme-accent-fg))' : 'hsl(var(--foreground))',
                        cursor: canAct ? 'pointer' : 'default',
                        userSelect: 'none',
                        boxShadow: isActive ? '0 8px 24px rgba(0,0,0,0.35)' : 'none',
                      }}
                      animate={{ scale: isActive ? 1.04 : 1 }}
                      transition={{ type: 'spring', damping: 20, stiffness: 400 }}
                      onClick={() => { if (isActive) closeActionOverlay(); }}
                    >
                      {canAct && msg.message_type !== 'system' && (
                        <button
                          onClick={e => { e.stopPropagation(); setChevronMenuMsgId(prev => prev === msg.id ? null : msg.id); }}
                          className="desktop-only absolute top-1.5 right-1.5 items-center justify-center w-5 h-5 rounded-full opacity-40 hover:opacity-100 transition-opacity"
                          style={{ color: isMe ? 'hsl(var(--theme-accent-fg))' : 'hsl(var(--foreground))', background: 'rgba(128,128,128,0.2)' }}
                        >
                          <ChevronDown size={13} />
                        </button>
                      )}
                      {showChevronMenu && (
                        <div
                          ref={chevronMenuRef}
                          className="absolute top-full right-0 mt-1 z-30 flex flex-col min-w-[180px] rounded-xl border border-border shadow-lg overflow-hidden"
                          style={{ background: 'hsl(var(--popover))' }}
                          onClick={e => e.stopPropagation()}
                        >
                          {getMessageMenuActions(msg, perms, () => setChevronMenuMsgId(null)).map(a => (
                            <button
                              key={a.key}
                              onClick={a.onClick}
                              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors text-left"
                              style={a.destructive ? { color: 'hsl(var(--destructive))' } : a.accentColor ? { color: a.accentColor } : undefined}
                            >
                              <a.icon size={13} /> {a.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {msg.is_deleted ? (
                        <p className="text-xs italic opacity-50">This message was deleted</p>
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
                    </motion.div>
                  )}

                  {/* Reaction summary */}
                  {reactionEntries.length > 0 && !msg.is_deleted && (
                    <div
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full mt-1 text-xs shadow"
                      style={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
                    >
                      {reactionEntries.map(([emoji, count]) => (
                        <span key={emoji} className="flex items-center gap-0.5">
                          {emoji}{count > 1 && <span className="text-[10px] text-muted-foreground">{count}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
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
            {isMediaMsg(replyingTo) && (
              <PostImage src={replyingTo.content} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold" style={{ color: 'hsl(var(--theme-accent))' }}>
                {replyingTo.sender_id === currentUser.id ? 'Replying to yourself' : `Replying to ${partnerName}`}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {replyingTo.message_type === 'sticker' ? 'Sticker'
                  : replyingTo.message_type === 'gif' ? 'GIF'
                  : replyingTo.content}
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
