import React, { useState, useRef, useCallback } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import FeedPost from '@/components/FeedPost';

const DRAG_THRESHOLD = 80;
const POST_HEIGHT_VH = 75;
const OFFSCREEN_PY = () => window.innerHeight;

export default function LocketFeed({
  posts,
  currentUserId,
  profiles = {},
  allPostsByUser = {},
  onOpenChat,
  onRefresh,
  emptyMessage = 'Nothing here yet',
  emptyEmoji = '📭',
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const y = useMotionValue(0);
  const transitioning = useRef(false);

  // Adjacent card previews track the drag so they peek in as the user swipes
  const prevCardY = useTransform(y, v => v - OFFSCREEN_PY());
  const nextCardY = useTransform(y, v => v + OFFSCREEN_PY());

  const goNext = useCallback(() => {
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
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <span className="text-6xl">{emptyEmoji}</span>
        <p className="text-lg font-bold text-center">{emptyMessage}</p>
        <p className="text-sm text-muted-foreground text-center px-8">Posts from you and your partners will appear here.</p>
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
            onOpenChat={onOpenChat}
            onRefresh={onRefresh}
          />
        </div>
      </motion.div>
    </div>
  );
}
