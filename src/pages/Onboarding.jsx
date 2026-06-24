import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, supabase } from '@/api/supabaseClient';
import { GOAL_OPTIONS } from '@/lib/goals';
import { PREDEFINED_RULES } from '@/lib/rules';
import { Camera } from 'lucide-react';
import MilestoneModal from '@/components/MilestoneModal';

const EMOJIS = ['😎', '💪', '🔥', '🦁', '🐺', '⚡', '🌊', '🎯', '🚀', '👑', '🦋', '🌟'];

export default function Onboarding({ user, onComplete }) {
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(user?.full_name || '');
  const [emoji, setEmoji] = useState('😎');
  const [photoUrl, setPhotoUrl] = useState('');
  const [selectedGoals, setSelectedGoals] = useState([]);
  const [rules, setRules] = useState([]);
  const [ruleSearch, setRuleSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [completedProfile, setCompletedProfile] = useState(null);
  const fileInputRef = useRef(null);

  const steps = [
    { title: 'Who are you?', subtitle: 'Set up your identity' },
    { title: 'Your vibe', subtitle: 'Pick your avatar' },
    { title: 'Your mission', subtitle: 'What are you working on?' },
    { title: 'Your rules', subtitle: 'Set your NOs' },
  ];

  function toggleGoal(category) {
    setSelectedGoals(prev =>
      prev.includes(category) ? prev.filter(g => g !== category) : [...prev, category]
    );
  }

  function selectRule(rule) {
    if (rules.some(r => r.id === rule.id)) return;
    setRules(prev => [...prev, rule]);
    setRuleSearch('');
    setShowDropdown(false);
  }

  const filteredRules = ruleSearch.trim()
    ? PREDEFINED_RULES.filter(r =>
        r.title.toLowerCase().includes(ruleSearch.toLowerCase()) &&
        !rules.some(added => added.id === r.id)
      )
    : [];

  async function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoError('');
    setPhotoUploading(true);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      setPhotoUrl(file_url);
    } catch (err) {
      setPhotoError('Upload failed — ' + (err.message || 'please try again'));
    } finally {
      setPhotoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function finish() {
    setSaving(true);
    setSaveError('');
    try {
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .upsert({
          user_id: user.id,
          display_name: displayName || user.email,
          emoji_avatar: emoji,
          photo_avatar_url: photoUrl,
          avatar_mode: photoUrl ? 'flip' : 'emoji',
          goals: selectedGoals,
          onboarding_complete: true,
          vibe_score: 0,
          total_owed: 0,
          dark_mode: true,
          theme: 'lime',
        }, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) throw error;

      for (const r of rules) {
        await supabase.from('rules').insert({
          user_id: user.id,
          title: r.title,
          category: r.category,
          emoji: r.emoji || null,
          penalty_amount: 0,
          current_streak: 0,
          longest_streak: 0,
          active: true,
        });
      }

      setCompletedProfile(profile);
    } catch (err) {
      setSaveError(err.message || 'Something went wrong — please try again');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <div className="min-h-screen flex flex-col bg-background" style={{ background: 'hsl(var(--background))' }}>
      {/* Progress bar */}
      <div className="h-1 bg-secondary">
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'hsl(var(--theme-accent))' }}
          animate={{ width: `${((step + 1) / steps.length) * 100}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        />
      </div>

      <div className="flex-1 flex flex-col max-w-lg mx-auto w-full px-6 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="flex-1 flex flex-col"
          >
            <div className="mb-8">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                Step {step + 1} of {steps.length}
              </p>
              <h1 className="text-3xl font-bold font-heading">{steps[step].title}</h1>
              <p className="text-muted-foreground mt-1">{steps[step].subtitle}</p>
            </div>

            {/* Step 0: Name */}
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Display name</label>
                  <input
                    className="w-full bg-input border border-border rounded-xl px-4 py-4 text-lg font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="What do your friends call you?"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">This is how your partners will see you in the app.</p>
              </div>
            )}

            {/* Step 1: Avatar */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">Pick an emoji</label>
                  <div className="grid grid-cols-6 gap-2">
                    {EMOJIS.map(e => (
                      <motion.button
                        key={e}
                        whileTap={{ scale: 0.8 }}
                        onClick={() => setEmoji(e)}
                        className={`aspect-square text-3xl rounded-xl flex items-center justify-center border-2 transition-all ${
                          emoji === e ? 'border-primary bg-accent-muted scale-110' : 'border-border bg-secondary'
                        }`}
                      >
                        {e}
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">Or upload a photo</label>
                  {photoUrl ? (
                    <div className="flex items-center gap-4">
                      <img src={photoUrl} alt="avatar" className="w-20 h-20 rounded-full object-cover border-2 border-primary" />
                      <div>
                        <p className="text-sm font-semibold text-accent-custom">Photo set ✓</p>
                        <button onClick={() => setPhotoUrl('')} className="text-xs text-muted-foreground mt-1">Remove</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => !photoUploading && fileInputRef.current?.click()}
                      disabled={photoUploading}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-border text-muted-foreground disabled:opacity-60"
                    >
                      <Camera size={20} />
                      <span className="text-sm">{photoUploading ? 'Uploading…' : 'Upload photo'}</span>
                    </button>
                  )}
                  {photoError && <p className="text-xs text-destructive mt-2">{photoError}</p>}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </div>

                {/* Preview */}
                <div className="flex items-center justify-center">
                  <div
                    className="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden"
                    style={{ border: '3px solid hsl(var(--theme-accent))', background: 'hsl(var(--theme-accent-muted))' }}
                  >
                    {photoUrl ? (
                      <img src={photoUrl} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-5xl">{emoji}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Goals */}
            {step === 2 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Select all that apply — this helps match you with the right partners.</p>
                <div className="grid grid-cols-2 gap-2">
                  {GOAL_OPTIONS.filter(g => g.id !== 'custom').map(g => (
                    <motion.button
                      key={g.id}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => toggleGoal(g.category)}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                        selectedGoals.includes(g.category)
                          ? 'border-primary bg-accent-muted'
                          : 'border-border bg-secondary'
                      }`}
                    >
                      <span className="text-2xl">{g.emoji}</span>
                      <span className={`text-sm font-semibold ${selectedGoals.includes(g.category) ? 'text-accent-custom' : 'text-foreground'}`}>
                        {g.label}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Rules */}
            {step === 3 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Add your personal NOs. You can edit these any time from your Home screen.</p>

                {rules.length > 0 && (
                  <div className="space-y-2">
                    {rules.map((r, i) => (
                      <div key={r.id} className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2.5">
                        <span className="text-lg">{r.emoji}</span>
                        <span className="flex-1 text-sm font-medium">{r.title}</span>
                        <button onClick={() => setRules(rules.filter((_, j) => j !== i))} className="text-muted-foreground">✕</button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="relative">
                  <input
                    className="w-full bg-input border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Search rules… e.g. No Alcohol, Daily Running"
                    value={ruleSearch}
                    onChange={e => { setRuleSearch(e.target.value); setShowDropdown(true); }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  />
                  <AnimatePresence>
                    {showDropdown && filteredRules.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute z-10 w-full mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-56 overflow-y-auto"
                      >
                        {filteredRules.map(rule => (
                          <button
                            key={rule.id}
                            type="button"
                            onMouseDown={() => selectRule(rule)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-secondary text-left transition-colors"
                          >
                            <span className="text-base">{rule.emoji}</span>
                            <span className="font-medium">{rule.title}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        {saveError && (
          <div className="mt-4 p-3 rounded-xl bg-destructive/10 text-destructive text-sm text-center">
            {saveError}
          </div>
        )}
        <div className="flex gap-3 mt-4 pb-8">
          {step > 0 && (
            <motion.button
              whileTap={{ scale: 0.92, opacity: 0.7 }}
              onClick={() => setStep(s => s - 1)}
              className="flex-1 py-3.5 rounded-xl border border-border font-bold text-sm"
            >
              Back
            </motion.button>
          )}
          {step < steps.length - 1 ? (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setStep(s => s + 1)}
              disabled={step === 0 && !displayName.trim()}
              className="flex-1 py-3.5 rounded-xl font-bold text-sm"
              style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
            >
              Continue →
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={finish}
              disabled={saving}
              className="flex-1 py-3.5 rounded-xl font-bold text-sm"
              style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
            >
              {saving ? 'Setting up…' : "Let's go! 🚀"}
            </motion.button>
          )}
        </div>
      </div>
    </div>

    <AnimatePresence>
      {completedProfile && (
        <MilestoneModal type="onboarding_complete" onDismiss={() => onComplete(completedProfile)} />
      )}
    </AnimatePresence>
    </>
  );
}
