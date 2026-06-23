import { useState, useCallback, useEffect } from 'react';
import { api } from '@/api/supabaseClient';

export function usePostReactions(post, currentUserId) {
  const [localReactions, setLocalReactions] = useState(null);

  // Without this, switching posts in MyPostsOverlay would briefly flash the
  // previous post's reactions before the new post's data arrives.
  useEffect(() => {
    setLocalReactions(null);
  }, [post?.id]);

  const reactions = localReactions ?? (post?.reactions || []);
  const myReaction = reactions.find(r => r.user_id === currentUserId);
  const reactionGroups = {};
  reactions.forEach(r => { reactionGroups[r.emoji] = (reactionGroups[r.emoji] || 0) + 1; });

  const toggleReaction = useCallback(async (emoji) => {
    if (!post) return;
    const base = localReactions ?? (post.reactions || []);
    const existing = base.find(r => r.user_id === currentUserId);
    let updated;
    if (existing) {
      if (existing.emoji === emoji) updated = base.filter(r => r.user_id !== currentUserId);
      else updated = base.map(r => r.user_id === currentUserId ? { ...r, emoji } : r);
    } else {
      updated = [...base, { user_id: currentUserId, emoji, created_at: new Date().toISOString() }];
    }
    setLocalReactions(updated);
    try {
      await api.entities.Post.update(post.id, { reactions: updated });
    } catch (_) {}
  }, [post, currentUserId, localReactions]);

  return { reactions, myReaction, reactionGroups, toggleReaction };
}
