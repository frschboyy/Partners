import React, { useState, useEffect, useRef } from 'react';
import { Plus, Compass, Flame, Star, ChevronDown, UserX, Eye, AlertTriangle, Search } from 'lucide-react';

function streakDays(rule) {
  const anchor = rule.last_slip_date ? new Date(rule.last_slip_date) : new Date(rule.created_at);
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const a = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  return Math.max(0, Math.floor((t - a) / 86400000));
}

function computeVibeScore(rules, activePartnersCount) {
  if (rules.length === 0) return 0.0;
  const streaks = rules.map(r => streakDays(r));
  const overallStreak = Math.min(...streaks);
  const streakPts = Math.min(overallStreak / 14, 1) * 4;
  const ratioSum = rules.reduce((sum, r, i) => {
    if (!r.longest_streak) return sum;
    return sum + Math.min(streaks[i] / r.longest_streak, 1);
  }, 0);
  const ratioPts = (ratioSum / rules.length) * 3;
  const rulePts = Math.min(rules.length / 5, 1) * 1;
  const partnerPts = Math.min(activePartnersCount, 2) * 1;
  return Math.round(Math.min(streakPts + ratioPts + rulePts + partnerPts, 10) * 10) / 10;
}
import { useToast, Toast } from '@/components/Toast';
import PartnershipFinancials from '@/components/PartnershipFinancials';
import { api, supabase } from '@/api/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import Avatar from '@/components/Avatar';
import RuleCard from '@/components/RuleCard';
import AddRuleModal from '@/components/AddRuleModal';
import DiscoverOverlay from '@/components/DiscoverOverlay';
import LogPostModal from '@/components/LogPostModal';
import MyPostsOverlay from '@/components/MyPostsOverlay';
import PartnershipAgreementModal from '@/components/PartnershipAgreementModal';
import WitnessedSlipModal from '@/components/WitnessedSlipModal';
import SelfSlipSection from '@/components/SelfSlipSection';
import CheatGuard from '@/components/CheatGuard';
import { SUMMERTIDES } from '@/lib/constants';

// Home fully unmounts on tab-away (App.jsx only renders the active tab), so an
// in-memory cache needs to live outside the component to survive that — a
// module-level Map persists for the page's lifetime regardless of mount state.
// This is a paint optimization only: loadAll() always still runs and refreshes
// it; the cache just lets a return visit skip straight to real content instead
// of re-running the skeleton every time.
const homeDataCache = new Map();

function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-2.5 w-24 bg-muted rounded-full animate-pulse" />
          <div className="h-6 w-36 bg-muted rounded-full animate-pulse" />
        </div>
        <div className="w-11 h-11 rounded-full bg-muted animate-pulse" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="card-brutal p-3 h-20 animate-pulse bg-muted rounded-lg" />
        <div className="card-brutal p-3 h-20 animate-pulse bg-muted rounded-lg" />
      </div>
      <div className="space-y-3">
        <div className="h-5 w-20 bg-muted rounded-full animate-pulse" />
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="card-brutal p-3 h-14 animate-pulse bg-muted rounded-lg" />
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-5 w-20 bg-muted rounded-full animate-pulse" />
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="card-brutal p-3 h-20 animate-pulse bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home({ currentUser, profile, onProfileUpdate, navIntent, onClearNavIntent }) {
  const { message: homeToastMsg, variant: homeToastVariant, show: showHomeToast } = useToast();
  const [rules, setRules] = useState(() => homeDataCache.get(currentUser?.id)?.rules ?? []);
  const [partnerships, setPartnerships] = useState(() => homeDataCache.get(currentUser?.id)?.partnerships ?? []);
  const [partnerProfiles, setPartnerProfiles] = useState(() => homeDataCache.get(currentUser?.id)?.partnerProfiles ?? {});
  const [loading, setLoading] = useState(() => !homeDataCache.has(currentUser?.id));
  const [showAddRule, setShowAddRule] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [showLogPost, setShowLogPost] = useState(false);
  const [showMyPosts, setShowMyPosts] = useState(false);
  const [myPosts, setMyPosts] = useState([]);
  // Starts true (not false) so the overlay's own "no posts yet" empty state
  // never has a chance to render before the first load resolves — myPosts is
  // seeded empty on every page load, which read as a real "you have zero
  // posts" result for the brief moment before loadMyPosts() actually returned.
  const [loadingMyPosts, setLoadingMyPosts] = useState(true);
  const [showAgreement, setShowAgreement] = useState(null);
  const [reportSlip, setReportSlip] = useState(null);
  const [removePartner, setRemovePartner] = useState(null);
  const [showGuard, setShowGuard] = useState(false);
  const [guardAnchor, setGuardAnchor] = useState(null);
  const streakCardRef = useRef(null);
  const [editingStat, setEditingStat] = useState(null); // 'streak' | 'vibe' | null
  const [editValue, setEditValue] = useState('');
  const [removing, setRemoving] = useState(false);
  const [toast, setToast] = useState(null);
  const [summertidesDecl, setSummertidesDecl] = useState(() => homeDataCache.get(currentUser?.id)?.summertidesDecl ?? null);
  const [showSummertides, setShowSummertides] = useState(false);
  const partnersRef = useRef(null);
  const [partnerSearch, setPartnerSearch] = useState('');
  // Gates the page-level skeleton (see `pageReady` below). loadAll() runs on
  // every realtime subscription event and every overlay dismissal, not just the
  // initial mount — without this ref, each of those background refreshes would
  // flip `loading` true/false again, swapping the real content out for the
  // skeleton and back for no reason even when nothing on screen actually
  // changed. Seeded true on a cache hit so a return visit never re-shows it.
  const hasLoadedOnceRef = useRef(homeDataCache.has(currentUser?.id));

  const [lastSlipAt, setLastSlipAt] = useState(() => homeDataCache.get(currentUser?.id)?.lastSlipAt ?? null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const today = new Date();
  const isSummertidesWindow = today.getMonth() === SUMMERTIDES.month &&
    today.getDate() >= SUMMERTIDES.startDay &&
    today.getDate() <= SUMMERTIDES.endDay;

  useEffect(() => {
    if (!currentUser) return;
    loadAll();
    const unsubs = [
      api.entities.Partnership.subscribeFiltered('user_a_id', currentUser.id, () => loadAll()),
      api.entities.Partnership.subscribeFiltered('user_b_id', currentUser.id, () => loadAll()),
      api.entities.PartnerRequest.subscribeFiltered('recipient_id', currentUser.id, () => loadAll()),
      api.entities.PartnerRequest.subscribeFiltered('requester_id', currentUser.id, () => loadAll()),
      api.entities.Rule.subscribeFiltered('user_id', currentUser.id, () => loadAll()),
    ];
    return () => unsubs.forEach(fn => fn());
  }, [currentUser]);

  // Keeps the cache in sync with every state change, not just loadAll()'s own
  // writes — direct-mutation paths (adding/deleting a rule) update state
  // without going through loadAll(), and those need to reach the cache too so
  // switching tabs away and back right after doesn't show stale data.
  useEffect(() => {
    if (!currentUser?.id) return;
    homeDataCache.set(currentUser.id, { rules, partnerships, partnerProfiles, summertidesDecl, lastSlipAt });
  }, [rules, partnerships, partnerProfiles, summertidesDecl, lastSlipAt, currentUser?.id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!navIntent || loading) return;
    if (navIntent.action === 'openDiscover') {
      setShowDiscover(true);
    } else if (navIntent.action === 'openAgreement') {
      const p = partnerships.find(p =>
        (navIntent.partnershipId && p.id === navIntent.partnershipId) ||
        (navIntent.fromUserId && (p.user_a_id === navIntent.fromUserId || p.user_b_id === navIntent.fromUserId))
      );
      if (p) setShowAgreement(p);
    } else if (navIntent.action === 'viewPartners') {
      setTimeout(() => partnersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    }
    onClearNavIntent?.();
  }, [navIntent, loading, partnerships]);


  async function loadAll() {
    if (!hasLoadedOnceRef.current) setLoading(true);
    try {
      const [myRules, partnershipsResult, declList, lastSlipResult] = await Promise.all([
        api.entities.Rule.filter({ user_id: currentUser.id }),
        supabase
          .from('partnerships')
          .select('*')
          .or(`user_a_id.eq.${currentUser.id},user_b_id.eq.${currentUser.id}`)
          .neq('status', 'dissolved'),
        api.entities.SummertidesDeclaration.filter({ user_id: currentUser.id, year: today.getFullYear() }),
        supabase
          .from('slips')
          .select('created_at')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false })
          .limit(1),
      ]);
      setLastSlipAt(lastSlipResult.data?.[0]?.created_at ?? null);

      setRules(myRules.filter(r => r.active));
      setSummertidesDecl(declList[0] || null);

      const myParties = partnershipsResult.data || [];
      setPartnerships(myParties);

      const partnerIds = myParties.map(p => p.user_a_id === currentUser.id ? p.user_b_id : p.user_a_id);
      if (partnerIds.length > 0) {
        const { data: profileRows } = await supabase
          .from('user_profiles')
          .select('*')
          .in('user_id', partnerIds);
        const byUserId = {};
        profileRows?.forEach(pr => { byUserId[pr.user_id] = pr; });
        setPartnerProfiles(byUserId);
      }

      // Persist computed vibe score — fire-and-forget
      const activeCount = myParties.filter(p => p.status === 'active').length;
      const activeRules = myRules.filter(r => r.active);
      const newVibeScore = computeVibeScore(activeRules, activeCount);
      supabase.from('user_profiles').update({ vibe_score: newVibeScore }).eq('user_id', currentUser.id);
    } catch (err) {
      console.error('Failed to load dashboard:', err?.message || err);
      showHomeToast('Failed to load data — please refresh');
    }
    hasLoadedOnceRef.current = true;
    setLoading(false);
  }

  async function loadMyPosts() {
    setLoadingMyPosts(true);
    try {
      const posts = await api.entities.Post.filter({ user_id: currentUser.id }, '-created_at', 50);
      setMyPosts(posts);
    } catch (err) {
      console.error('Failed to load posts:', err?.message || err);
    }
    setLoadingMyPosts(false);
  }

  async function confirmRemove() {
    if (!removePartner) return;
    setRemoving(true);
    const name = removePartner.partnerName;
    try {
      await handleRemovePartner(removePartner.partnership);
      setRemovePartner(null);
      setToast(`${name} has been removed.`);
    } catch (err) {
      console.error('Failed to remove partner:', err?.message || err);
      setToast('Failed to remove partner — please try again');
    }
    setRemoving(false);
  }

  async function handleRemovePartner(partnership) {
    await api.entities.Partnership.update(partnership.id, {
      status: 'dissolved',
      dissolved_at: new Date().toISOString(),
    });
    await supabase.from('notifications').insert({
      user_id: partnership.user_a_id === currentUser.id ? partnership.user_b_id : partnership.user_a_id,
      type: 'partner_removed',
      title: 'Partnership ended',
      body: `${profile?.display_name || 'Your partner'} ended the accountability partnership.`,
      read: false,
    });
    loadAll();
  }

  async function declaresSummertides() {
    const decl = await api.entities.SummertidesDeclaration.create({
      user_id: currentUser.id,
      user_name: profile?.display_name || currentUser.full_name,
      declared_at: new Date().toISOString(),
      active: true,
      year: today.getFullYear(),
    });
    setSummertidesDecl(decl);
    setShowSummertides(false);
  }

  const activePartners = partnerships.filter(p => p.status === 'active');
  const computedVibeScore = computeVibeScore(rules, activePartners.length);
  const hasActivePartnership = activePartners.length > 0;
  const oldestActivePartnership = [...activePartners].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
  const timerStart = hasActivePartnership
    ? (lastSlipAt ? new Date(lastSlipAt) : (oldestActivePartnership ? new Date(oldestActivePartnership.created_at) : null))
    : null;
  const totalTimerSeconds = timerStart ? Math.max(0, Math.floor((now - timerStart) / 1000)) : 0;
  const overallStreak = Math.floor(totalTimerSeconds / 86400);
  const daySeconds = totalTimerSeconds % 86400;
  const timerH = String(Math.floor(daySeconds / 3600)).padStart(2, '0');
  const timerM = String(Math.floor((daySeconds % 3600) / 60)).padStart(2, '0');
  const timerS = String(daySeconds % 60).padStart(2, '0');
  const timerDisplay = `${timerH}:${timerM}:${timerS}`;
  const negotiatingPartners = partnerships.filter(p => p.status === 'negotiating');
  const totalPartners = activePartners.length + negotiatingPartners.length;
  const searchQuery = partnerSearch.trim().toLowerCase();
  const filteredActive = searchQuery
    ? activePartners.filter(p => (p.user_a_id === currentUser.id ? p.user_b_name : p.user_a_name)?.toLowerCase().includes(searchQuery))
    : activePartners;
  const filteredNegotiating = searchQuery
    ? negotiatingPartners.filter(p => (p.user_a_id === currentUser.id ? p.user_b_name : p.user_a_name)?.toLowerCase().includes(searchQuery))
    : negotiatingPartners;
  const partnerUserIds = [...activePartners, ...negotiatingPartners].map(
    p => p.user_a_id === currentUser.id ? p.user_b_id : p.user_a_id
  );
  // True once the true first load has completed OR was skipped via a cache
  // hit — false only for the genuine "nothing to show yet" first render.
  const pageReady = hasLoadedOnceRef.current || !loading;

  return (
    <div className="flex flex-col min-h-screen bg-background pb-24">
      <Toast message={homeToastMsg} variant={homeToastVariant} position="top" />
      <div className="max-w-lg mx-auto w-full px-4 pt-6">
        {pageReady ? (
        <div className="space-y-6 animate-content-reveal">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Your Dashboard</p>
            <h1 className="text-2xl font-bold font-heading">
              Hey {profile?.display_name?.split(' ')[0] || 'there'} 👋
            </h1>
          </div>
          <Avatar profile={profile} size="md" />
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 gap-3">
          {/* Streak + live timer */}
          <div ref={streakCardRef} className="card-brutal p-3 flex flex-col items-center gap-0.5">
            <div className="flex items-baseline gap-1">
              <Flame size={15} style={{ color: 'hsl(var(--theme-accent))' }} />
              {editingStat === 'streak' ? (
                <input
                  autoFocus
                  type="number"
                  className="text-2xl font-bold font-display-mono w-14 text-center bg-transparent border-b-2 border-primary outline-none"
                  style={{ color: 'hsl(var(--theme-accent))' }}
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => {
                    setEditingStat(null);
                    if (parseInt(editValue, 10) !== overallStreak) {
                      setGuardAnchor(streakCardRef.current?.getBoundingClientRect() ?? null);
                      setShowGuard(true);
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') e.target.blur();
                    if (e.key === 'Escape') setEditingStat(null);
                  }}
                />
              ) : (
                <span
                  className="text-2xl font-bold font-display-mono cursor-pointer"
                  style={{ color: 'hsl(var(--theme-accent))' }}
                  onClick={() => { setEditingStat('streak'); setEditValue(String(overallStreak)); }}
                >
                  {overallStreak}
                </span>
              )}
              <span className="text-sm font-semibold text-muted-foreground">d</span>
            </div>
            <span
              className="text-[11px] font-mono tracking-tight tabular-nums"
              style={{ color: 'hsl(var(--theme-accent) / 0.75)' }}
            >
              {timerDisplay}
            </span>
            <span className="text-[10px] text-muted-foreground">day streak</span>
          </div>

          {/* Vibe score — computed, not editable */}
          <div className="card-brutal p-3 flex flex-col items-center gap-0.5">
            <div className="flex items-baseline gap-1">
              <Star size={15} style={{ color: 'hsl(var(--theme-accent))' }} />
              <span className="text-2xl font-bold font-display-mono" style={{ color: 'hsl(var(--theme-accent))' }}>
                {computedVibeScore.toFixed(1)}
              </span>
              <span className="text-xs text-muted-foreground">/10</span>
            </div>
            <span className="text-[11px] text-muted-foreground/50 tracking-tight">streak · rules · partners</span>
            <span className="text-[10px] text-muted-foreground">vibe score</span>
          </div>
        </div>

        <CheatGuard visible={showGuard} anchor={guardAnchor} onDone={() => setShowGuard(false)} />

        {/* Summertides */}
        {isSummertidesWindow && !summertidesDecl && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-brutal p-4 border border-yellow-500/40 bg-yellow-500/10"
          >
            <p className="font-bold text-sm">🌊 Summertides 2026</p>
            <p className="text-xs text-muted-foreground mt-1">July 1–6. Penalties paused, but everything's still tracked.</p>
            <button
              onClick={() => setShowSummertides(true)}
              className="mt-3 w-full py-2 rounded-lg font-bold text-xs bg-yellow-500 text-black"
            >
              Declare attendance
            </button>
          </motion.div>
        )}
        {summertidesDecl && isSummertidesWindow && (
          <div className="card-brutal p-3 border border-yellow-500/40 bg-yellow-500/10 flex items-center gap-2">
            <span className="text-xl">🌊</span>
            <div>
              <p className="font-bold text-sm">Summertides mode active</p>
              <p className="text-xs text-muted-foreground">Slips tracked, penalties waived Jul 1–6.</p>
            </div>
          </div>
        )}

        {/* My Rules */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">My Rules</h2>
            <motion.button
              whileTap={{ scale: 0.85, opacity: 0.7 }}
              onClick={() => setShowAddRule(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
            >
              <Plus size={13} /> Add Rule
            </motion.button>
          </div>

          {rules.length === 0 ? (
            <div className="card-brutal p-6 text-center animate-content-reveal space-y-3">
              <p className="text-3xl">📋</p>
              <p className="font-semibold">No rules yet</p>
              <p className="text-sm text-muted-foreground">Define what you're committing to — your partners will hold you to it.</p>
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => setShowAddRule(true)}
                animate={{ boxShadow: ['0 0 0 0px hsl(var(--theme-accent)/0.4)', '0 0 0 7px hsl(var(--theme-accent)/0)', '0 0 0 0px hsl(var(--theme-accent)/0.4)'] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold"
                style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
              >
                Add your first rule →
              </motion.button>
            </div>
          ) : (
            <div className="space-y-2 animate-content-reveal">
              {rules.map(rule => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onDeleted={id => { setRules(prev => prev.filter(r => r.id !== id)); showHomeToast('Rule deleted ✓'); }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Partners section */}
        <div ref={partnersRef} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">Partners</h2>
            <motion.button
              whileTap={{ scale: 0.85, opacity: 0.7 }}
              onClick={() => setShowDiscover(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-border bg-secondary text-foreground"
            >
              <Compass size={13} /> Discover
            </motion.button>
          </div>

          {totalPartners >= 2 && (
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-border bg-input text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Search partners…"
                value={partnerSearch}
                onChange={e => setPartnerSearch(e.target.value)}
              />
            </div>
          )}

          {/* Fixed-height scrollable card list — sized to show ~2 cards */}
          <div className="overflow-y-auto space-y-3" style={{ maxHeight: 384 }}>
            {/* Negotiating partnerships — remain fully active, renegotiation is an overlay */}
            {filteredNegotiating.map(p => {
              const partnerId = p.user_a_id === currentUser.id ? p.user_b_id : p.user_a_id;
              const partnerName = p.user_a_id === currentUser.id ? p.user_b_name : p.user_a_name;
              const partnerProfile = partnerProfiles[partnerId];
              const iProposed = p.last_proposer_id === currentUser.id;
              return (
                <div key={p.id} className="card-brutal p-3">
                  <div className="flex items-center gap-3">
                    <Avatar profile={partnerProfile} size="sm" noAutoFlip />
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{partnerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.penalty_amount > 0 ? `${p.penalty_amount} KSH / slip` : 'Honor system'} · <span className="text-yellow-500 font-semibold">Renegotiating</span>
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={iProposed ? undefined : () => setShowAgreement(p)}
                        disabled={iProposed}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold"
                        style={iProposed
                          ? { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', cursor: 'not-allowed', opacity: 0.6 }
                          : { background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }
                        }
                      >
                        {iProposed ? 'Pending' : 'Review'}
                      </button>
                      <motion.button
                        whileTap={{ scale: 0.85 }}
                        onClick={() => setRemovePartner({ partnership: p, partnerName })}
                        className="p-2 rounded-lg bg-secondary text-muted-foreground"
                        title="Cancel connection"
                      >
                        <UserX size={14} />
                      </motion.button>
                    </div>
                  </div>
                  <PartnershipFinancials
                    partnership={p}
                    currentUserId={currentUser.id}
                    currentUserName={profile?.display_name || currentUser.full_name}
                    partnerName={partnerName}
                    partnerUserId={partnerId}
                    currencyLabel={profile?.currency_label || 'KSH'}
                    onToast={showHomeToast}
                    onSettled={loadAll}
                  />
                  <div className="mt-2 pt-2 border-t border-border">
                    <button
                      onClick={() => setReportSlip({ partnership: p, partnerName, partnerId })}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    >
                      <AlertTriangle size={11} /> Report witnessed slip
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Empty state */}
            {activePartners.length === 0 && negotiatingPartners.length === 0 && (
              <div className="card-brutal p-6 text-center animate-content-reveal space-y-3">
                <p className="text-3xl">🔭</p>
                <p className="font-semibold">No partners yet</p>
                <p className="text-sm text-muted-foreground">Accountability works better together. Find someone to keep you honest.</p>
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setShowDiscover(true)}
                  animate={{ boxShadow: ['0 0 0 0px hsl(var(--theme-accent)/0.4)', '0 0 0 7px hsl(var(--theme-accent)/0)', '0 0 0 0px hsl(var(--theme-accent)/0.4)'] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold"
                  style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
                >
                  Find a partner →
                </motion.button>
              </div>
            )}

            {/* No search results */}
            {searchQuery && filteredActive.length === 0 && filteredNegotiating.length === 0 && (
              <div className="card-brutal p-5 text-center space-y-1">
                <p className="text-2xl">🔍</p>
                <p className="font-semibold text-sm">No match for "{partnerSearch.trim()}"</p>
                <p className="text-xs text-muted-foreground">Try a different name.</p>
              </div>
            )}

            {/* Active partners */}
            {filteredActive.map(p => {
              const partnerId = p.user_a_id === currentUser.id ? p.user_b_id : p.user_a_id;
              const partnerName = p.user_a_id === currentUser.id ? p.user_b_name : p.user_a_name;
              const partnerProfile = partnerProfiles[partnerId];
              return (
                <div key={p.id} className="card-brutal p-3 animate-content-reveal">
                  <div className="flex items-center gap-3">
                    <Avatar profile={partnerProfile} size="sm" noAutoFlip />
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{partnerName}</p>
                      <p className="text-xs text-muted-foreground">{p.penalty_amount > 0 ? `${p.penalty_amount} KSH / slip` : 'Honor system'} · Active</p>
                    </div>
                    <div className="flex gap-1">
                      <motion.button
                        whileTap={{ scale: 0.85 }}
                        onClick={() => setShowAgreement(p)}
                        className="p-2 rounded-lg bg-secondary"
                        title="View agreement"
                      >
                        <Eye size={14} />
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.85 }}
                        onClick={() => setRemovePartner({ partnership: p, partnerName })}
                        className="p-2 rounded-lg bg-secondary text-muted-foreground"
                      >
                        <UserX size={14} />
                      </motion.button>
                    </div>
                  </div>
                  <PartnershipFinancials
                    partnership={p}
                    currentUserId={currentUser.id}
                    currentUserName={profile?.display_name || currentUser.full_name}
                    partnerName={partnerName}
                    partnerUserId={partnerId}
                    currencyLabel={profile?.currency_label || 'KSH'}
                    onToast={showHomeToast}
                    onSettled={loadAll}
                  />
                  <div className="mt-2 pt-2 border-t border-border">
                    <button
                      onClick={() => setReportSlip({ partnership: p, partnerName, partnerId })}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    >
                      <AlertTriangle size={11} /> Report witnessed slip
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Self Slip section — always below Partners */}
        <SelfSlipSection
          currentUser={currentUser}
          profile={profile}
          rules={rules}
          activePartnerships={[...activePartners, ...negotiatingPartners]}
          partnerIds={partnerUserIds}
          onOptimisticSlip={(ruleId) => {
            setLastSlipAt(new Date().toISOString());
            setRules(prev => prev.map(r =>
              r.id === ruleId ? { ...r, current_streak: 0 } : r
            ));
          }}
        />

        {/* View My Posts */}
        <div>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => { setShowMyPosts(true); loadMyPosts(); }}
            className="w-full flex items-center justify-between p-3 card-brutal"
          >
            <span className="font-semibold text-sm">View my posts</span>
            <ChevronDown size={16} />
          </motion.button>
        </div>
        </div>
        ) : (
          <HomeSkeleton />
        )}
      </div>

      {/* FAB: Log post */}
      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={() => setShowLogPost(true)}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-30"
        style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
      >
        <Plus size={26} strokeWidth={2.5} />
      </motion.button>

      {/* My posts overlay — opens as grid first */}
      <AnimatePresence>
        {showMyPosts && (
          <MyPostsOverlay
            posts={myPosts}
            loading={loadingMyPosts}
            profile={profile}
            currentUserId={currentUser.id}
            onClose={() => setShowMyPosts(false)}
            onRefresh={loadMyPosts}
            onCreatePost={() => { setShowMyPosts(false); setShowLogPost(true); }}
          />
        )}
      </AnimatePresence>

      {/* Summertides declaration confirm */}
      <AnimatePresence>
        {showSummertides && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={e => e.target === e.currentTarget && setShowSummertides(false)}
          >
            <div className="bg-card rounded-2xl p-6 space-y-4 w-full max-w-sm">
              <div className="text-center">
                <p className="text-5xl mb-3">🌊</p>
                <h2 className="text-xl font-bold">Summertides 2026</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  By declaring attendance, your partners will see you're in Summertides mode.
                  Slips are still logged — penalties are just paused from July 1–6.
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowSummertides(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border font-semibold text-sm">
                  Cancel
                </button>
                <button onClick={declaresSummertides}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-yellow-500 text-black">
                  I'm attending 🌊
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Witnessed slip report */}
      {reportSlip && (
        <WitnessedSlipModal
          currentUser={currentUser}
          profile={profile}
          partnerName={reportSlip.partnerName}
          partnerId={reportSlip.partnerId}
          partnership={reportSlip.partnership}
          onClose={() => setReportSlip(null)}
        />
      )}

      {/* Modals */}
      {showAddRule && (
        <AddRuleModal
          userId={currentUser.id}
          existingRuleTitles={rules.map(r => r.title)}
          onAdded={rule => { setRules(prev => [...prev, rule]); showHomeToast('Rule added ✓'); }}
          onClose={() => setShowAddRule(false)}
        />
      )}
      {showDiscover && (
        <DiscoverOverlay
          currentUser={currentUser}
          currentProfile={profile}
          existingPartnerIds={partnerUserIds}
          onClose={() => setShowDiscover(false)}
          onPartnershipChanged={loadAll}
        />
      )}
      {showLogPost && (
        <LogPostModal
          currentUser={currentUser}
          profile={profile}
          rules={rules}
          partnerIds={partnerUserIds}
          onPosted={loadAll}
          onClose={() => setShowLogPost(false)}
        />
      )}
      {/* Custom remove-partner confirmation */}
      <AnimatePresence>
        {removePartner && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={e => e.target === e.currentTarget && setRemovePartner(null)}
          >
            <motion.div
              className="bg-card rounded-2xl p-6 space-y-4 w-full max-w-sm"
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
            >
              <div className="text-center">
                <p className="text-4xl mb-3">💔</p>
                <h2 className="text-lg font-bold">Remove {removePartner.partnerName}?</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  This ends your accountability partnership immediately. It's mutual and can't be undone from this screen.
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setRemovePartner(null)}
                  className="flex-1 py-2.5 rounded-xl border border-border font-semibold text-sm">
                  Cancel
                </button>
                <button
                  onClick={confirmRemove}
                  disabled={removing}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm bg-destructive text-destructive-foreground disabled:opacity-60"
                >
                  {removing ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showAgreement && (
        <PartnershipAgreementModal
          partnership={showAgreement}
          currentUserId={currentUser.id}
          currentUserRules={rules}
          onClose={() => { setShowAgreement(null); loadAll(); }}
          onAgreed={() => { setShowAgreement(null); loadAll(); }}
          onProposalSent={() => { showHomeToast('Proposal Sent'); }}
        />
      )}

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="fixed bottom-28 left-0 right-0 flex justify-center z-[60] px-6 pointer-events-none"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
          >
            <div className="bg-foreground text-background px-5 py-3 rounded-xl text-sm font-semibold shadow-xl">
              {toast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

