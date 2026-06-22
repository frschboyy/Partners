import React, { useState, useEffect } from 'react';
import { api } from '@/api/supabaseClient';
import { Trophy, Flame, Camera, Dumbbell, Crown } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { motion } from 'framer-motion';

export default function Leaderboard({ currentUser, profile }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('streak');

  useEffect(() => {
    if (currentUser) loadLeaderboard();
  }, [currentUser]);

  async function loadLeaderboard() {
    setLoading(true);
    const [allPartnerships, allProfiles, allRules, allPosts] = await Promise.all([
      api.entities.Partnership.list(),
      api.entities.UserProfile.list(),
      api.entities.Rule.list(),
      api.entities.Post.list('-created_at', 500),
    ]);

    const myPartnerships = allPartnerships.filter(
      p => (p.user_a_id === currentUser.id || p.user_b_id === currentUser.id) && p.status === 'active'
    );

    const partnerIds = myPartnerships.map(p =>
      p.user_a_id === currentUser.id ? p.user_b_id : p.user_a_id
    );
    const groupIds = [currentUser.id, ...partnerIds];

    const profileMap = {};
    allProfiles.forEach(pr => { profileMap[pr.user_id] = pr; });
    if (profile) profileMap[currentUser.id] = profile;

    // Compute stats per user
    const stats = groupIds.map(userId => {
      const userProfile = profileMap[userId];
      const userRules = allRules.filter(r => r.user_id === userId && r.active);
      const userPosts = allPosts.filter(p => p.user_id === userId);

      // Best streak (max across all rules)
      const bestStreak = userRules.reduce((max, r) => Math.max(max, r.current_streak || 0), 0);

      // Posting streak: count consecutive days with at least one post
      const postDates = [...new Set(userPosts.map(p => p.post_date))].sort().reverse();
      let postStreak = 0;
      const today = new Date();
      for (let i = 0; i < postDates.length; i++) {
        const expected = new Date(today);
        expected.setDate(expected.getDate() - i);
        const expectedStr = expected.toISOString().split('T')[0];
        if (postDates[i] === expectedStr) postStreak++;
        else break;
      }

      // Gym count (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const gymCount = userPosts.filter(p =>
        p.post_type === 'workout' && new Date(p.post_date) >= thirtyDaysAgo
      ).length;

      return {
        userId,
        profile: userProfile,
        name: userProfile?.display_name || 'Unknown',
        bestStreak,
        postStreak,
        gymCount,
        isMe: userId === currentUser.id,
      };
    });

    setEntries(stats);
    setLoading(false);
  }

  const tabs = [
    { id: 'streak', label: 'Streak', icon: Flame },
    { id: 'posting', label: 'Posting', icon: Camera },
    { id: 'gym', label: 'Gym', icon: Dumbbell },
  ];

  const sorted = [...entries].sort((a, b) => {
    if (activeTab === 'streak') return b.bestStreak - a.bestStreak;
    if (activeTab === 'posting') return b.postStreak - a.postStreak;
    return b.gymCount - a.gymCount;
  });

  const getMetric = (entry) => {
    if (activeTab === 'streak') return `${entry.bestStreak} days`;
    if (activeTab === 'posting') return `${entry.postStreak} day streak`;
    return `${entry.gymCount} workouts`;
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-2">
          <Trophy size={22} style={{ color: 'hsl(var(--theme-accent))' }} />
          <h1 className="text-2xl font-bold font-heading">Leaderboard</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Your partner group rankings</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 mb-4">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === id
                ? 'text-primary-foreground'
                : 'bg-secondary text-muted-foreground'
            }`}
            style={activeTab === id ? { background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' } : {}}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <p className="text-5xl">🏆</p>
            <p className="font-bold text-center">No rankings yet</p>
            <p className="text-sm text-muted-foreground text-center">Form partnerships and start logging to appear here.</p>
          </div>
        ) : (
          sorted.map((entry, idx) => {
            const rankEmoji = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
            return (
              <motion.div
                key={entry.userId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                  entry.isMe
                    ? 'border-primary bg-accent-muted'
                    : 'border-border bg-card'
                }`}
                style={entry.isMe ? { boxShadow: '3px 3px 0px hsl(var(--theme-accent) / 0.3)' } : { boxShadow: '3px 3px 0px hsl(var(--border))' }}
              >
                <span className="text-2xl w-8 text-center">{rankEmoji}</span>
                <Avatar profile={entry.profile} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">
                    {entry.name}
                    {entry.isMe && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{getMetric(entry)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold font-display-mono" style={{ color: 'hsl(var(--theme-accent))' }}>
                    {activeTab === 'streak' ? entry.bestStreak : activeTab === 'posting' ? entry.postStreak : entry.gymCount}
                  </p>
                </div>
                {idx === 0 && (
                  <Crown size={18} style={{ color: 'hsl(var(--theme-accent))' }} />
                )}
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}