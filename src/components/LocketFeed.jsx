import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import FeedPost from '@/components/FeedPost';

const DRAG_THRESHOLD = 80;
const POST_HEIGHT_VH = 75;
const OFFSCREEN_PY = () => window.innerHeight;

export default function LocketFeed({
  posts,
  currentUserId,
  profiles = {},
  allPostsByUser = {},
  commentCounts = {},
  onOpenChat,
  onRefresh,
  onLogPost,
  isNewUser = false,
  emptyMessage = 'Nothing here yet',
  emptyEmoji = '📭',
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showSwipeHint, setShowSwipeHint] = useState(posts.length > 1);
  const y = useMotionValue(0);
  const transitioning = useRef(false);

  useEffect(() => {
    if (!showSwipeHint) return;
    const t = setTimeout(() => setShowSwipeHint(false), 5000);
    return () => clearTimeout(t);
  }, [showSwipeHint]);

  // Adjacent card previews track the drag so they peek in as the user swipes
  const prevCardY = useTransform(y, v => v - OFFSCREEN_PY());
  const nextCardY = useTransform(y, v => v + OFFSCREEN_PY());

  const goNext = useCallback(() => {
    // Ref flag (not state) prevents rapid swipes from queuing conflicting animations.
    if (transitioning.current || currentIndex >= posts.length - 1) {
      animate(y, 0, { type: 'spring', stiffness: 400, damping: 40 });
      return;
    }
    transitioning.current = true;
    animate(y, -OFFSCREEN_PY(), {
      duration: 0.32,
      ease: [0.32, 0.72, 0, 1],
      onComplete: () => {
        setCurrentIndex(i => i + 1);
        y.set(0);
        transitioning.current = false;
      },
    });
  }, [currentIndex, posts.length, y]);

  const goPrev = useCallback(() => {
    if (transitioning.current || currentIndex <= 0) {
      animate(y, 0, { type: 'spring', stiffness: 400, damping: 40 });
      return;
    }
    transitioning.current = true;
    animate(y, OFFSCREEN_PY(), {
      duration: 0.32,
      ease: [0.32, 0.72, 0, 1],
      onComplete: () => {
        setCurrentIndex(i => i - 1);
        y.set(0);
        transitioning.current = false;
      },
    });
  }, [currentIndex, y]);

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 px-8">
        <motion.span
          className="text-6xl"
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          {isNewUser ? '👋' : emptyEmoji}
        </motion.span>
        <div className="text-center space-y-1.5">
          <p className="text-lg font-bold">Feed is Empty</p>
          <p className="text-sm text-muted-foreground leading-relaxed">Be the first one to post!</p>
        </div>
        {onLogPost && (
          <motion.button
            onClick={onLogPost}
            whileTap={{ scale: 0.94 }}
            animate={{ boxShadow: ['0 0 0 0px hsl(var(--theme-accent)/0.4)', '0 0 0 8px hsl(var(--theme-accent)/0)', '0 0 0 0px hsl(var(--theme-accent)/0.4)'] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm"
            style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
          >
            Log something now →
          </motion.button>
        )}
      </div>
    );
  }

  const post = posts[currentIndex];
  const prevPost = currentIndex > 0 ? posts[currentIndex - 1] : null;
  const nextPost = currentIndex < posts.length - 1 ? posts[currentIndex + 1] : null;
  const userAllPosts = allPostsByUser[post.user_id] || [];

  const cardStyle = {
    position: 'absolute',
    left: 16,
    right: 16,
    height: `${POST_HEIGHT_VH}vh`,
    top: `calc(50% - ${POST_HEIGHT_VH / 2}vh - 32px)`,
  };

  return (
    <div className="relative w-full h-full overflow-hidden select-none">

      {/* Post counter */}
      {posts.length > 1 && (
        <div className="absolute top-3 right-5 z-20 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full pointer-events-none">
          <p className="text-[11px] font-semibold text-white tabular-nums">
            {currentIndex + 1} / {posts.length}
          </p>
        </div>
      )}

      {/* Scroll hint — overlays the bottom of the card so it's always visible */}
      <AnimatePresence>
        {showSwipeHint && nextPost && (
          <motion.div
            key="swipe-hint"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: [0, -5, 0] }}
            exit={{ opacity: 0 }}
            transition={{
              opacity: { duration: 0.35 },
              y: { repeat: Infinity, duration: 1.2, ease: 'easeInOut' },
              exit: { duration: 0.2 },
            }}
            className="absolute left-0 right-0 flex justify-center pointer-events-none z-20"
            style={{ bottom: `calc(50% - ${POST_HEIGHT_VH / 2}vh - 32px + 52px)` }}
          >
            <div className="flex flex-col items-center gap-0.5 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-full">
              <ChevronDown size={15} className="text-white" />
              <p className="text-[11px] font-semibold text-white leading-none">more below</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card above — slides in on downward swipe */}
      {prevPost && (
        <motion.div
          className="pointer-events-none rounded-2xl overflow-hidden"
          style={{ ...cardStyle, y: prevCardY, willChange: 'transform', zIndex: 5 }}
        >
          {prevPost.photo_url ? (
            <img src={prevPost.photo_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
          ) : (
            <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, hsl(var(--theme-accent-muted)), hsl(var(--card)))' }} />
          )}
        </motion.div>
      )}

      {/* Card below — slides in on upward swipe */}
      {nextPost && (
        <motion.div
          className="pointer-events-none rounded-2xl overflow-hidden"
          style={{ ...cardStyle, y: nextCardY, willChange: 'transform', zIndex: 5 }}
        >
          {nextPost.photo_url ? (
            <img src={nextPost.photo_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
          ) : (
            <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, hsl(var(--theme-accent-muted)), hsl(var(--card)))' }} />
          )}
        </motion.div>
      )}

      {/* Main card — no key so the motion.div stays mounted across transitions */}
      <motion.div
        className="rounded-2xl overflow-hidden"
        style={{ ...cardStyle, y, willChange: 'transform', zIndex: 10 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={1}
        onDragEnd={(_, info) => {
          setShowSwipeHint(false);
          if (info.offset.y < -DRAG_THRESHOLD) goNext();
          else if (info.offset.y > DRAG_THRESHOLD) goPrev();
          else animate(y, 0, { type: 'spring', stiffness: 400, damping: 40 });
        }}
      >
        {/* touchAction none for vertical drag; comment scroll overrides this with pan-y */}
        <div className="w-full h-full" style={{ touchAction: 'none' }}>
          <FeedPost
            key={post.id}
            post={post}
            allPosts={userAllPosts}
            currentUserId={currentUserId}
            profiles={profiles}
            initialCommentCount={commentCounts[post.id] || 0}
            onOpenChat={onOpenChat}
            onRefresh={onRefresh}
          />
        </div>
      </motion.div>
    </div>
  );
}
