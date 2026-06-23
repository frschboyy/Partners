import React, { useState, useEffect } from 'react';
import { api, supabase } from '@/api/supabaseClient';
import LocketFeed from '@/components/LocketFeed';
import { motion } from 'framer-motion';

export default function Feed({ currentUser, profile }) {
  const [posts, setPosts] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [allPostsByUser, setAllPostsByUser] = useState({});
  const [commentCounts, setCommentCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [chatTarget, setChatTarget] = useState(null);
  const [chatPartnership, setChatPartnership] = useState(null);
  const [partnerships, setPartnerships] = useState([]);

  useEffect(() => {
    if (currentUser) loadFeed();
  }, [currentUser]);

  async function loadFeed() {
    setLoading(true);
    try {
      const [allPartnerships, allProfiles] = await Promise.all([
        api.entities.Partnership.list(),
        api.entities.UserProfile.list(),
      ]);

      const myPartnerships = allPartnerships.filter(
        p => (p.user_a_id === currentUser.id || p.user_b_id === currentUser.id) && p.status === 'active'
      );
      setPartnerships(myPartnerships);

      const partnerIds = myPartnerships.map(p =>
        p.user_a_id === currentUser.id ? p.user_b_id : p.user_a_id
      );
      const allowedUserIds = [currentUser.id, ...partnerIds];

      const profileMap = {};
      allProfiles.forEach(pr => { profileMap[pr.user_id] = pr; });
      if (profile) profileMap[currentUser.id] = profile;
      setProfiles(profileMap);

      // Feed: last 7 days, with a 20-post floor so sparse partnerships aren't empty
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: recentPosts, error: recentErr } = await supabase
        .from('posts')
        .select('*')
        .in('user_id', allowedUserIds)
        .gte('created_at', oneWeekAgo)
        .order('created_at', { ascending: false })
        .limit(100);
      if (recentErr) throw recentErr;

      let feedPosts = recentPosts || [];

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

      // Grid view needs all posts per user (not just the feed window)
      const { data: allUserPosts } = await supabase
        .from('posts')
        .select('*')
        .in('user_id', allowedUserIds)
        .order('created_at', { ascending: false })
        .limit(200);

      const byUser = {};
      (allUserPosts || []).forEach(p => {
        if (!byUser[p.user_id]) byUser[p.user_id] = [];
        byUser[p.user_id].push(p);
      });
      setAllPostsByUser(byUser);

      setPosts(feedPosts);

      // Fetch top-level comment counts for all feed posts in one query
      const postIds = feedPosts.map(p => p.id);
      const counts = {};
      if (postIds.length > 0) {
        const { data: commentRows } = await supabase
          .from('chat_messages')
          .select('post_id')
          .in('post_id', postIds)
          .is('reply_to_id', null);
        if (commentRows) {
          commentRows.forEach(r => {
            counts[r.post_id] = (counts[r.post_id] || 0) + 1;
          });
        }
      }
      setCommentCounts(counts);
    } catch (err) {
      console.error('Failed to load feed:', err?.message || err);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full relative">
      <LocketFeed
        posts={posts}
        currentUserId={currentUser.id}
        profiles={profiles}
        allPostsByUser={allPostsByUser}
        commentCounts={commentCounts}
        onOpenChat={(post) => {
          // Find the partnership for this post author
          const partnership = partnerships.find(p =>
            p.user_a_id === post.user_id || p.user_b_id === post.user_id
          );
          setChatTarget({ post, partnership });
        }}
        onRefresh={loadFeed}
        emptyMessage="Your feed is empty"
        emptyEmoji="🌱"
      />

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
      read_by: [currentUser.id],
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