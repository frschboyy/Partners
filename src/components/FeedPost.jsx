import React, { useState, useRef, useCallback } from 'react';
import { MessageCircle, ChevronLeft, ChevronRight, Smile, Pencil, Trash2, X, Plus } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import { api } from '@/api/supabaseClient';
import Avatar from '@/components/Avatar';
import { compressImage } from '@/lib/imageUtils';
import { useToast, Toast } from '@/components/Toast';
import CommentsSheet from '@/components/CommentsSheet';
import { EMOJI_REACTIONS, POST_TYPE_LABELS, POST_TYPE_EMOJI } from '@/lib/constants';

const DRAG_IMG_THRESHOLD = 50;
const cardW = () => window.innerWidth - 32;

export default function FeedPost({
  post,
  allPosts = [],
  currentUserId,
  profiles = {},
  initialCommentCount = 0,
  onOpenChat,
  onRefresh,
}) {
  const photoUrls = post.photo_urls?.length > 0 ? post.photo_urls : (post.photo_url ? [post.photo_url] : []);

  const [focused, setFocused] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [showReactions, setShowReactions] = useState(false);
  const [localReactions, setLocalReactions] = useState(null);
  const [showGrid, setShowGrid] = useState(false);
  const [gridFocusPost, setGridFocusPost] = useState(null);
  const [showComments, setShowComments] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [commentPostId, setCommentPostId] = useState(null);
  const [commentCount, setCommentCount] = useState(initialCommentCount);
  const [editOverlayOpen, setEditOverlayOpen] = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption || '');
  const [editPhotoUrls, setEditPhotoUrls] = useState([]);
  const [editSelectedIndex, setEditSelectedIndex] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const { message: toastMessage, show: showToast } = useToast();
  const fileInputRef = useRef(null);
  const editingIndexRef = useRef(-1);
  const imageTransitioning = useRef(false);
  const imageX = useMotionValue(0);

  const activePost = gridFocusPost || post;
  const isMyPost = post.user_id === currentUserId;
  const authorProfile = profiles[post.user_id];

  const reactions = localReactions ?? (post.reactions || []);
  const myReaction = reactions.find(r => r.user_id === currentUserId);
  const reactionGroups = {};
  reactions.forEach(r => { reactionGroups[r.emoji] = (reactionGroups[r.emoji] || 0) + 1; });

  // ─── Carousel ────────────────────────────────────────────────────────────────

  function goImageNext() {
    if (imageTransitioning.current) return;
    if (imageIndex >= photoUrls.length - 1) {
      animate(imageX, -imageIndex * cardW(), { type: 'spring', stiffness: 400, damping: 40 });
      return;
    }
    imageTransitioning.current = true;
    const newIndex = imageIndex + 1;
    animate(imageX, -newIndex * cardW(), {
      duration: 0.38,
      ease: [0.32, 0.72, 0, 1],
      onComplete: () => { setImageIndex(newIndex); imageTransitioning.current = false; },
    });
  }

  function goImagePrev() {
    if (imageTransitioning.current) return;
    if (imageIndex <= 0) {
      animate(imageX, 0, { type: 'spring', stiffness: 400, damping: 40 });
      return;
    }
    imageTransitioning.current = true;
    const newIndex = imageIndex - 1;
    animate(imageX, -newIndex * cardW(), {
      duration: 0.38,
      ease: [0.32, 0.72, 0, 1],
      onComplete: () => { setImageIndex(newIndex); imageTransitioning.current = false; },
    });
  }

  // ─── Reactions ───────────────────────────────────────────────────────────────

  const toggleReaction = useCallback(async (emoji) => {
    setLocalReactions(prev => {
      const base = prev ?? (post.reactions || []);
      const existing = base.find(r => r.user_id === currentUserId);
      if (existing) {
        if (existing.emoji === emoji) return base.filter(r => r.user_id !== currentUserId);
        return base.map(r => r.user_id === currentUserId ? { ...r, emoji } : r);
      }
      return [...base, { user_id: currentUserId, emoji, created_at: new Date().toISOString() }];
    });
    setShowReactions(false);

    const current = localReactions ?? (post.reactions || []);
    const existing = current.find(r => r.user_id === currentUserId);
    let updated;
    if (existing) {
      if (existing.emoji === emoji) updated = current.filter(r => r.user_id !== currentUserId);
      else updated = current.map(r => r.user_id === currentUserId ? { ...r, emoji } : r);
    } else {
      updated = [...current, { user_id: currentUserId, emoji, created_at: new Date().toISOString() }];
    }
    try {
      await api.entities.Post.update(post.id, { reactions: updated });
    } catch (_) {}
  }, [post, currentUserId, localReactions]);

  function openComments(targetPostId = null) {
    const id = targetPostId || post.id;
    setCommentPostId(id);
    setCommentsExpanded(false);
    setShowComments(true);
  }

  // ─── Edit overlay ────────────────────────────────────────────────────────────

  function openEditOverlay() {
    const urls = post.photo_urls?.length > 0 ? post.photo_urls : (post.photo_url ? [post.photo_url] : []);
    setEditPhotoUrls(urls);
    setEditCaption(post.caption || '');
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
    } catch (_) {
      showToast('Photo upload failed');
    }
    editingIndexRef.current = -1;
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await api.entities.Post.update(post.id, {
        caption: editCaption,
        photo_url: editPhotoUrls[0] || null,
        photo_urls: editPhotoUrls,
      });
      setEditOverlayOpen(false);
      showToast('Post updated');
      onRefresh?.();
    } catch (_) {
      showToast('Failed to save changes');
    }
    setSaving(false);
  }

  async function handleDelete() {
    try {
      await api.entities.Post.delete(post.id);
      setConfirmDelete(false);
      showToast('Post deleted');
      setTimeout(() => onRefresh?.(), 1400);
    } catch (_) {
      showToast('Failed to delete post');
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full h-full" onClick={() => !focused && !showGrid && setFocused(true)}>

      {/* Background — strip carousel for multiple photos, static for one */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden">
        {photoUrls.length > 1 ? (
          <motion.div
            className="absolute top-0 bottom-0 left-0 flex"
            style={{ x: imageX, willChange: 'transform' }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onPointerDown={e => { e.stopPropagation(); e.nativeEvent.stopPropagation(); }}
            onDragEnd={(_, info) => {
              if (imageTransitioning.current) return;
              if (info.offset.x < -DRAG_IMG_THRESHOLD) goImageNext();
              else if (info.offset.x > DRAG_IMG_THRESHOLD) goImagePrev();
              else animate(imageX, -imageIndex * cardW(), { type: 'spring', stiffness: 400, damping: 40 });
            }}
          >
            {photoUrls.map((url, i) => (
              <div key={i} style={{ width: cardW(), flexShrink: 0, height: '100%' }}>
                {url ? (
                  <img src={url} alt="" className="w-full h-full object-cover" loading="eager" decoding="async" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, hsl(var(--theme-accent-muted)), hsl(var(--card)))' }}>
                    <span className="text-8xl opacity-30">{POST_TYPE_EMOJI[post.post_type] || '✨'}</span>
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        ) : (
          photoUrls[0] ? (
            <img src={photoUrls[0]} alt="post" className="w-full h-full object-cover" loading="eager" decoding="async" fetchPriority="high" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, hsl(var(--theme-accent-muted)), hsl(var(--card)))' }}>
              <span className="text-8xl opacity-30">{POST_TYPE_EMOJI[post.post_type] || '✨'}</span>
            </div>
          )
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />
      </div>

      {/* Arrow buttons */}
      {photoUrls.length > 1 && imageIndex > 0 && (
        <button
          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/40 backdrop-blur-sm"
          onClick={e => { e.stopPropagation(); goImagePrev(); }}
        >
          <ChevronLeft size={18} className="text-white" />
        </button>
      )}
      {photoUrls.length > 1 && imageIndex < photoUrls.length - 1 && (
        <button
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/40 backdrop-blur-sm"
          onClick={e => { e.stopPropagation(); goImageNext(); }}
        >
          <ChevronRight size={18} className="text-white" />
        </button>
      )}

      {/* Top chrome */}
      <div className="absolute top-4 left-4 right-4 flex items-start justify-between z-10">
        <div className="flex items-center gap-2">
          <Avatar profile={authorProfile} size="sm" />
          <div>
            <p className="text-white text-sm font-bold leading-tight">{activePost.author_name}</p>
            <p className="text-white/70 text-xs">{POST_TYPE_LABELS[activePost.post_type]}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5">
            {post.exemption_used && (
              <span className="bg-black/50 text-white text-xs px-2 py-1 rounded-full">🎫 {post.exemption_name || 'Exempt'}</span>
            )}
            {post.summertides_active && (
              <span className="bg-yellow-500/80 text-black text-xs px-2 py-1 rounded-full font-bold">🌊 Summertides</span>
            )}
          </div>
          {!isMyPost && (
            <button
              onClick={e => { e.stopPropagation(); setShowGrid(true); }}
              className="text-white/70 text-[11px] font-medium hover:text-white transition-colors"
            >
              See all posts →
            </button>
          )}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />

      {/* Bottom content */}
      <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
        {photoUrls.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 mb-2 pointer-events-none">
            {photoUrls.map((_, i) => (
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

        {post.caption ? (
          <p className="text-white text-sm leading-relaxed mb-2 line-clamp-3">{post.caption}</p>
        ) : post.workout_type ? (
          <p className="text-white text-sm mb-2">
            <span className="font-bold">{post.workout_type}</span>
            {post.workout_duration ? ` · ${post.workout_duration} mins` : ''}
          </p>
        ) : null}

        {post.post_type === 'slip' && post.rule_title && (
          <p className="text-red-300 text-xs mb-2 font-medium">Broke: {post.rule_title}</p>
        )}

        {Object.keys(reactionGroups).length > 0 && (
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {Object.entries(reactionGroups).map(([emoji, count]) => (
              <motion.button
                key={emoji}
                whileTap={{ scale: 0.8 }}
                onClick={e => { e.stopPropagation(); toggleReaction(emoji); }}
                className={`px-2 py-0.5 rounded-full text-xs font-semibold bg-black/50 text-white border ${myReaction?.emoji === emoji ? 'border-white/60' : 'border-transparent'}`}
              >{emoji} {count}</motion.button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          <motion.button whileTap={{ scale: 0.85 }} onClick={() => setShowReactions(s => !s)} className="p-2.5 rounded-full bg-black/50 text-white">
            <Smile size={18} />
          </motion.button>

          <motion.button whileTap={{ scale: 0.85 }} onClick={() => openComments()} className="p-2.5 rounded-full bg-black/50 text-white flex items-center gap-1">
            <MessageCircle size={18} />
            {commentCount > 0 && <span className="text-xs font-bold">{commentCount}</span>}
          </motion.button>

          {focused && isMyPost && (
            <>
              <motion.button whileTap={{ scale: 0.85 }} onClick={e => { e.stopPropagation(); openEditOverlay(); }} className="p-2.5 rounded-full bg-black/50 text-white">
                <Pencil size={18} />
              </motion.button>
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => setConfirmDelete(true)} className="p-2.5 rounded-full bg-black/50 text-red-400">
                <Trash2 size={18} />
              </motion.button>
            </>
          )}
        </div>

        <AnimatePresence>
          {showReactions && (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className="flex gap-2 mt-2 bg-black/70 rounded-full px-3 py-2"
              onClick={e => e.stopPropagation()}
            >
              {EMOJI_REACTIONS.map(emoji => (
                <motion.button key={emoji} whileTap={{ scale: 0.7 }} onClick={() => toggleReaction(emoji)} className="text-xl">
                  {emoji}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Edit overlay */}
      <AnimatePresence>
        {editOverlayOpen && (
          <motion.div
            className="absolute inset-0 z-20 bg-card rounded-2xl flex flex-col"
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
              <h3 className="font-bold text-sm">Edit Post</h3>
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => setEditOverlayOpen(false)} className="p-2 rounded-full bg-secondary">
                <X size={16} />
              </motion.button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ touchAction: 'pan-y' }}>
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
                      {url ? (
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl">{POST_TYPE_EMOJI[post.post_type] || '✨'}</div>
                      )}
                      <AnimatePresence>
                        {editSelectedIndex === i && (
                          <motion.div
                            className="absolute inset-0 bg-black/55 flex items-center justify-center gap-3"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              className="flex flex-col items-center gap-1"
                              onClick={() => { editingIndexRef.current = i; fileInputRef.current?.click(); }}
                            >
                              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                                <Pencil size={15} className="text-white" />
                              </div>
                              <span className="text-[10px] text-white font-semibold">Change</span>
                            </button>
                            {editPhotoUrls.length > 1 && (
                              <button
                                className="flex flex-col items-center gap-1"
                                onClick={() => { setEditPhotoUrls(prev => prev.filter((_, idx) => idx !== i)); setEditSelectedIndex(null); }}
                              >
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

            <div className="p-4 border-t border-border flex gap-2 flex-shrink-0">
              <button onClick={() => setEditOverlayOpen(false)} className="flex-1 py-2.5 rounded-xl bg-secondary text-sm font-semibold">Cancel</button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={saveEdit}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm disabled:opacity-60"
                style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
              >{saving ? 'Saving…' : 'Save'}</motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirmation */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 rounded-2xl"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={e => e.stopPropagation()}
          >
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

      {/* Grid view */}
      <AnimatePresence>
        {showGrid && (
          <motion.div
            className="absolute inset-0 z-20 bg-card rounded-2xl overflow-hidden flex flex-col"
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
              {gridFocusPost ? (
                <motion.button whileTap={{ scale: 0.85 }} onClick={() => setGridFocusPost(null)} className="p-2 rounded-full bg-secondary">
                  <ChevronLeft size={16} />
                </motion.button>
              ) : (
                <h3 className="font-bold text-sm">{post.author_name}'s posts</h3>
              )}
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => { setShowGrid(false); setGridFocusPost(null); }} className="p-2 rounded-full bg-secondary">
                <X size={16} />
              </motion.button>
            </div>

            {gridFocusPost ? (
              <GridFocusedPost
                p={gridFocusPost}
                onComments={() => {
                  const targetId = gridFocusPost.id;
                  setShowGrid(false);
                  setGridFocusPost(null);
                  openComments(targetId);
                }}
              />
            ) : (
              <div className="overflow-y-auto flex-1 p-3" style={{ touchAction: 'pan-y' }}>
                <div className="grid grid-cols-3 gap-1.5">
                  {allPosts.map(p => (
                    <motion.div
                      key={p.id}
                      whileTap={{ scale: 0.93 }}
                      className="aspect-square rounded-lg overflow-hidden relative bg-secondary cursor-pointer"
                      onClick={() => setGridFocusPost(p)}
                    >
                      {p.photo_url ? (
                        <img src={p.photo_url} alt="thumb" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl">
                          {POST_TYPE_EMOJI[p.post_type] || '✨'}
                        </div>
                      )}
                      <div className="absolute bottom-1 left-1 text-white text-[9px] font-bold drop-shadow">{p.post_date}</div>
                    </motion.div>
                  ))}
                </div>
                {allPosts.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                    <p className="text-3xl mb-2">📭</p>
                    <p className="text-sm">No posts yet</p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <Toast message={toastMessage} />

      <CommentsSheet
        postId={commentPostId || post.id}
        currentUserId={currentUserId}
        profiles={profiles}
        currentUserProfile={profiles[currentUserId]}
        open={showComments}
        expanded={commentsExpanded}
        onExpandedChange={setCommentsExpanded}
        onClose={() => setShowComments(false)}
        onCommentCountChange={setCommentCount}
      />
    </div>
  );
}

function GridFocusedPost({ p, onComments }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 relative overflow-hidden">
        {p.photo_url ? (
          <img src={p.photo_url} alt="post" className="w-full h-full object-contain bg-black" loading="lazy" decoding="async" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6"
            style={{ background: 'linear-gradient(135deg, hsl(var(--theme-accent-muted)), hsl(var(--card)))' }}>
            <span className="text-6xl">{POST_TYPE_EMOJI[p.post_type] || '✨'}</span>
          </div>
        )}
      </div>
      <div className="px-4 py-3 border-t border-border space-y-2">
        {p.caption && <p className="text-sm">{p.caption}</p>}
        {p.workout_type && <p className="text-sm font-bold">{p.workout_type}{p.workout_duration ? ` · ${p.workout_duration} mins` : ''}</p>}
        {p.rule_title && <p className="text-sm text-destructive">Broke: {p.rule_title}</p>}
        <button
          onClick={onComments}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-sm font-medium"
        >
          <MessageCircle size={15} /> Comment
        </button>
      </div>
    </div>
  );
}
