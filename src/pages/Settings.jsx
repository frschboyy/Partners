import React, { useState, useRef, useEffect } from 'react';
import { api, supabase } from '@/api/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { Moon, Sun, Camera, LogOut, Check, Eye, EyeOff, Lock, ChevronDown, Trash2 } from 'lucide-react';
import { THEMES, applyTheme, saveTheme, FONT_SIZES, applyFontSize, getSavedFontSize, saveFontSize } from '@/lib/theme';
import Avatar from '@/components/Avatar';
import { useToast, Toast } from '@/components/Toast';
import { useAuth } from '@/lib/AuthContext';

const EMOJIS = ['😎', '💪', '🔥', '🦁', '🐺', '⚡', '🌊', '🎯', '🚀', '👑', '🦋', '🌟', '🫡', '🤙', '✊', '🏆'];

export default function Settings({ currentUser, profile, onProfileUpdate, currentTheme, darkMode, onThemeChange, onDarkModeChange, scrollToSection, onSectionHandled }) {
  const { checkUserAuth } = useAuth();
  const { message: toastMessage, variant: toastVariant, show: showToast } = useToast({ duration: 2000 });
  const [editName, setEditName] = useState(profile?.display_name || '');
  const [editEmoji, setEditEmoji] = useState(profile?.emoji_avatar || '😎');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef(null);

  const needsSetPassword =
    !currentUser?.identities?.some(i => i.provider === 'email') &&
    !currentUser?.user_metadata?.has_set_password;
  const [oldPassword, setOldPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [settingPassword, setSettingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [deleteStep, setDeleteStep] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [pendingFontSize, setPendingFontSize] = useState(() => getSavedFontSize());
  const [showColorTheme, setShowColorTheme] = useState(false);
  const [showTextSize, setShowTextSize] = useState(false);
  const passwordRef = useRef(null);

  useEffect(() => {
    if (scrollToSection === 'password' && passwordRef.current) {
      passwordRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (!needsSetPassword) setShowChangePassword(true);
      onSectionHandled?.();
    }
  }, [scrollToSection]);

  async function handleSetPassword(e) {
    e.preventDefault();
    setPasswordError('');
    if (!needsSetPassword && !oldPassword) {
      setPasswordError('Enter your current password first.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordError('Include at least one uppercase letter and one number.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setSettingPassword(true);
    const toastMsg = needsSetPassword ? 'Password set ✓' : 'Password updated ✓';
    try {
      if (!needsSetPassword) {
        const { error: verifyErr } = await supabase.auth.signInWithPassword({
          email: currentUser.email,
          password: oldPassword,
        });
        if (verifyErr) {
          setPasswordError('Current password is incorrect.');
          setSettingPassword(false);
          return;
        }
      }
      await api.auth.setPassword(newPassword);
      await checkUserAuth();
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowChangePassword(false);
      showToast(toastMsg);
    } catch (err) {
      setPasswordError(err.message || 'Failed to set password. Please try again.');
    } finally {
      setSettingPassword(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    const emailToNotify = currentUser?.email;
    try {
      const { error } = await supabase.rpc('delete_user');
      if (error) throw error;
      if (emailToNotify) {
        api.integrations.Core.SendEmail({
          to: emailToNotify,
          subject: 'Your account has been deleted',
          body: `Hi,\n\nYour Partners account (${emailToNotify}) has been permanently deleted. All your data — profile, rules, posts, partnerships, and messages — has been erased and cannot be recovered.\n\nIf you didn't request this, please contact support immediately.\n\nThe Partners team`,
        }).catch(() => {});
      }
      await supabase.auth.signOut();
      showToast('Account deleted');
      setTimeout(() => { window.location.href = '/login'; }, 1600);
    } catch (err) {
      setDeleting(false);
      setDeleteStep(0);
      showToast(err?.message || 'Failed to delete account. Please try again.', 'error');
    }
  }

  async function saveProfile() {
    if (!profile) return;
    setSaving(true);
    const updated = await api.entities.UserProfile.update(profile.id, {
      display_name: editName,
      emoji_avatar: editEmoji,
    });
    onProfileUpdate?.(updated);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file || !profile) return;
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      const updated = await api.entities.UserProfile.update(profile.id, {
        photo_avatar_url: file_url,
        avatar_mode: 'flip',
      });
      onProfileUpdate?.(updated);
    } catch (err) {
      showToast(err?.userMessage ?? 'Photo upload failed — please try again', 'error');
    }
  }

  async function removePhoto() {
    if (!profile) return;
    const updated = await api.entities.UserProfile.update(profile.id, {
      photo_avatar_url: '',
      avatar_mode: 'emoji',
    });
    onProfileUpdate?.(updated);
  }

  function handleApplyFontSize() {
    applyFontSize(pendingFontSize);
    saveFontSize(pendingFontSize);
    if (profile) {
      api.entities.UserProfile.update(profile.id, { font_size: pendingFontSize });
    }
    showToast('Font size applied!');
  }

  function handleThemeChange(theme) {
    onThemeChange(theme);
    saveTheme(theme, darkMode);
    applyTheme(theme, darkMode);
    if (profile) {
      api.entities.UserProfile.update(profile.id, { theme, dark_mode: darkMode });
    }
  }

  function handleDarkModeChange(val) {
    onDarkModeChange(val);
    saveTheme(currentTheme, val);
    applyTheme(currentTheme, val);
    if (profile) {
      api.entities.UserProfile.update(profile.id, { dark_mode: val, theme: currentTheme });
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-background pb-24">
      <Toast message={toastMessage} variant={toastVariant} position="top" />
      <div className="max-w-lg mx-auto w-full px-4 pt-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-heading">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Customise your experience</p>
        </div>

        {/* Avatar & Profile */}
        <div className="card-brutal p-5 space-y-4">
          <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Profile</h2>
          <div className="flex items-center gap-4">
            <Avatar profile={profile} size="lg" />
            <div className="space-y-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-sm font-medium"
              >
                <Camera size={14} /> Change photo
              </button>
              {profile?.photo_avatar_url && (
                <button onClick={removePhoto} className="text-xs text-muted-foreground">Remove photo</button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Display name</label>
            <input
              className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              value={editName}
              onChange={e => setEditName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Emoji avatar</label>
            <div className="grid grid-cols-8 gap-1.5">
              {EMOJIS.map(e => (
                <motion.button
                  key={e}
                  whileTap={{ scale: 0.8 }}
                  onClick={() => setEditEmoji(e)}
                  className={`aspect-square text-2xl rounded-lg flex items-center justify-center border-2 transition-all ${
                    editEmoji === e ? 'border-primary bg-accent-muted' : 'border-transparent bg-secondary'
                  }`}
                >
                  {e}
                </motion.button>
              ))}
            </div>
          </div>

          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={saveProfile}
            disabled={saving}
            className="w-full py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2"
            style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
          >
            {saved ? <><Check size={16} /> Saved!</> : saving ? 'Saving…' : 'Save Profile'}
          </motion.button>
        </div>

        {/* Dark mode */}
        <div className="card-brutal p-5 space-y-4">
          <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Appearance</h2>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {darkMode ? <Moon size={20} /> : <Sun size={20} />}
              <div>
                <p className="font-semibold text-sm">{darkMode ? 'Dark mode' : 'Light mode'}</p>
                <p className="text-xs text-muted-foreground">Change the overall vibe</p>
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => handleDarkModeChange(!darkMode)}
              className="relative w-12 h-6 rounded-full transition-all"
              style={{ background: darkMode ? 'hsl(var(--theme-accent))' : 'hsl(var(--secondary))' }}
            >
              <motion.div
                animate={{ x: darkMode ? 24 : 2 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="absolute top-1 w-4 h-4 bg-white rounded-full shadow"
              />
            </motion.button>
          </div>
        </div>

        {/* Color themes */}
        <div className="card-brutal p-5 space-y-4">
          <button
            type="button"
            onClick={() => setShowColorTheme(v => !v)}
            className="w-full flex items-center justify-between"
          >
            <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Color Theme</h2>
            <motion.span animate={{ rotate: showColorTheme ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown size={18} className="text-muted-foreground" />
            </motion.span>
          </button>
          {showColorTheme && (
            <div className="space-y-2">
              {THEMES.map(t => (
                <motion.button
                  key={t.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleThemeChange(t.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                    currentTheme === t.id ? 'border-primary' : 'border-border bg-secondary'
                  }`}
                  style={currentTheme === t.id ? { background: 'hsl(var(--theme-accent-muted))', borderColor: 'hsl(var(--theme-accent))' } : {}}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-lg bg-background border border-border">
                    {t.label.split(' ')[0]}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{t.label.split(' ').slice(1).join(' ')}</p>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  </div>
                  {currentTheme === t.id && (
                    <Check size={16} style={{ color: 'hsl(var(--theme-accent))' }} />
                  )}
                </motion.button>
              ))}
            </div>
          )}
        </div>

        {/* Font size */}
        <div className="card-brutal p-5 space-y-4">
          <button
            type="button"
            onClick={() => setShowTextSize(v => !v)}
            className="w-full flex items-center justify-between"
          >
            <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Text Size</h2>
            <motion.span animate={{ rotate: showTextSize ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown size={18} className="text-muted-foreground" />
            </motion.span>
          </button>
          {showTextSize && (
            <>
              <p className="text-xs text-muted-foreground -mt-2">Select a size, then tap Apply to update the whole app.</p>
              <div className="space-y-2">
                {FONT_SIZES.map(s => (
                  <motion.button
                    key={s.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setPendingFontSize(s.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all"
                    style={pendingFontSize === s.id
                      ? { background: 'hsl(var(--theme-accent-muted))', borderColor: 'hsl(var(--theme-accent))' }
                      : { background: 'hsl(var(--secondary))', borderColor: 'hsl(var(--border))' }}
                  >
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center font-bold bg-background border border-border flex-shrink-0"
                      style={{ fontSize: `${s.px}px`, lineHeight: 1 }}
                    >
                      Aa
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{s.label}</p>
                      <p className="text-xs text-muted-foreground">{s.description}</p>
                    </div>
                    {pendingFontSize === s.id && (
                      <Check size={16} style={{ color: 'hsl(var(--theme-accent))' }} />
                    )}
                  </motion.button>
                ))}
              </div>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleApplyFontSize}
                className="w-full py-3 rounded-lg font-bold text-sm"
                style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
              >
                Apply
              </motion.button>
            </>
          )}
        </div>

        {/* Password section — always visible */}
        <div ref={passwordRef} className="card-brutal p-5 space-y-4">
          {needsSetPassword ? (
            <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Set Password</h2>
          ) : (
            <button
              type="button"
              onClick={() => { setShowChangePassword(v => !v); setPasswordError(''); setOldPassword(''); setNewPassword(''); setConfirmPassword(''); }}
              className="w-full flex items-center justify-between"
            >
              <h2 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Change Password</h2>
              <motion.span animate={{ rotate: showChangePassword ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown size={18} className="text-muted-foreground" />
              </motion.span>
            </button>
          )}

          {(needsSetPassword || showChangePassword) && (
            <form onSubmit={handleSetPassword} className="space-y-3">
              {!needsSetPassword && (
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type={showOld ? 'text' : 'password'}
                    placeholder="Current password"
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    className="w-full h-11 pl-10 pr-10 rounded-lg border border-border bg-input text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowOld(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label={showOld ? 'Hide password' : 'Show password'}
                  >
                    {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              )}
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showNew ? 'text' : 'password'}
                  placeholder="New password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full h-11 pl-10 pr-10 rounded-lg border border-border bg-input text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                  aria-label={showNew ? 'Hide password' : 'Show password'}
                >
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {newPassword && (() => {
                let score = 1;
                if (newPassword.length >= 8) score++;
                if (/[A-Z]/.test(newPassword)) score++;
                if (/[0-9]/.test(newPassword)) score++;
                const cfg = [null,
                  { label: 'Weak',   color: '#ef4444' },
                  { label: 'Fair',   color: '#f97316' },
                  { label: 'Good',   color: '#eab308' },
                  { label: 'Strong', color: '#22c55e' },
                ][score];
                return (
                  <div className="space-y-1.5 px-0.5">
                    <div className="flex gap-1">
                      {[1,2,3,4].map(i => (
                        <div key={i} className="flex-1 h-1.5 rounded-full transition-all duration-300"
                          style={{ background: i <= score ? cfg.color : 'hsl(var(--border))' }} />
                      ))}
                    </div>
                    <p className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</p>
                  </div>
                );
              })()}
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full h-11 pl-10 pr-10 rounded-lg border border-border bg-input text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {passwordError && (
                <p className="text-xs text-destructive">{passwordError}</p>
              )}
              <motion.button
                type="submit"
                whileTap={{ scale: 0.96 }}
                disabled={settingPassword}
                className="w-full py-3 rounded-lg font-bold text-sm"
                style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
              >
                {settingPassword ? 'Saving…' : needsSetPassword ? 'Set password' : 'Update password'}
              </motion.button>
            </form>
          )}
        </div>

        {/* Sign out + Delete */}
        <div className="card-brutal p-5 space-y-3">
          <motion.button
            whileTap={{ scale: 0.96, opacity: 0.7 }}
            onClick={() => api.auth.logout('/')}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-destructive text-destructive-foreground font-bold text-sm"
          >
            <LogOut size={16} />
            Sign Out
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.96, opacity: 0.7 }}
            onClick={() => setDeleteStep(1)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-destructive text-destructive font-semibold text-sm"
          >
            <Trash2 size={16} />
            Delete Account
          </motion.button>
        </div>
      </div>

      {/* Delete account confirmation overlay */}
      <AnimatePresence>
        {deleteStep > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-8"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-card rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-xl"
            >
              {deleteStep === 1 && (
                <>
                  <div className="space-y-1">
                    <h3 className="font-bold text-lg">Delete your account?</h3>
                    <p className="text-sm text-muted-foreground">You'll lose access to everything. Are you sure you want to continue?</p>
                  </div>
                  <div className="flex gap-3">
                    <motion.button whileTap={{ scale: 0.96 }} onClick={() => setDeleteStep(0)} className="flex-1 py-3 rounded-xl bg-secondary font-semibold text-sm">
                      Cancel
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.96 }} onClick={() => setDeleteStep(2)} className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm">
                      Continue
                    </motion.button>
                  </div>
                </>
              )}
              {deleteStep === 2 && (
                <>
                  <div className="space-y-1">
                    <h3 className="font-bold text-lg">This cannot be undone</h3>
                    <p className="text-sm text-muted-foreground">
                      Your profile, rules, posts, partnerships, messages, and all other data will be <span className="font-semibold text-foreground">permanently erased</span>. There is no way to recover it.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <motion.button whileTap={{ scale: 0.96 }} onClick={() => setDeleteStep(0)} disabled={deleting} className="flex-1 py-3 rounded-xl bg-secondary font-semibold text-sm">
                      Cancel
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.96 }} onClick={handleDeleteAccount} disabled={deleting} className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm">
                      {deleting ? 'Deleting…' : 'Delete my account'}
                    </motion.button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}