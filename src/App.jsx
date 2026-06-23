import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import ScrollToTop from './components/ScrollToTop';
import React, { useState, useEffect, useRef } from 'react';
import { api, supabase } from '@/api/supabaseClient';
import { applyTheme, getSavedTheme, saveTheme, applyFontSize, getSavedFontSize, saveFontSize } from '@/lib/theme';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Onboarding from './pages/Onboarding';
import Home from './pages/Home';
import Feed from './pages/Feed';
import Chat from './pages/Chat';
import Leaderboard from './pages/Leaderboard';
import Settings from './pages/Settings';
import BottomNav from './components/BottomNav';
import NotificationsPanel from './components/NotificationsPanel';
import { AnimatePresence, motion } from 'framer-motion';
import { useOnlineStatus } from '@/lib/useOnlineStatus';

// The app has no traditional page stack — the back button should never eject the
// user to whatever was open before they launched it (e.g. the browser home screen).
// We push a sentinel history entry on mount, then re-push whenever popstate fires so
// there is always an entry ahead of the current one for the browser to "pop" to.
function useBlockBrowserBack() {
  React.useEffect(() => {
    window.history.pushState({ Partnerz: true }, '');
    const handler = () => {
      window.history.pushState({ Partnerz: true }, '');
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);
}

function OfflineBanner() {
  const online = useOnlineStatus();
  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ y: -48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -48, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold"
          style={{ background: 'hsl(var(--destructive))', color: 'hsl(var(--destructive-foreground))' }}
          aria-live="assertive"
          role="alert"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 animate-pulse" />
          You're offline — some features may not work
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MainApp({ user }) {
  useBlockBrowserBack();
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('accountable_last_tab') || 'home');
  const [prevTab, setPrevTab] = useState('home');
  const [slideDir, setSlideDir] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [currentTheme, setCurrentTheme] = useState(() => getSavedTheme().theme);
  const [darkMode, setDarkMode] = useState(() => getSavedTheme().darkMode);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [newFeedPosts, setNewFeedPosts] = useState(false);
  const [settingsSection, setSettingsSection] = useState(null);

  useEffect(() => {
    applyTheme(currentTheme, darkMode);
    applyFontSize(getSavedFontSize());
  }, []);

  useEffect(() => {
    if (user) loadProfile();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    checkUnread();
    checkNotifications();
    const unsub = api.entities.ChatMessage.subscribe(() => checkUnread());
    const unsub2 = api.entities.Notification.subscribeFiltered('user_id', user.id, () => checkNotifications());
    const unsub3 = api.entities.Slip.subscribeFiltered('user_id', user.id, () => checkNotifications());
    const unsub4 = api.entities.Post.subscribe(event => {
      if (event.type === 'insert' && event.data?.user_id !== user.id) {
        setNewFeedPosts(true);
      }
    });
    return () => { unsub(); unsub2(); unsub3(); unsub4(); };
  
  }, [user]);

  async function loadProfile() {
    if (!profile) setLoadingProfile(true);
    const profiles = await api.entities.UserProfile.filter({ user_id: user.id });
    if (profiles.length > 0) {
      const p = profiles[0];
      setProfile(p);
      // Apply saved theme from profile
      if (p.theme || p.dark_mode !== undefined) {
        const theme = p.theme || 'lime';
        const dm = p.dark_mode !== undefined ? p.dark_mode : true;
        setCurrentTheme(theme);
        setDarkMode(dm);
        applyTheme(theme, dm);
        saveTheme(theme, dm);
      }
      if (p.font_size) {
        applyFontSize(p.font_size);
        saveFontSize(p.font_size);
      }
    }
    setLoadingProfile(false);
  }

  async function checkNotifications() {
    const [notifs, pendingSlips] = await Promise.all([
      api.entities.Notification.filter({ user_id: user.id, read: false }),
      api.entities.Slip.filter({ user_id: user.id, status: 'pending' }),
    ]);
    const needsPassword =
      !user.identities?.some(i => i.provider === 'email') &&
      !user.user_metadata?.has_set_password;
    setUnreadNotifications(notifs.length + pendingSlips.length + (needsPassword ? 1 : 0));
  }

  async function checkUnread() {
    try {
      const { data: myPartnerships } = await supabase
        .from('partnerships')
        .select('id')
        .or(`user_a_id.eq.${user.id},user_b_id.eq.${user.id}`)
        .in('status', ['active', 'negotiating']);

      if (!myPartnerships?.length) { setUnreadMessages(0); return; }

      const ids = myPartnerships.map(p => p.id);

      // Try RPC first (requires SQL migration — see setup guide)
      const { data: counts, error: rpcError } = await supabase.rpc('get_unread_counts', {
        p_partnership_ids: ids,
        p_user_id: user.id,
      });

      if (!rpcError && counts) {
        setUnreadMessages(counts.reduce((sum, row) => sum + Number(row.unread_count), 0));
        return;
      }

      // Fallback: single batch query — still far better than N+1
      const { data: msgs } = await supabase
        .from('chat_messages')
        .select('read_by')
        .in('partnership_id', ids)
        .eq('is_deleted', false)
        .neq('sender_id', user.id);

      setUnreadMessages((msgs || []).filter(m => !m.read_by?.includes(user.id)).length);
    } catch (err) {
      console.error('checkUnread failed:', err?.message || err);
    }
  }

  const TAB_ORDER = ['home', 'feed', 'chat', 'leaderboard', 'settings'];

  function handleTabChange(tab) {
    if (tab === 'feed') setNewFeedPosts(false);
    if (tab !== 'notifications') {
      const prevIdx = TAB_ORDER.indexOf(activeTab);
      const nextIdx = TAB_ORDER.indexOf(tab);
      setSlideDir(nextIdx >= prevIdx ? 1 : -1);
      setPrevTab(activeTab);
      localStorage.setItem('accountable_last_tab', tab);
    }
    setActiveTab(tab);
  }

  if (loadingProfile) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile || !profile.onboarding_complete) {
    return <Onboarding user={user} onComplete={p => { setProfile(p); loadProfile(); }} />;
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <OfflineBanner />
      <AnimatePresence>
        {activeTab === 'notifications' && (
          <NotificationsPanel
            currentUser={user}
            profile={profile}
            onClose={() => { handleTabChange(prevTab); checkNotifications(); }}
            onNavigateToSettings={(section) => { handleTabChange('settings'); setSettingsSection(section || null); }}
          />
        )}
      </AnimatePresence>
      {/* Page content */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait" initial={false}>
          {activeTab !== 'notifications' && (
            <motion.div
              key={activeTab}
              initial={{ x: slideDir * 28, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: slideDir * -28, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
              className="absolute inset-0"
            >
              {activeTab === 'home' && (
                <div className="h-full overflow-y-auto">
                  <Home
                    currentUser={user}
                    profile={profile}
                    onProfileUpdate={setProfile}
                  />
                </div>
              )}
              {activeTab === 'feed' && (
                <div className="h-full">
                  <Feed currentUser={user} profile={profile} />
                </div>
              )}
              {activeTab === 'chat' && (
                <div className="h-full overflow-y-auto">
                  <Chat currentUser={user} profile={profile} />
                </div>
              )}
              {activeTab === 'leaderboard' && (
                <div className="h-full overflow-y-auto">
                  <Leaderboard currentUser={user} profile={profile} />
                </div>
              )}
              {activeTab === 'settings' && (
                <div className="h-full overflow-y-auto">
                  <Settings
                    currentUser={user}
                    profile={profile}
                    onProfileUpdate={setProfile}
                    currentTheme={currentTheme}
                    darkMode={darkMode}
                    onThemeChange={setCurrentTheme}
                    onDarkModeChange={setDarkMode}
                    scrollToSection={settingsSection}
                    onSectionHandled={() => setSettingsSection(null)}
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <BottomNav
        activeTab={activeTab}
        onTabChange={tab => { handleTabChange(tab); if (tab === 'notifications') checkNotifications(); }}
        unreadMessages={unreadMessages}
        unreadNotifications={unreadNotifications}
        feedHasNew={newFeedPosts}
      />
    </div>
  );

}

const LoadingScreen = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 border-4 border-border border-t-primary rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground font-medium">Loading Accountable…</p>
    </div>
  </div>
);

const AuthenticatedApp = () => {
  const { user } = useAuth();
  return <MainApp user={user} />;
};

function PublicRoute({ element }) {
  const { isAuthenticated, isLoadingAuth, authChecked } = useAuth();
  if (isLoadingAuth || !authChecked) return <LoadingScreen />;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return element;
}

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <Routes>
            <Route path="/login" element={<PublicRoute element={<Login />} />} />
            <Route path="/register" element={<PublicRoute element={<Register />} />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} fallback={<LoadingScreen />} />}>
              <Route path="*" element={<AuthenticatedApp />} />
            </Route>
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;