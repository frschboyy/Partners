import React from 'react';
import { Home, Rss, MessageCircle, Trophy, Bell, Settings } from 'lucide-react';
import { motion } from 'framer-motion';

const TABS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'feed', label: 'Feed', icon: Rss },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'leaderboard', label: 'Ranks', icon: Trophy },
  { id: 'notifications', label: 'Alerts', icon: Bell },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function BottomNav({ activeTab, onTabChange, unreadMessages = 0, unreadNotifications = 0, feedHasNew = false }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}>
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-1">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          const badge = id === 'chat' ? unreadMessages : id === 'notifications' ? unreadNotifications : 0;
          const showFeedDot = id === 'feed' && feedHasNew;
          return (
            <motion.button
              key={id}
              whileTap={{ scale: 0.85, opacity: 0.7 }}
              onClick={() => onTabChange(id)}
              aria-label={badge > 0 ? `${label}, ${badge} unread` : label}
              aria-current={isActive ? 'page' : undefined}
              className="flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg min-w-[44px] relative"
              style={{
                color: isActive ? 'hsl(var(--theme-accent))' : 'hsl(var(--muted-foreground))',
              }}
            >
              <div className="relative">
                <Icon size={21} strokeWidth={isActive ? 2.5 : 1.8} aria-hidden="true" />
                {badge > 0 && (
                  <span aria-hidden="true" className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
                {showFeedDot && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full"
                    style={{ background: 'hsl(var(--theme-accent))' }}
                  />
                )}
              </div>
              <span aria-hidden="true" className="text-[10px] font-medium leading-none">{label}</span>
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -top-px left-2 right-2 h-0.5 rounded-full"
                  style={{ background: 'hsl(var(--theme-accent))' }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}