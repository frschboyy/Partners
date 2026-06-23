import React, { useState, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Pencil, Trash2, MessageCircle, Smile, Send, Plus, Maximize2, Minimize2, CornerDownRight, Home } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/api/supabaseClient';
import { compressImage } from '@/lib/imageUtils';
import { useToast, Toast } from '@/components/Toast';

const EMOJI_REACTIONS = ['❤️', '🔥', '💪', '😂', '👀', '🫡'];

function postEmoji(p) {
  return p.post_type === 'meal' ? '🍽️' : p.post_type === 'workout' ? '💪' : '😔';
}

export default function MyPostsOverlay({ posts, profile, currentUserId, profiles = {}, onClose, onRefresh }) {
  const [focusedPost, setFocusedPost] = useState(null);
  const [imageIndex, setImageIndex] = useState(0);

  // Edit
  const [editOverlayOpen, setEditOverlayOpen] = useState(false);
  const [editCaption, setEditCaption] = useState('');
  const [editPhotoUrls, setEditPhotoUrls] = useState([]);
  const [editSelectedIndex, setEditSelectedIndex] = useState(null);
  const editingIndexRef = useRef(-1);
  const [saving, setSaving] = useState(false);

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reactions
  const [showReactions, setShowReactions] = useState(false);
  const [localReactions, setLocalReactions] = useState(null);

  // Comments
  const [showComments, setShowComments] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  const fileInputRef = useRef(null);
  const commentInputRef = useRef(null);
  const commentsBottomRef = useRef(null);
  const commentsScrollRef = useRef(null);
  const touchStartX = useRef(null);

  const { message: toastMsg, show: showToast } = useToast();

  // Drag-down-to-close
  const [dragOffset, setDragOffset] = useState(0);
  const dragRef = useRef({ startY: null, active: false, offset: 0 });

  function handleDragStart(e) {
    dragRef.current = { startY: e.touches[0].clientY, active: true, offset: 0 };
  }

  function handleDragMove(e) {
    if (!dragRef.current.active) return;
    const delta = Math.max(0, e.touches[0].clientY - dragRef.current.startY);
    dragRef.current.offset = delta;
    setDragOffset(delta);
  }

  function handleDragEnd() {
    if (!dragRef.current.active) return;
    const offset = dragRef.current.offset;
    dragRef.current.active = false;
    dragRef.current.startY = null;
    dragRef.current.offset = 0;
    if (offset > 110) {
      onClose();
    } else {
      setDragOffset(0);
    }
  }

  const reactions = localReactions ?? (focusedPost?.reactions || []);
  const myReaction = reactions.find(r => r.user_id === currentUserId);
  const reactionGroups = {};
  reactions.forEach(r => { reactionGroups[r.emoji] = (reactionGroups[r.emoji] || 0) + 1; });

  const focusedPhotoUrls = focusedPost
    ? (focusedPost.photo_urls?.length > 0 ? focusedPost.photo_urls : (focusedPost.photo_url ? [focusedPost.photo_url] : []))
    : [];

  function openPost(p) {
    setFocusedPost(p);
    setImageIndex(0);
    setLocalReactions(null);
    setShowReactions(false);
    setShowComments(false);
    setComments([]);
    setConfirmDelete(false);
    setEditOverlayOpen(false);
  }

  function closePost() {
    setFocusedPost(null);
    setImageIndex(0);
    setEditOverlayOpen(false);
    setConfirmDelete(false);
    setShowComments(false);
    setLocalReactions(null);
  }

  // ─── Reactions ────────────────────────────────────────────────────────────

  async function toggleReaction(emoji) {
    if (!focusedPost) return;
    const base = localReactions ?? (focusedPost.reactions || []);
    const existing = base.find(r => r.user_id === currentUserId);
    let updated;
    if (existing) {
      if (existing.emoji === emoji) updated = base.filter(r => r.user_id !== currentUserId);
      else updated = base.map(r => r.user_id === currentUserId ? { ...r, emoji } : r);
    } else {
      updated = [...base, { user_id: currentUserId, emoji, created_at: new Date().toISOString() }];
    }
    setLocalReactions(updated);
    setShowReactions(false);
    await api.entities.Post.update(focusedPost.id, { reactions: updated });
  }

  // ─── Comments ─────────────────────────────────────────────────────────────

  async function openComments() {
    setShowComments(true);
    setCommentsExpanded(false);
    setLoadingComments(true);
    setComments([]);
    try {
      const msgs = await api.entities.ChatMessage.filter({ post_id: focusedPost.id }, 'created_at', 100);
      const normalized = msgs
        .map(c => ({ ...c }))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      setComments(normalized);
    } catch (_) { setComments([]); }
    setLoadingComments(false);
    setTimeout(() => commentInputRef.current?.focus(), 200);
  }

  async function sendComment() {
    if (!commentText.trim() || sendingComment) return;
    setSendingComment(true);
    const text = commentText.trim();
    const replyId = replyingTo?.id || null;
    const optimistic = {
      id: `opt_${Date.now()}`,
      post_id: focusedPost.id,
      sender_id: currentUserId,
      sender_name: profile?.display_name || 'You',
      content: text,
      created_at: new Date().toISOString(),
      reply_to_id: replyId,
      liked_by: [],
    };
    setComments(prev => [...prev, optimistic]);
    setCommentText('');
    setReplyingTo(null);
    setTimeout(() => {
      if (commentsScrollRef.current) {
        commentsScrollRef.current.scrollTop = commentsScrollRef.current.scrollHeight;
      }
    }, 50);
    try {
      const msg = await api.entities.ChatMessage.create({
        post_id: focusedPost.id,
        partnership_id: null,
        sender_id: currentUserId,
        sender_name: profile?.display_name || 'You',
        content: text,
        message_type: 'text',
        read_by: [currentUserId],
        reply_to_id: replyId,
        liked_by: [],
      });
      const norm = { ...msg };
      setComments(prev => prev.map(c => c.id === optimistic.id ? norm : c));
    } catch (err) {
      setComments(prev => prev.filter(c => c.id !== optimistic.id));
      setCommentText(text);
      console.error('Comment save failed:', err?.message || err);
      showToast('Failed to post comment — check DB schema');
    }
    setSendingComment(false);
  }

  async function deleteComment(id) {
    setComments(prev => prev.filter(c => c.id !== id));
    if (!id.startsWith('opt_')) {
      await api.entities.ChatMessage.delete(id).catch(() => {});
    }
  }

  async function saveCommentEdit(id) {
    const text = editingCommentText.trim();
    if (!text) return;
    setComments(prev => prev.map(c => c.id === id ? { ...c, content: text } : c));
    setEditingCommentId(null);
    await api.entities.ChatMessage.update(id, { content: text });
  }

  // ─── Edit ─────────────────────────────────────────────────────────────────

  function openEditOverlay() {
    const urls = focusedPost.photo_urls?.length > 0
      ? focusedPost.photo_urls
      : (focusedPost.photo_url ? [focusedPost.photo_url] : []);
    setEditPhotoUrls(urls);
    setEditCaption(focusedPost.caption || '');
    setEditSelectedIndex(null);
    editingIndexRef.current = -1;
    setEditOverlayOpen(true);
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      const { file_url } = await api.integrations.Core.UploadFile({ file: compressed });
      const idx = editingIndexRef.current;
      if (idx >= 0) {
        setEditPhotoUrls(prev => prev.map((url, i) => i === idx ? file_url : url));
      } else {
        setEditPhotoUrls(prev => [...prev, file_url]);
      }
    } catch (_) {}
    editingIndexRef.current = -1;
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await api.entities.Post.update(focusedPost.id, {
        caption: editCaption,
        photo_url: editPhotoUrls[0] || null,
        photo_urls: editPhotoUrls,
      });
      setFocusedPost(p => ({ ...p, caption: editCaption, photo_url: editPhotoUrls[0] || null, photo_urls: editPhotoUrls }));
      setImageIndex(0);
      setEditOverlayOpen(false);
      showToast('Post updated ✓');
      onRefresh?.();
    } catch (err) {
      console.error('Post update failed:', err?.message || err);
      showToast('Failed to save changes');
    }
    setSaving(false);
  }

  async function handleDelete() {
    await api.entities.Post.delete(focusedPost.id);
    setConfirmDelete(false);
    closePost();
    showToast('Post deleted');
    onRefresh?.();
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <motion.div
      className="fixed inset-0 z-50"
      initial={{ opacity: 0, y: '100%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
    >
      <div
        className="absolute inset-0 bg-background flex flex-col"
        style={{
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
          transition: !dragRef.current.active ? 'transform 0.35s cubic-bezier(0.32,0.72,0,1)' : 'none',
        }}
      >
      <Toast message={toastMsg} position="top" />
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />

      {/* Drag handle — only in grid view */}
      {!focusedPost && (
        <div
          className="flex justify-center pt-2.5 pb-1 flex-shrink-0 select-none"
          style={{ touchAction: 'none' }}
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
        >
          <div className="w-12 h-1 rounded-full bg-muted-foreground/25" />
        </div>
      )}

      {/* Header */}
      <div className="grid grid-cols-3 items-center px-4 py-3 border-b border-border flex-shrink-0">
        <div>
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={focusedPost ? closePost : onClose}
            className="p-2 rounded-full bg-secondary"
          >
            {focusedPost ? <ChevronLeft size={16} /> : <X size={16} />}
          </motion.button>
        </div>
        <div className="flex justify-center">
          {focusedPost && (
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={onClose}
              className="p-2 rounded-full bg-secondary"
            >
              <Home size={16} />
            </motion.button>
          )}
        </div>
        <div className="flex justify-end gap-1.5">
          {focusedPost && (
            <>
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => setShowReactions(s => !s)} className="p-2 rounded-full bg-secondary">
                <Smile size={16} />
              </motion.button>
              <motion.button whileTap={{ scale: 0.85 }} onClick={openComments} className="p-2 rounded-full bg-secondary relative">
                <MessageCircle size={16} />
                {comments.filter(c => !c.reply_to_id).length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                    {comments.filter(c => !c.reply_to_id).length}
                  </span>
                )}
              </motion.button>
              <motion.button whileTap={{ scale: 0.85 }} onClick={openEditOverlay} className="p-2 rounded-full bg-secondary">
                <Pencil size={16} />
              </motion.button>
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => setConfirmDelete(true)} className="p-2 rounded-full bg-destructive/10">
                <Trash2 size={16} className="text-destructive" />
              </motion.button>
            </>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">

        {focusedPost ? (
          <motion.div
            key="focused"
            className="flex-1 flex flex-col overflow-hidden relative"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 30 }}
          >
            {/* Image carousel */}
            <div
              className="relative flex-1 bg-black overflow-hidden"
              onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
              onTouchEnd={e => {
                if (touchStartX.current === null) return;
                const delta = touchStartX.current - e.changedTouches[0].clientX;
                if (delta > 40 && imageIndex < focusedPhotoUrls.length - 1) setImageIndex(i => i + 1);
                else if (delta < -40 && imageIndex > 0) setImageIndex(i => i - 1);
                touchStartX.current = null;
              }}
            >
              {focusedPhotoUrls.length > 0 ? (
                <div
                  className="flex h-full"
                  style={{
                    transform: `translateX(-${(imageIndex * 100) / focusedPhotoUrls.length}%)`,
                    transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)',
                    width: `${focusedPhotoUrls.length * 100}%`,
                  }}
                >
                  {focusedPhotoUrls.map((url, i) => (
                    <div key={i} style={{ width: `${100 / focusedPhotoUrls.length}%`, flexShrink: 0, height: '100%' }}>
                      <img src={url} alt="post" className="w-full h-full object-contain" />
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="w-full h-full flex flex-col items-center justify-center gap-4 p-6"
                  style={{ background: 'linear-gradient(135deg, hsl(var(--theme-accent-muted)), hsl(var(--card)))' }}
                >
                  <span className="text-7xl">{postEmoji(focusedPost)}</span>
                  {focusedPost.caption && <p className="text-base text-center font-medium">{focusedPost.caption}</p>}
                </div>
              )}

              {imageIndex > 0 && (
                <button
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 backdrop-blur-sm"
                  onClick={() => setImageIndex(i => i - 1)}
                >
                  <ChevronLeft size={20} className="text-white" />
                </button>
              )}
              {imageIndex < focusedPhotoUrls.length - 1 && (
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 backdrop-blur-sm"
                  onClick={() => setImageIndex(i => i + 1)}
                >
                  <ChevronRight size={20} className="text-white" />
                </button>
              )}

              {focusedPhotoUrls.length > 1 && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none">
                  {focusedPhotoUrls.map((_, i) => (
                    <div
                      key={i}
                      className="rounded-full transition-all duration-300"
                      style={{
                        width: i === imageIndex ? 18 : 6,
                        height: 6,
                        background: i === imageIndex ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Reaction picker */}
            <AnimatePresence>
              {showReactions && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                  className="flex gap-3 px-4 py-2.5 bg-secondary border-b border-border justify-center flex-shrink-0"
                >
                  {EMOJI_REACTIONS.map(emoji => (
                    <motion.button key={emoji} whileTap={{ scale: 0.7 }} onClick={() => toggleReaction(emoji)} className="text-2xl">
                      {emoji}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Post details */}
            <div className="p-4 border-t border-border space-y-2 flex-shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {focusedPost.post_type === 'meal' ? '🍽️ Meal' : focusedPost.post_type === 'workout' ? '💪 Workout' : '😔 Slip'}
                </span>
                <span className="text-xs text-muted-foreground">{focusedPost.post_date}</span>
              </div>
              {Object.keys(reactionGroups).length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {Object.entries(reactionGroups).map(([emoji, count]) => (
                    <button key={emoji} onClick={() => toggleReaction(emoji)}
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold bg-secondary border ${myReaction?.emoji === emoji ? 'border-primary' : 'border-transparent'}`}>
                      {emoji} {count}
                    </button>
                  ))}
                </div>
              )}
              {focusedPost.caption && <p className="text-sm text-foreground">{focusedPost.caption}</p>}
              {focusedPost.workout_type && (
                <p className="text-sm font-bold">{focusedPost.workout_type}{focusedPost.workout_duration ? ` · ${focusedPost.workout_duration} mins` : ''}</p>
              )}
              {focusedPost.rule_title && <p className="text-sm text-destructive font-medium">Broke: {focusedPost.rule_title}</p>}
            </div>

            {/* Delete confirm */}
            <AnimatePresence>
              {confirmDelete && (
                <motion.div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="bg-card rounded-xl p-6 mx-6 space-y-4">
                    <p className="font-bold text-center">Delete this post?</p>
                    <p className="text-sm text-muted-foreground text-center">This can't be undone.</p>
                    <div className="flex gap-3">
                      <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 rounded-lg bg-secondary text-sm font-semibold">Cancel</button>
                      <button onClick={handleDelete} className="flex-1 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold">Delete</button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Edit overlay */}
            <AnimatePresence>
              {editOverlayOpen && (
                <motion.div
                  className="absolute inset-0 z-40 bg-card flex flex-col"
                  initial={{ opacity: 0, y: '100%' }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                >
                  <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
                    <h3 className="font-bold">Edit Post</h3>
                    <motion.button whileTap={{ scale: 0.85 }} onClick={() => setEditOverlayOpen(false)} className="p-2 rounded-full bg-secondary">
                      <X size={16} />
                    </motion.button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-5" style={{ touchAction: 'pan-y' }}>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Photos ({editPhotoUrls.length})
                      </p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {editPhotoUrls.map((url, i) => (
                          <motion.div
                            key={i}
                            whileTap={{ scale: 0.95 }}
                            className="relative aspect-square rounded-lg overflow-hidden bg-secondary cursor-pointer"
                            onClick={() => setEditSelectedIndex(prev => prev === i ? null : i)}
                          >
                            <img src={url} alt="" className="w-full h-full object-cover" />
                            <AnimatePresence>
                              {editSelectedIndex === i && (
                                <motion.div
                                  className="absolute inset-0 bg-black/55 flex items-center justify-center gap-3"
                                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                  onClick={e => e.stopPropagation()}
                                >
                                  <button className="flex flex-col items-center gap-1"
                                    onClick={() => { editingIndexRef.current = i; fileInputRef.current?.click(); }}>
                                    <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                                      <Pencil size={15} className="text-white" />
                                    </div>
                                    <span className="text-[10px] text-white font-semibold">Change</span>
                                  </button>
                                  {editPhotoUrls.length > 1 && (
                                    <button className="flex flex-col items-center gap-1"
                                      onClick={() => { setEditPhotoUrls(prev => prev.filter((_, idx) => idx !== i)); setEditSelectedIndex(null); }}>
                                      <div className="w-9 h-9 rounded-full bg-red-500/70 flex items-center justify-center">
                                        <Trash2 size={15} className="text-white" />
                                      </div>
                                      <span className="text-[10px] text-white font-semibold">Remove</span>
                                    </button>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        ))}
                        <motion.button
                          whileTap={{ scale: 0.92 }}
                          onClick={() => { editingIndexRef.current = -1; fileInputRef.current?.click(); }}
                          className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground"
                        >
                          <Plus size={18} />
                          <span className="text-[10px]">Add</span>
                        </motion.button>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1.5">Tap a photo to change or remove it</p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Caption</label>
                      <textarea
                        className="w-full bg-input border border-border rounded-xl px-3 py-2.5 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                        rows={3}
                        value={editCaption}
                        onChange={e => setEditCaption(e.target.value)}
                        placeholder="Add a caption…"
                      />
                    </div>
                  </div>
                  <div className="p-4 border-t border-border flex gap-2 flex-shrink-0" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                    <button onClick={() => setEditOverlayOpen(false)} className="flex-1 py-2.5 rounded-xl bg-secondary text-sm font-semibold">Cancel</button>
                    <motion.button
                      whileTap={{ scale: 0.96 }} onClick={saveEdit} disabled={saving}
                      className="flex-1 py-2.5 rounded-xl font-bold text-sm disabled:opacity-60"
                      style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
                    >{saving ? 'Saving…' : 'Save'}</motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Comments sheet */}
            <AnimatePresence>
              {showComments && (
                <>
                  {!commentsExpanded && (
                    <div className="absolute inset-0 z-[29]" onClick={() => setShowComments(false)} />
                  )}
                  <motion.div
                    className="absolute left-0 right-0 bottom-0 z-30 bg-card rounded-t-2xl flex flex-col overflow-hidden"
                    style={{ height: commentsExpanded ? '100%' : '55%' }}
                    initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                    transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
                      <motion.button whileTap={{ scale: 0.85 }} onClick={() => setShowComments(false)} className="p-1.5 rounded-full bg-secondary">
                        <X size={15} />
                      </motion.button>
                      <p className="font-bold text-sm flex-1">Comments</p>
                      <motion.button whileTap={{ scale: 0.85 }} onClick={() => setCommentsExpanded(e => !e)} className="p-1.5 rounded-full bg-secondary">
                        {commentsExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                      </motion.button>
                    </div>

                    <div ref={commentsScrollRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-3" style={{ touchAction: 'pan-y' }}>
                      {loadingComments ? (
                        <div className="flex justify-center py-6">
                          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : comments.filter(c => !c.reply_to_id).length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                          <p className="text-3xl mb-2">💬</p>
                          <p className="text-sm">No comments yet. Be the first!</p>
                        </div>
                      ) : (
                        comments.filter(c => !c.reply_to_id).map(msg => {
                          const replies = comments.filter(c => c.reply_to_id === msg.id);
                          const isMe = msg.sender_id === currentUserId;
                          const isEditingThis = editingCommentId === msg.id;
                          return (
                            <div key={msg.id} className="space-y-2">
                              <div className="flex gap-2.5 items-start">
                                <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-bold flex-shrink-0">
                                  {msg.sender_name?.[0]?.toUpperCase() || '?'}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-baseline gap-1.5 mb-0.5">
                                    <span className="text-xs font-bold">{msg.sender_name}</span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                  {isEditingThis ? (
                                    <div className="flex gap-1">
                                      <input
                                        className="flex-1 bg-input border border-border rounded px-2 py-1 text-xs"
                                        value={editingCommentText}
                                        onChange={e => setEditingCommentText(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && saveCommentEdit(msg.id)}
                                        autoFocus
                                      />
                                      <button onClick={() => saveCommentEdit(msg.id)} className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground font-semibold">Save</button>
                                      <button onClick={() => setEditingCommentId(null)} className="text-xs px-2 py-1 rounded bg-secondary">✕</button>
                                    </div>
                                  ) : (
                                    <p className="text-sm text-foreground leading-snug">{msg.content}</p>
                                  )}
                                  {!isEditingThis && (
                                    <div className="flex items-center gap-3 mt-1">
                                      <button
                                        onClick={() => setReplyingTo({ id: msg.id, name: msg.sender_name })}
                                        className="text-[11px] text-muted-foreground font-semibold"
                                      >Reply</button>
                                      {isMe && (
                                        <>
                                          <button
                                            onClick={() => { setEditingCommentId(msg.id); setEditingCommentText(msg.content); }}
                                            className="text-[11px] text-muted-foreground"
                                          >Edit</button>
                                          <button onClick={() => deleteComment(msg.id)} className="text-[11px] text-destructive">Delete</button>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {replies.length > 0 && (
                                <div className="ml-9 space-y-2 border-l-2 border-border pl-3">
                                  {replies.map(reply => (
                                    <div key={reply.id} className="flex gap-2 items-start">
                                      <CornerDownRight size={11} className="text-muted-foreground mt-1 flex-shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline gap-1.5 mb-0.5">
                                          <span className="text-xs font-bold">{reply.sender_name}</span>
                                        </div>
                                        <p className="text-sm text-foreground leading-snug">{reply.content}</p>
                                        {reply.sender_id === currentUserId && (
                                          <button onClick={() => deleteComment(reply.id)} className="text-[11px] text-destructive mt-0.5">Delete</button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                      <div ref={commentsBottomRef} />
                    </div>

                    {replyingTo && (
                      <div className="flex items-center gap-2 px-4 py-1.5 bg-accent-muted border-t border-border flex-shrink-0">
                        <span className="text-xs text-muted-foreground flex-1">
                          Replying to <span className="font-semibold text-foreground">{replyingTo.name}</span>
                        </span>
                        <button onClick={() => setReplyingTo(null)} className="text-xs text-muted-foreground">✕</button>
                      </div>
                    )}

                    <div className="flex items-center gap-2 px-4 py-3 border-t border-border flex-shrink-0">
                      <input
                        ref={commentInputRef}
                        className="flex-1 bg-input border border-border rounded-full px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder={replyingTo ? `Reply to ${replyingTo.name}…` : 'Add a comment…'}
                        value={commentText}
                        onChange={e => setCommentText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendComment()}
                      />
                      <motion.button
                        whileTap={{ scale: 0.85 }}
                        onClick={sendComment}
                        disabled={sendingComment || !commentText.trim()}
                        className="p-2 rounded-full disabled:opacity-40"
                        style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
                      >
                        <Send size={16} />
                      </motion.button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          /* Post grid */
          <motion.div
            key="grid"
            className="flex-1 overflow-y-auto p-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {posts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
                <p className="text-4xl">📝</p>
                <p className="font-semibold">No posts yet</p>
                <p className="text-sm text-center">Log something to see your posts here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {posts.map(p => (
                  <motion.div
                    key={p.id}
                    whileTap={{ scale: 0.92 }}
                    className="aspect-square rounded-lg overflow-hidden relative bg-secondary cursor-pointer"
                    onClick={() => openPost(p)}
                  >
                    {p.photo_url ? (
                      <img src={p.photo_url} alt="thumb" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-2xl"
                        style={{ background: 'linear-gradient(135deg, hsl(var(--theme-accent-muted)), hsl(var(--card)))' }}
                      >
                        {postEmoji(p)}
                      </div>
                    )}
                    {p.photo_urls?.length > 1 && (
                      <div className="absolute top-1.5 right-1.5 bg-black/60 rounded-md px-1.5 py-0.5">
                        <span className="text-white text-[9px] font-bold">{p.photo_urls.length}⊞</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
                    <div className="absolute bottom-1 left-1.5 text-white text-[9px] font-bold drop-shadow">{p.post_date}</div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </motion.div>
  );
}
