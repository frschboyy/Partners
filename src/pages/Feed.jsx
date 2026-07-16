import React, { useState, useEffect, useRef } from 'react';
import { api, supabase } from '@/api/supabaseClient';
import LocketFeed from '@/components/LocketFeed';
import LogPostModal from '@/components/LogPostModal';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast, Toast } from '@/components/Toast';

const CARD_H = '75vh';
const CARD_TOP = 'calc(50% - 37.5vh - 32px)';

function FeedSkeleton() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Peeking ghost card below — communicates the stack */}
      <div
        className="absolute left-4 right-4 rounded-2xl bg-muted/40 animate-pulse"
        style={{ height: CARD_H, top: CARD_TOP, transform: 'translateY(12px) scale(0.97)', zIndex: 5 }}
      />

      {/* Main skeleton card */}
      <div
        className="absolute left-4 right-4 rounded-2xl overflow-hidden bg-muted animate-pulse"
        style={{ height: CARD_H, top: CARD_TOP, zIndex: 10 }}
      >
        {/* Simulated photo gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 pointer-events-none" />

        {/* Top chrome — avatar + name/type */}
        <div className="absolute top-4 left-4 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-white/20 flex-shrink-0" />
          <div className="space-y-1.5">
            <div className="h-3 w-24 bg-white/20 rounded-full" />
            <div className="h-2.5 w-16 bg-white/10 rounded-full" />
          </div>
        </div>

        {/* Bottom — caption lines + action circles */}
        <div className="absolute bottom-4 left-4 right-4">
          <div className="space-y-2 mb-3">
            <div className="h-3 w-3/4 bg-white/20 rounded-full" />
            <div className="h-2.5 w-1/2 bg-white/10 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-black/30" />
            <div className="w-10 h-10 rounded-full bg-black/30" />
          </div>
        </div>
      </div>

      {/* Swipe hint dots */}
      <div
        className="absolute left-0 right-0 flex items-center justify-center gap-1"
        style={{ bottom: 'calc(50% - 37.5vh - 20px)' }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
        <div className="w-4 h-1.5 rounded-full bg-muted-foreground/50" />
        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
      </div>
    </div>
  );
}

export default function Feed({ currentUser, profile }) {
  const { message: feedToastMessage, variant: feedToastVariant, show: showFeedToast } = useToast();
  const [posts, setPosts] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [allPostsByUser, setAllPostsByUser] = useState({});
  const [commentCounts, setCommentCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [chatTarget, setChatTarget] = useState(null);
  const [chatPartnership, setChatPartnership] = useState(null);
  const [partnerships, setPartnerships] = useState([]);
  const [showLogPost, setShowLogPost] = useState(false);
  // loadFeed() also runs as onRefresh after comments/edits/deletes and after
  // closing the log-post modal, not just on mount — gating the skeleton to
  // the true first load only stops those background refreshes from flashing
  // the whole feed back to skeletons and remounting the post cards.
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    if (currentUser) loadFeed();
  }, [currentUser]);

  async function loadFeed() {
    if (!hasLoadedOnceRef.current) setLoading(true);
    try {
      // Partnerships first so we can scope all subsequent queries to relevant users only
      const { data: myPartnerships = [] } = await supabase
        .from('partnerships')
        .select('*')
        .or(`user_a_id.eq.${currentUser.id},user_b_id.eq.${currentUser.id}`)
        .in('status', ['active', 'negotiating']);
      setPartnerships(myPartnerships);

      const partnerIds = myPartnerships.map(p =>
        p.user_a_id === currentUser.id ? p.user_b_id : p.user_a_id
      );
      const allowedUserIds = [currentUser.id, ...partnerIds];

      // Feed: last 7 days, with a 20-post floor so sparse partnerships aren't empty
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Scoped profile fetch and recent posts run in parallel
      const [profileResult, recentPostsResult] = await Promise.all([
        supabase.from('user_profiles').select('*').in('user_id', allowedUserIds),
        supabase.from('posts').select('*').in('user_id', allowedUserIds)
          .gte('created_at', oneWeekAgo).order('created_at', { ascending: false }).limit(100),
      ]);

      const profileMap = {};
      profileResult.data?.forEach(pr => { profileMap[pr.user_id] = pr; });
      if (profile) profileMap[currentUser.id] = profile;
      setProfiles(profileMap);

      if (recentPostsResult.error) throw recentPostsResult.error;
      let feedPosts = recentPostsResult.data || [];

      if (feedPosts.length < 20) {
        const { data: olderPosts } = await supabase
          .from('posts')
          .select('*')
          .in('user_id', allowedUserIds)
          .lt('created_at', oneWeekAgo)
          .order('created_at', { ascending: false })
          .limit(20 - feedPosts.length);
        feedPosts = [...feedPosts, ...(olderPosts || [])];
      }

      setPosts(feedPosts);
      hasLoadedOnceRef.current = true;
      setLoading(false);

      // Secondary data — grid view and comment counts. Load after paint so the feed is visible immediately.
      const postIds = feedPosts.map(p => p.id);
      const [allUserPostsResult, commentResult] = await Promise.all([
        supabase.from('posts').select('*').in('user_id', allowedUserIds)
          .order('created_at', { ascending: false }).limit(200),
        postIds.length > 0
          ? supabase.from('chat_messages').select('post_id').in('post_id', postIds).is('reply_to_id', null)
          : Promise.resolve({ data: [] }),
      ]);

      const byUser = {};
      (allUserPostsResult.data || []).forEach(p => {
        if (!byUser[p.user_id]) byUser[p.user_id] = [];
        byUser[p.user_id].push(p);
      });
      setAllPostsByUser(byUser);

      const counts = {};
      (commentResult.data || []).forEach(r => {
        counts[r.post_id] = (counts[r.post_id] || 0) + 1;
      });
      setCommentCounts(counts);
    } catch (err) {
      console.error('Failed to load feed:', err?.message || err);
      showFeedToast('Failed to load feed — please refresh');
      hasLoadedOnceRef.current = true;
      setLoading(false);
    }
  }

  return (
    <div className="h-full relative">
      <Toast message={feedToastMessage} variant={feedToastVariant} />

      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.div
            key="skeleton"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <FeedSkeleton />
          </motion.div>
        ) : (
          <motion.div
            key="feed"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.22 }}
          >
            <LocketFeed
              posts={posts}
              currentUserId={currentUser.id}
              profiles={profiles}
              allPostsByUser={allPostsByUser}
              commentCounts={commentCounts}
              onOpenChat={(post) => {
                const partnership = partnerships.find(p =>
                  p.user_a_id === post.user_id || p.user_b_id === post.user_id
                );
                setChatTarget({ post, partnership });
              }}
              onRefresh={loadFeed}
              onLogPost={() => setShowLogPost(true)}
              isNewUser={profile?.created_at ? (Date.now() - new Date(profile.created_at).getTime()) < 48 * 60 * 60 * 1000 : false}
              emptyMessage="Your feed is empty"
              emptyEmoji="🌱"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat drawer */}
      {chatTarget && (
        <ChatDrawer
          currentUser={currentUser}
          profile={profile}
          partnership={chatTarget.partnership}
          post={chatTarget.post}
          onClose={() => setChatTarget(null)}
        />
      )}

      {showLogPost && (
        <LogPostModal
          currentUser={currentUser}
          profile={profile}
          onClose={() => setShowLogPost(false)}
          onPosted={() => { setShowLogPost(false); loadFeed(); }}
        />
      )}
    </div>
  );
}

function ChatDrawer({ currentUser, profile, partnership, post, onClose }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = React.useRef(null);

  useEffect(() => {
    if (partnership) loadMessages();
  }, [partnership]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadMessages() {
    const msgs = await api.entities.ChatMessage.filter({ partnership_id: partnership.id }, 'created_at', 100);
    setMessages(msgs);
  }

  async function sendMessage() {
    if (!text.trim() || !partnership) return;
    setSending(true);
    const msg = await api.entities.ChatMessage.create({
      partnership_id: partnership.id,
      sender_id: currentUser.id,
      sender_name: profile?.display_name || currentUser.full_name,
      content: text.trim(),
      post_id: post?.id,
      message_type: 'text',
    });
    setMessages(prev => [...prev, msg]);
    setText('');
    setSending(false);
  }

  return (
    <motion.div
      className="absolute inset-0 z-50 bg-card flex flex-col"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      style={{ touchAction: 'none' }}
    >
      <div className="flex items-center gap-3 p-4 border-b border-border flex-shrink-0">
        <button onClick={onClose} className="p-2 rounded-full bg-secondary text-sm font-bold">←</button>
        <div>
          <p className="font-bold text-sm">
            {partnership ? (partnership.user_a_id === currentUser.id ? partnership.user_b_name : partnership.user_a_name) : 'Chat'}
          </p>
          {post && <p className="text-xs text-muted-foreground">Re: {post.post_type} post</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="text-4xl">💬</p>
            <p className="text-sm text-muted-foreground text-center">Say something →</p>
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.sender_id === currentUser.id;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-3 py-2 rounded-2xl ${isMe ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                style={{ background: isMe ? 'hsl(var(--theme-accent))' : 'hsl(var(--secondary))', color: isMe ? 'hsl(var(--theme-accent-fg))' : 'hsl(var(--foreground))' }}>
                {!isMe && <p className="text-xs font-semibold mb-0.5 opacity-70">{msg.sender_name}</p>}
                <p className="text-sm">{msg.content}</p>
                <p className="text-[10px] opacity-60 mt-0.5 text-right">
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="p-4 border-t border-border flex gap-2 flex-shrink-0">
        <input
          className="flex-1 bg-input border border-border rounded-full px-4 py-2.5 text-sm text-foreground"
          placeholder="Type a message…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
        />
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={sendMessage}
          disabled={sending || !text.trim()}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
        >
          →
        </motion.button>
      </div>
    </motion.div>
  );
}