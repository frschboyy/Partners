import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Trophy, Flame, Camera, Dumbbell, Crown, AlertCircle, Users, Banknote } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { motion } from 'framer-motion';

export default function Leaderboard({ currentUser, profile, onTabChange }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('streak');
  const tabBarRef = useRef(null);
  const swipeStartX = useRef(null);
  const swipeStartY = useRef(null);

  const currencyLabel = profile?.currency_label || 'KSH';

  useEffect(() => {
    if (currentUser) loadLeaderboard();
  }, [currentUser]);

  async function loadLeaderboard() {
    setLoading(true);

    const { data: myPartnerships = [] } = await supabase
      .from('partnerships')
      .select('user_a_id, user_b_id')
      .or(`user_a_id.eq.${currentUser.id},user_b_id.eq.${currentUser.id}`)
      .in('status', ['active', 'negotiating']);

    const partnerIds = myPartnerships.map(p =>
      p.user_a_id === currentUser.id ? p.user_b_id : p.user_a_id
    );
    const groupIds = [currentUser.id, ...partnerIds];

    // Load all partnerships within the group (for correct penalty attribution)
    const groupOrFilter = [
      ...groupIds.map(id => `user_a_id.eq.${id}`),
      ...groupIds.map(id => `user_b_id.eq.${id}`),
    ].join(',');

    const [profilesResult, rulesResult, postsResult, slipsResult, allPartnershipsResult] = await Promise.all([
      supabase.from('user_profiles').select('*').in('user_id', groupIds),
      supabase.from('rules').select('*').in('user_id', groupIds).eq('active', true),
      supabase.from('posts').select('*').in('user_id', groupIds)
        .order('created_at', { ascending: false }).limit(500),
      supabase.from('slips').select('*').in('user_id', groupIds)
        .order('slip_date', { ascending: false }).limit(1000),
      supabase.from('partnerships').select('id, user_a_id, user_b_id').or(groupOrFilter).neq('status', 'dissolved'),
    ]);

    const allProfiles = profilesResult.data || [];
    const allRules = rulesResult.data || [];
    const allPosts = postsResult.data || [];
    const allSlips = slipsResult.data || [];
    const allGroupPartnerships = allPartnershipsResult.data || [];

    // Map: partnershipId → [user_a_id, user_b_id]
    const partnershipParties = {};
    allGroupPartnerships.forEach(p => {
      partnershipParties[p.id] = [p.user_a_id, p.user_b_id];
    });

    const profileMap = {};
    allProfiles.forEach(pr => { profileMap[pr.user_id] = pr; });
    if (profile) profileMap[currentUser.id] = profile;

    function effectivePenalty(s) {
      if (s.penalty_waived) return 0;
      return s.slip_type === 'self'
        ? (s.penalty_amount || 0) * 0.5
        : (s.penalty_amount || 0);
    }

    const stats = groupIds.map(userId => {
      const userProfile = profileMap[userId];
      const userRules = allRules.filter(r => r.user_id === userId);
      const userPosts = allPosts.filter(p => p.user_id === userId);

      // Best rule streak
      const bestStreak = userRules.reduce((max, r) => Math.max(max, r.current_streak || 0), 0);

      // Consecutive posting streak
      const postDates = [...new Set(userPosts.map(p => p.post_date))].sort().reverse();
      let postStreak = 0;
      const today = new Date();
      for (let i = 0; i < postDates.length; i++) {
        const expected = new Date(today);
        expected.setDate(expected.getDate() - i);
        if (postDates[i] === expected.toISOString().split('T')[0]) postStreak++;
        else break;
      }

      // Gym count (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const gymCount = userPosts.filter(p =>
        p.post_type === 'workout' && new Date(p.post_date) >= thirtyDaysAgo
      ).length;

      // Slips (leaderboard — existing logic)
      const userSlips = allSlips.filter(s => s.user_id === userId);
      const selfSlipsRaw = userSlips.filter(s => s.slip_type === 'self');
      const seenSelfSlipKeys = new Set();
      const selfSlips = selfSlipsRaw.filter(s => {
        const key = `${s.slip_date}-${s.rule_id || s.rule_title}`;
        if (seenSelfSlipKeys.has(key)) return false;
        seenSelfSlipKeys.add(key);
        return true;
      });
      const partnerSlips = userSlips.filter(s =>
        s.slip_type === 'witnessed' || (s.reporter_id && s.reporter_id !== userId)
      );
      const selfSlipCount = selfSlips.length;
      const selfSlipPenalty = selfSlips.reduce((sum, s) => sum + (s.penalty_amount || 0) * 0.5, 0);
      const partnerSlipCount = partnerSlips.length;
      const partnerSlipPenalty = partnerSlips.reduce((sum, s) => sum + (s.penalty_amount || 0), 0);

      // ── All-time balance ─────────────────────────────────────────────────
      // Paid: all this user's confirmed/confirmed slips (not disputed/pending)
      const countableUserSlips = userSlips.filter(s =>
        s.status !== 'disputed' && s.status !== 'pending'
      );
      const seenPaidKeys = new Set();
      const dedupedPaidSlips = countableUserSlips.filter(s => {
        if (s.slip_type !== 'self') return true;
        const key = `${s.slip_date}-${s.rule_id || s.rule_title}`;
        if (seenPaidKeys.has(key)) return false;
        seenPaidKeys.add(key);
        return true;
      });
      const allTimePaid = Math.round(
        dedupedPaidSlips.reduce((sum, s) => sum + effectivePenalty(s), 0)
      );

      // Received: slips from others that happened in a partnership involving this user
      // Uses partnership_id to correctly attribute each slip to its recipient
      const receivedSlips = allSlips.filter(s =>
        s.user_id !== userId &&
        s.status !== 'disputed' &&
        s.status !== 'pending' &&
        s.partnership_id &&
        partnershipParties[s.partnership_id]?.includes(userId)
      );
      const allTimeReceived = Math.round(
        receivedSlips.reduce((sum, s) => sum + effectivePenalty(s), 0)
      );

      const allTimeNet = allTimeReceived - allTimePaid;

      return {
        userId,
        profile: userProfile,
        name: userProfile?.display_name || 'Unknown',
        bestStreak,
        postStreak,
        gymCount,
        selfSlipCount,
        selfSlipPenalty,
        partnerSlipCount,
        partnerSlipPenalty,
        allTimePaid,
        allTimeReceived,
        allTimeNet,
        isMe: userId === currentUser.id,
      };
    });

    setEntries(stats);
    setLoading(false);
  }

  const tabs = [
    { id: 'streak',        label: 'Streak',       icon: Flame },
    { id: 'posting',       label: 'Posting',       icon: Camera },
    { id: 'gym',           label: 'Gym',           icon: Dumbbell },
    { id: 'self-slips',    label: 'Self Slips',    icon: AlertCircle },
    { id: 'partner-slips', label: 'Partner Slips', icon: Users },
    { id: 'balance',       label: 'Ledger',        icon: Banknote },
  ];

  const isSlipTab = activeTab === 'self-slips' || activeTab === 'partner-slips';
  const isBalanceTab = activeTab === 'balance';

  const sorted = useMemo(() => [...entries].sort((a, b) => {
    if (activeTab === 'streak')        return b.bestStreak - a.bestStreak;
    if (activeTab === 'posting')       return b.postStreak - a.postStreak;
    if (activeTab === 'gym')           return b.gymCount - a.gymCount;
    if (activeTab === 'self-slips')    return a.selfSlipCount - b.selfSlipCount;
    if (activeTab === 'partner-slips') return a.partnerSlipCount - b.partnerSlipCount;
    if (activeTab === 'balance')       return b.allTimeNet - a.allTimeNet;
    return 0;
  }), [entries, activeTab]);

  function getMetric(entry) {
    if (activeTab === 'streak')        return `${entry.bestStreak} days`;
    if (activeTab === 'posting')       return `${entry.postStreak} day streak`;
    if (activeTab === 'gym')           return `${entry.gymCount} workouts`;
    if (activeTab === 'self-slips')    return `${entry.selfSlipCount} slip${entry.selfSlipCount !== 1 ? 's' : ''} · ${currencyLabel} ${entry.selfSlipPenalty.toFixed(0)} (50% off)`;
    if (activeTab === 'partner-slips') return `${entry.partnerSlipCount} slip${entry.partnerSlipCount !== 1 ? 's' : ''} · ${currencyLabel} ${entry.partnerSlipPenalty.toFixed(0)}`;
    if (activeTab === 'balance')       return `Paid: ${currencyLabel} ${entry.allTimePaid} · Received: ${currencyLabel} ${entry.allTimeReceived}`;
  }

  function getBigDisplay(entry) {
    if (activeTab === 'streak')        return { value: entry.bestStreak, sub: null };
    if (activeTab === 'posting')       return { value: entry.postStreak, sub: null };
    if (activeTab === 'gym')           return { value: entry.gymCount, sub: null };
    if (activeTab === 'self-slips')    return { value: entry.selfSlipCount, sub: null };
    if (activeTab === 'partner-slips') return { value: entry.partnerSlipCount, sub: null };
    if (activeTab === 'balance') {
      const sign = entry.allTimeNet > 0 ? '+' : '';
      return { value: `${sign}${entry.allTimeNet}`, sub: currencyLabel };
    }
  }

  function getBigColor(entry) {
    if (isSlipTab) return 'hsl(var(--destructive))';
    if (isBalanceTab) {
      if (entry.allTimeNet > 0) return 'hsl(var(--theme-accent))';
      if (entry.allTimeNet < 0) return 'hsl(var(--destructive))';
      return 'hsl(var(--muted-foreground))';
    }
    return 'hsl(var(--theme-accent))';
  }

  function handleTouchStart(e) {
    if (tabBarRef.current?.contains(e.target)) return;
    swipeStartX.current = e.touches[0].clientX;
    swipeStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e) {
    if (swipeStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeStartX.current;
    const dy = e.changedTouches[0].clientY - swipeStartY.current;
    swipeStartX.current = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const idx = tabs.findIndex(t => t.id === activeTab);
    if (dx < 0 && idx < tabs.length - 1) setActiveTab(tabs[idx + 1].id);
    else if (dx > 0 && idx > 0) setActiveTab(tabs[idx - 1].id);
  }

  return (
    <div
      className="flex flex-col h-full bg-background"
      data-no-swipe-nav
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-2">
          <Trophy size={22} style={{ color: 'hsl(var(--theme-accent))' }} />
          <h1 className="text-2xl font-bold font-heading">Leaderboard</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Your partner group rankings</p>
      </div>

      {/* Tabs */}
      <div ref={tabBarRef} className="flex gap-1.5 px-4 mb-4 overflow-x-auto pb-1 scrollbar-none">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center justify-center gap-1.5 flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === id ? 'text-primary-foreground' : 'bg-secondary text-muted-foreground'
            }`}
            style={activeTab === id ? { background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' } : {}}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Section subtitle */}
      {isSlipTab && (
        <p className="text-center text-xs text-muted-foreground mb-3 px-4">
          {activeTab === 'self-slips'
            ? 'Self-reported · penalty reduced by 50%'
            : 'Reported by your partner · full penalty applies'}
        </p>
      )}
      {isBalanceTab && (
        <p className="text-center text-xs text-muted-foreground mb-3 px-4">
          All-time penalties paid vs received · permanent record
        </p>
      )}

      <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-6">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 p-4 rounded-xl border border-border animate-pulse">
                <div className="w-8 h-8 rounded bg-muted" />
                <div className="w-10 h-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-muted rounded w-28" />
                  <div className="h-3 bg-muted rounded w-20" />
                </div>
                <div className="h-6 w-10 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
            <motion.span
              className="text-5xl"
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              🏆
            </motion.span>
            <div className="space-y-1">
              <p className="font-bold">No rankings yet</p>
              <p className="text-sm text-muted-foreground">Rankings appear once you form a partnership and start logging streaks together.</p>
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
          sorted.map((entry, idx) => {
            const rankEmoji = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
            const display = getBigDisplay(entry);
            const bigColor = getBigColor(entry);
            const showCrown = idx === 0 && !isSlipTab;

            return (
              <motion.div
                key={entry.userId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                  entry.isMe ? 'border-primary bg-accent-muted' : 'border-border bg-card'
                }`}
                style={entry.isMe
                  ? { boxShadow: '3px 3px 0px hsl(var(--theme-accent) / 0.3)' }
                  : { boxShadow: '3px 3px 0px hsl(var(--border))' }}
              >
                <span className="text-2xl w-8 text-center">{rankEmoji}</span>
                <Avatar profile={entry.profile} size="sm" noAutoFlip />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">
                    {entry.name}
                    {entry.isMe && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{getMetric(entry)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xl font-bold font-display-mono leading-none" style={{ color: bigColor }}>
                    {display.value}
                  </p>
                  {display.sub && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">{display.sub}</p>
                  )}
                </div>
                {showCrown && (
                  <Crown size={18} style={{ color: 'hsl(var(--theme-accent))' }} />
                )}
              </motion.div>
            );
          })
        )}

        {/* All-time balance breakdown for current user */}
        {isBalanceTab && !loading && entries.length > 0 && (() => {
          const me = entries.find(e => e.isMe);
          if (!me) return null;
          return (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: entries.length * 0.05 + 0.1 }}
              className="mt-2 rounded-xl border border-border bg-card p-4 space-y-3"
              style={{ boxShadow: '3px 3px 0px hsl(var(--border))' }}
            >
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your breakdown</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Paid out</p>
                  <p className="font-bold text-base font-display-mono text-destructive">
                    {me.allTimePaid}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{currencyLabel}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Received</p>
                  <p className="font-bold text-base font-display-mono" style={{ color: 'hsl(var(--theme-accent))' }}>
                    {me.allTimeReceived}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{currencyLabel}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Net</p>
                  <p
                    className="font-bold text-base font-display-mono"
                    style={{ color: me.allTimeNet > 0 ? 'hsl(var(--theme-accent))' : me.allTimeNet < 0 ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))' }}
                  >
                    {me.allTimeNet > 0 ? '+' : ''}{me.allTimeNet}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{currencyLabel}</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">
                {me.allTimeNet > 0
                  ? `Partners have paid you ${me.allTimeNet} ${currencyLabel} more than you've paid them.`
                  : me.allTimeNet < 0
                  ? `You've paid ${Math.abs(me.allTimeNet)} ${currencyLabel} more than your partners have paid you.`
                  : "Perfectly even — same amount exchanged both ways."}
              </p>
            </motion.div>
          );
        })()}
      </div>
    </div>
  );
}
