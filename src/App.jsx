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
import { api } from '@/api/supabaseClient';
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
import { AnimatePresence } from 'framer-motion';

function useBlockBrowserBack() {
  React.useEffect(() => {
    // Push a dummy state so the user always has somewhere to "go back" to within the app
    window.history.pushState({ Partnerz: true }, '');
    const handler = (e) => {
      // Re-push so the back button never exits the SPA while logged in
      window.history.pushState({ Partnerz: true }, '');
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);
}

function MainApp({ user }) {
  useBlockBrowserBack();
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('accountable_last_tab') || 'home');
  const [prevTab, setPrevTab] = useState('home');
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
    const unsub2 = api.entities.Notification.subscribe(() => checkNotifications());
    const unsub3 = api.entities.Slip.subscribe(() => checkNotifications());
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
    const allPartnerships = await api.entities.Partnership.list();
    const myPartnerships = allPartnerships.filter(
      p => (p.user_a_id === user.id || p.user_b_id === user.id) && p.status === 'active'
    );
    let total = 0;
    for (const p of myPartnerships) {
      const msgs = await api.entities.ChatMessage.filter({ partnership_id: p.id }, 'created_at', 100);
      total += msgs.filter(m => !m.read_by?.includes(user.id) && m.sender_id !== user.id).length;
    }
    setUnreadMessages(total);
  }

  function handleTabChange(tab) {
    if (tab === 'feed') setNewFeedPosts(false);
    if (tab !== 'notifications') {
      setPrevTab(tab);
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
        {activeTab === 'notifications' && (
          <div className="h-full" />
        )}
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