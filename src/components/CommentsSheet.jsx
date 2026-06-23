import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Maximize2, Minimize2, Heart, CornerDownRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/api/supabaseClient';
import Avatar from '@/components/Avatar';
import { timeAgo } from '@/lib/dateUtils';

export default function CommentsSheet({
  postId,
  currentUserId,
  profiles = {},
  currentUserProfile,
  open,
  expanded,
  onExpandedChange,
  onClose,
  onCommentCountChange,
}) {
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [commentMenuId, setCommentMenuId] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [expandedReplies, setExpandedReplies] = useState({});

  const commentInputRef = useRef(null);
  const commentsScrollRef = useRef(null);

  // Re-load comments whenever the sheet opens or the target post changes
  useEffect(() => {
    if (!open || !postId) return;
    setComments([]);
    setCommentText('');
    setReplyingTo(null);
    setExpandedReplies({});
    loadComments();
    // Delay focus until the slide-up animation settles — focusing immediately
    // causes the iOS keyboard to open mid-animation and scroll the view erratically.
    setTimeout(() => commentInputRef.current?.focus(), 200);
  }, [open, postId]);

  async function loadComments() {
    setLoadingComments(true);
    try {
      const msgs = await api.entities.ChatMessage.filter({ post_id: postId }, 'created_at', 100);
      const sorted = [...msgs].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setComments(sorted);
      onCommentCountChange?.(sorted.filter(c => !c.reply_to_id).length);
    } catch (_) {
      setComments([]);
    }
    setLoadingComments(false);
  }

  async function sendComment() {
    if (!commentText.trim() || sendingComment) return;
    setSendingComment(true);
    const text = commentText.trim();
    const replyId = replyingTo?.id || null;
    // 'opt_' prefix marks this as an uncommitted entry so delete/like guards can
    // skip API calls before the real DB id is known.
    const optimistic = {
      id: `opt_${Date.now()}`,
      post_id: postId,
      sender_id: currentUserId,
      sender_name: currentUserProfile?.display_name || 'You',
      content: text,
      created_at: new Date().toISOString(),
      reply_to_id: replyId,
      liked_by: [],
    };
    setComments(prev => [...prev, optimistic]);
    setCommentText('');
    setReplyingTo(null);
    // Defer one tick so the optimistic comment has rendered and scrollHeight is current.
    setTimeout(() => {
      if (commentsScrollRef.current) {
        commentsScrollRef.current.scrollTop = commentsScrollRef.current.scrollHeight;
      }
    }, 50);
    try {
      const msg = await api.entities.ChatMessage.create({
        post_id: postId,
        partnership_id: null,
        sender_id: currentUserId,
        sender_name: currentUserProfile?.display_name || 'You',
        content: text,
        message_type: 'text',
        read_by: [currentUserId],
        reply_to_id: replyId,
        liked_by: [],
      });
      if (msg) {
        setComments(prev => prev.map(c => c.id === optimistic.id ? { ...msg } : c));
      }
    } catch (err) {
      setComments(prev => prev.filter(c => c.id !== optimistic.id));
      setCommentText(text); // Restore typed text so the user can retry without retyping.
      console.error('Comment save failed:', err?.message || err);
    }
    setSendingComment(false);
  }

  async function deleteComment(id) {
    const backup = comments.find(c => c.id === id);
    setComments(prev => prev.filter(c => c.id !== id));
    setCommentMenuId(null);
    // Optimistic comments have no DB record yet — nothing to delete server-side.
    if (!id.startsWith('opt_')) {
      try {
        await api.entities.ChatMessage.delete(id);
      } catch (_) {
        if (backup) setComments(prev => [...prev, backup].sort((a, b) => (a.created_at > b.created_at ? 1 : -1)));
      }
    }
  }

  async function saveCommentEdit(id) {
    const text = editingCommentText.trim();
    if (!text) return;
    setComments(prev => prev.map(c => c.id === id ? { ...c, content: text } : c));
    setEditingCommentId(null);
    setCommentMenuId(null);
    try {
      await api.entities.ChatMessage.update(id, { content: text });
    } catch (_) {}
  }

  async function toggleCommentLike(commentId) {
    setComments(prev => prev.map(c => {
      if (c.id !== commentId) return c;
      const liked = c.liked_by || [];
      const hasLiked = liked.includes(currentUserId);
      return { ...c, liked_by: hasLiked ? liked.filter(id => id !== currentUserId) : [...liked, currentUserId] };
    }));
    // Optimistic comments aren't in the DB yet — UI toggle already applied above.
    if (commentId.startsWith('opt_')) return;
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;
    const liked = comment.liked_by || [];
    const hasLiked = liked.includes(currentUserId);
    try {
      await api.entities.ChatMessage.update(commentId, {
        liked_by: hasLiked ? liked.filter(id => id !== currentUserId) : [...liked, currentUserId],
      });
    } catch (_) {}
  }

  const topLevel = comments.filter(c => !c.reply_to_id);
  const repliesMap = {};
  comments.forEach(c => {
    if (c.reply_to_id) {
      if (!repliesMap[c.reply_to_id]) repliesMap[c.reply_to_id] = [];
      repliesMap[c.reply_to_id].push(c);
    }
  });

  function renderComment(msg, isReply = false, rootId = null) {
    const isMe = msg.sender_id === currentUserId;
    const isOptimistic = msg.id?.startsWith('opt_');
    const showMenu = commentMenuId === msg.id;
    const isEditingThis = editingCommentId === msg.id;
    const likedBy = msg.liked_by || [];
    const hasLiked = likedBy.includes(currentUserId);
    const likeCount = likedBy.length;
    const authorProfile = profiles[msg.sender_id];

    return (
      <div key={msg.id} className={`flex gap-3 ${isReply ? 'pl-11' : ''}`}>
        <div className="flex-shrink-0 mt-0.5">
          <Avatar profile={authorProfile} size="xs" noAutoFlip />
        </div>
        <div className="flex-1 min-w-0">
          {isEditingThis ? (
            <div className="flex gap-2 items-center">
              <input
                value={editingCommentText}
                onChange={e => setEditingCommentText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveCommentEdit(msg.id)}
                className="flex-1 bg-input border border-border rounded-full px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
                onClick={e => e.stopPropagation()}
              />
              <button
                onClick={e => { e.stopPropagation(); saveCommentEdit(msg.id); }}
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
              >✓</button>
              <button
                onClick={e => { e.stopPropagation(); setEditingCommentId(null); setCommentMenuId(null); }}
                className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs flex-shrink-0"
              >✕</button>
            </div>
          ) : (
            <p className="text-sm leading-snug">
              <span className="font-bold mr-1.5">{msg.sender_name}</span>
              <span className="text-foreground">{msg.content}</span>
            </p>
          )}

          {!isEditingThis && (
            <div className="flex items-center gap-4 mt-1.5">
              <span className="text-xs text-muted-foreground">{timeAgo(msg.created_at)}</span>
              <button
                className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                onClick={e => {
                  e.stopPropagation();
                  setReplyingTo({ id: isReply ? rootId : msg.id, name: msg.sender_name });
                  commentInputRef.current?.focus();
                }}
              >Reply</button>
              {isMe && (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground tracking-widest"
                  onClick={e => { e.stopPropagation(); setCommentMenuId(showMenu ? null : msg.id); }}
                >···</button>
              )}
            </div>
          )}

          {showMenu && !isEditingThis && (
            <div className="flex gap-1.5 mt-1.5" onClick={e => e.stopPropagation()}>
              {!isOptimistic && (
                <button
                  onClick={() => { setEditingCommentId(msg.id); setEditingCommentText(msg.content); setCommentMenuId(null); }}
                  className="px-2.5 py-1 rounded-lg bg-secondary text-xs font-semibold"
                >Edit</button>
              )}
              <button
                onClick={e => { e.stopPropagation(); deleteComment(msg.id); }}
                className="px-2.5 py-1 rounded-lg bg-destructive/15 text-destructive text-xs font-semibold"
              >Delete</button>
            </div>
          )}

          {!isReply && (() => {
            const replies = repliesMap[msg.id] || [];
            if (replies.length === 0) return null;
            const isExpanded = expandedReplies[msg.id];
            return (
              <div className="mt-2">
                <button
                  className="text-xs font-semibold text-primary/80 flex items-center gap-1"
                  onClick={e => {
                    e.stopPropagation();
                    setExpandedReplies(prev => ({ ...prev, [msg.id]: !prev[msg.id] }));
                  }}
                >
                  <span className="w-6 h-px bg-muted-foreground/40 inline-block" />
                  {isExpanded ? 'Hide replies' : `View ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
                </button>
                {isExpanded && (
                  <div className="mt-3 space-y-4">
                    {replies.map(reply => renderComment(reply, true, msg.id))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        <div className="flex flex-col items-center gap-0.5 flex-shrink-0 pt-0.5">
          <button onClick={e => { e.stopPropagation(); toggleCommentLike(msg.id); }} className="p-1">
            <Heart size={13} className={hasLiked ? 'text-red-500 fill-red-500' : 'text-muted-foreground'} />
          </button>
          {likeCount > 0 && <span className="text-[10px] text-muted-foreground leading-none">{likeCount}</span>}
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {!expanded && (
            <div className="absolute inset-0 z-[29]" onClick={onClose} />
          )}
          <motion.div
            className="absolute left-0 right-0 bottom-0 z-30 bg-card rounded-t-2xl flex flex-col overflow-hidden"
            style={{ height: expanded ? '100%' : '55%' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
              <motion.button whileTap={{ scale: 0.85 }} onClick={onClose} className="p-1.5 rounded-full bg-secondary">
                <X size={15} />
              </motion.button>
              <p className="font-bold text-sm flex-1">Comments</p>
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => onExpandedChange?.(!expanded)}
                className="p-1.5 rounded-full bg-secondary"
              >
                {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </motion.button>
            </div>

            <div
              ref={commentsScrollRef}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-5"
              style={{ touchAction: 'pan-y' }}
              onClick={() => setCommentMenuId(null)}
            >
              {loadingComments ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
                </div>
              ) : topLevel.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                  <p className="text-3xl">💬</p>
                  <p className="text-sm">No comments yet. Be the first!</p>
                </div>
              ) : (
                topLevel.map(msg => renderComment(msg, false))
              )}
            </div>

            <div className="border-t border-border flex-shrink-0">
              {replyingTo && (
                <div className="flex items-center gap-2 px-4 pt-2.5 pb-0">
                  <CornerDownRight size={12} className="text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-muted-foreground flex-1">
                    Replying to <span className="font-semibold text-foreground">{replyingTo.name}</span>
                  </span>
                  <button onClick={() => setReplyingTo(null)} className="text-muted-foreground">
                    <X size={13} />
                  </button>
                </div>
              )}
              <div className="flex gap-2 px-4 py-3">
                <input
                  ref={commentInputRef}
                  className="flex-1 bg-input border border-border rounded-full px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={replyingTo ? `Reply to ${replyingTo.name}…` : 'Add a comment…'}
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendComment()}
                />
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={sendComment}
                  disabled={sendingComment || !commentText.trim()}
                  className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-40 flex-shrink-0"
                  style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
                >
                  <Send size={14} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
