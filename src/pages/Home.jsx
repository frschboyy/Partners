import React, { useState, useEffect, useRef } from 'react';
import { Plus, Compass, Flame, Star, ChevronDown, UserX, Eye, AlertTriangle } from 'lucide-react';
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
import CheatGuard from '@/components/CheatGuard';
import { SUMMERTIDES } from '@/lib/constants';

export default function Home({ currentUser, profile, onProfileUpdate }) {
  const { message: homeToastMsg, show: showHomeToast } = useToast();
  const [rules, setRules] = useState([]);
  const [partnerships, setPartnerships] = useState([]);
  const [partnerProfiles, setPartnerProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAddRule, setShowAddRule] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [showLogPost, setShowLogPost] = useState(false);
  const [showMyPosts, setShowMyPosts] = useState(false);
  const [myPosts, setMyPosts] = useState([]);
  const [showAgreement, setShowAgreement] = useState(null);
  const [reportSlip, setReportSlip] = useState(null);
  const [removePartner, setRemovePartner] = useState(null);
  const [showGuard, setShowGuard] = useState(false);
  const [editingStat, setEditingStat] = useState(null); // 'streak' | 'vibe' | null
  const [editValue, setEditValue] = useState('');
  const [removing, setRemoving] = useState(false);
  const [toast, setToast] = useState(null);
  const [summertidesDecl, setSummertidesDecl] = useState(null);
  const [showSummertides, setShowSummertides] = useState(false);

  const today = new Date();
  const isSummertidesWindow = today.getMonth() === SUMMERTIDES.month &&
    today.getDate() >= SUMMERTIDES.startDay &&
    today.getDate() <= SUMMERTIDES.endDay;

  useEffect(() => {
    if (!currentUser) return;
    loadAll();
    const unsubs = [
      api.entities.Partnership.subscribe(() => loadAll()),
      api.entities.PartnerRequest.subscribe(() => loadAll()),
      api.entities.Rule.subscribe(() => loadAll()),
    ];
    return () => unsubs.forEach(fn => fn());
  }, [currentUser]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  async function loadAll() {
    setLoading(true);
    try {
      const [myRules, myPartnerships, declList] = await Promise.all([
        api.entities.Rule.filter({ user_id: currentUser.id }),
        api.entities.Partnership.list(),
        api.entities.SummertidesDeclaration.filter({ user_id: currentUser.id, year: today.getFullYear() }),
      ]);

      setRules(myRules.filter(r => r.active));
      setSummertidesDecl(declList[0] || null);

      const myParties = myPartnerships.filter(p =>
        (p.user_a_id === currentUser.id || p.user_b_id === currentUser.id) &&
        p.status !== 'dissolved'
      );
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
    } catch (err) {
      console.error('Failed to load dashboard:', err?.message || err);
      showHomeToast('Failed to load data — please refresh');
    }
    setLoading(false);
  }

  async function loadMyPosts() {
    try {
      const posts = await api.entities.Post.filter({ user_id: currentUser.id }, '-created_at', 50);
      setMyPosts(posts);
    } catch (err) {
      console.error('Failed to load posts:', err?.message || err);
    }
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

  const overallStreak = rules.length > 0 ? Math.min(...rules.map(r => r.current_streak || 0)) : 0;
  const vibeScore = profile?.vibe_score || 0;
  const activePartners = partnerships.filter(p => p.status === 'active');
  const negotiatingPartners = partnerships.filter(p => p.status === 'negotiating');
  const partnerUserIds = [...activePartners, ...negotiatingPartners].map(
    p => p.user_a_id === currentUser.id ? p.user_b_id : p.user_a_id
  );

  return (
    <div className="flex flex-col min-h-screen bg-background pb-24">
      <Toast message={homeToastMsg} position="top" />
      <div className="max-w-lg mx-auto w-full px-4 pt-6 space-y-6">

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

        {/* Stats strip — tapping a number makes it editable, but trying to change it summons the guard */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card-brutal p-3 flex flex-col items-center gap-1">
            <div className="flex items-center gap-1">
              <Flame size={16} style={{ color: 'hsl(var(--theme-accent))' }} />
              {editingStat === 'streak' ? (
                <input
                  autoFocus
                  type="number"
                  className="text-2xl font-bold font-display-mono w-16 text-center bg-transparent border-b-2 border-primary outline-none"
                  style={{ color: 'hsl(var(--theme-accent))' }}
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => {
                    setEditingStat(null);
                    if (parseInt(editValue, 10) !== overallStreak) setShowGuard(true);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.target.blur(); }
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
            </div>
            <span className="text-xs text-muted-foreground text-center">day streak</span>
          </div>
          <div className="card-brutal p-3 flex flex-col items-center gap-1">
            <div className="flex items-center gap-1">
              <Star size={16} style={{ color: 'hsl(var(--theme-accent))' }} />
              {editingStat === 'vibe' ? (
                <input
                  autoFocus
                  type="number"
                  className="text-2xl font-bold font-display-mono w-16 text-center bg-transparent border-b-2 border-primary outline-none"
                  style={{ color: 'hsl(var(--theme-accent))' }}
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => {
                    setEditingStat(null);
                    if (parseInt(editValue, 10) !== vibeScore) setShowGuard(true);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.target.blur(); }
                    if (e.key === 'Escape') setEditingStat(null);
                  }}
                />
              ) : (
                <span
                  className="text-2xl font-bold font-display-mono cursor-pointer"
                  style={{ color: 'hsl(var(--theme-accent))' }}
                  onClick={() => { setEditingStat('vibe'); setEditValue(String(vibeScore)); }}
                >
                  {vibeScore}
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground text-center">vibe score</span>
          </div>
        </div>

        <CheatGuard visible={showGuard} onDone={() => setShowGuard(false)} />

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

          {loading ? (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="card-brutal p-3 h-14 animate-pulse bg-muted rounded-lg" />
              ))}
            </div>
          ) : rules.length === 0 ? (
            <div className="card-brutal p-6 text-center">
              <p className="text-3xl mb-2">📋</p>
              <p className="font-semibold">No rules yet</p>
              <p className="text-sm text-muted-foreground mt-1">Add your first NO to start your streak.</p>
            </div>
          ) : (
            <div className="space-y-2">
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
        <div className="space-y-3">
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

          {/* Negotiating partnerships */}
          {negotiatingPartners.map(p => {
            const partnerName = p.user_a_id === currentUser.id ? p.user_b_name : p.user_a_name;
            return (
              <div key={p.id} className="card-brutal p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent-muted flex items-center justify-center text-xl">
                  {partnerProfiles[p.user_a_id === currentUser.id ? p.user_b_id : p.user_a_id]?.emoji_avatar || '🤝'}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{partnerName}</p>
                  <p className="text-xs text-muted-foreground">Negotiating terms…</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setShowAgreement(p)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold"
                    style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
                  >
                    Open Agreement
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
            );
          })}

          {/* Active partners */}
          {activePartners.length === 0 && negotiatingPartners.length === 0 && (
            <div className="card-brutal p-6 text-center">
              <p className="text-3xl mb-2">🔭</p>
              <p className="font-semibold">No partners yet</p>
              <p className="text-sm text-muted-foreground mt-1">Tap Discover to find your accountability crew.</p>
            </div>
          )}

          {activePartners.map(p => {
            const partnerId = p.user_a_id === currentUser.id ? p.user_b_id : p.user_a_id;
            const partnerName = p.user_a_id === currentUser.id ? p.user_b_name : p.user_a_name;
            const partnerProfile = partnerProfiles[partnerId];
            return (
              <div key={p.id} className="card-brutal p-3">
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
                {/* Per-partnership financials */}
                <PartnershipFinancials
                  partnership={p}
                  currentUserId={currentUser.id}
                  currentUserName={profile?.display_name || currentUser.full_name}
                  partnerName={partnerName}
                  currencyLabel={profile?.currency_label || 'KSH'}
                />
                {/* Report witnessed slip button */}
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
            profile={profile}
            currentUserId={currentUser.id}
            onClose={() => setShowMyPosts(false)}
            onRefresh={loadMyPosts}
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

