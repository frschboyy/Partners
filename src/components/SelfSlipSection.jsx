import React, { useState, useRef } from 'react';
import { Camera, X, CheckCircle } from 'lucide-react';
import { api, supabase } from '@/api/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { compressImage } from '@/lib/imageUtils';

export default function SelfSlipSection({ currentUser, profile, rules, activePartnerships, partnerIds, onOptimisticSlip }) {
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const { file_url } = await api.integrations.Core.UploadFile({ file: compressed });
      setPhotoUrl(file_url);
    } catch {
      setError('Photo upload failed. Try again.');
    }
    setUploading(false);
    e.target.value = '';
  }

  async function handleSubmit() {
    if (!selectedRuleId) return;
    setSaving(true);
    setError('');
    onOptimisticSlip?.(selectedRuleId);
    const today = new Date().toISOString().split('T')[0];
    const rule = rules.find(r => r.id === selectedRuleId);

    try {
      // Single atomic RPC: resets streak + inserts one slip per partnership with its own penalty
      const { error: rpcError } = await supabase.rpc('log_self_slip', {
        p_user_id: currentUser.id,
        p_rule_id: selectedRuleId,
        p_partnership_ids: activePartnerships.map(p => p.id),
        p_penalty_amounts: activePartnerships.map(p => p.penalty_amount || 0),
        p_notes: null,
        p_post_id: null,
      });
      if (rpcError) throw rpcError;

      // Create post only when a photo is included
      if (photoUrl) {
        const visibleTo = [currentUser.id, ...partnerIds];
        await api.entities.Post.create({
          user_id: currentUser.id,
          author_name: profile?.display_name || currentUser.full_name,
          author_emoji: profile?.emoji_avatar || '😎',
          post_type: 'slip',
          caption: '',
          photo_url: photoUrl,
          photo_urls: [photoUrl],
          post_date: today,
          visible_to: visibleTo,
          reactions: [],
          rule_id: selectedRuleId,
          rule_title: rule?.title || '',
          penalty_applied: activePartnerships[0]?.penalty_amount
            ? Math.round(activePartnerships[0].penalty_amount * 0.5)
            : 0,
        });
      }

      setDone(true);
      setSelectedRuleId('');
      setPhotoUrl('');
      setTimeout(() => setDone(false), 2000);
    } catch (err) {
      console.error('Failed to log self slip:', err?.message || err);
      setError('Failed to log — please try again.');
    }
    setSaving(false);
  }

  const canSubmit = !!selectedRuleId && !saving && !uploading;

  return (
    <div className="space-y-3">
      <h2 className="font-bold text-lg">Self Slip</h2>
      <div className="card-brutal p-4 space-y-4">

        {/* Rule selector */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            What did you slip on?
          </p>
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add rules above to log a slip.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {rules.map(r => (
                <motion.button
                  key={r.id}
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setSelectedRuleId(prev => prev === r.id ? '' : r.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    selectedRuleId === r.id
                      ? 'border-destructive bg-destructive/10 text-destructive'
                      : 'border-border bg-secondary text-muted-foreground'
                  }`}
                >
                  {r.title}
                </motion.button>
              ))}
            </div>
          )}
        </div>

        {/* Optional photo */}
        <div className="flex items-center gap-3">
          {photoUrl ? (
            <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
              <img src={photoUrl} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setPhotoUrl('')}
                className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white"
              >
                <X size={10} />
              </button>
            </div>
          ) : (
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-16 h-16 border-2 border-dashed border-border rounded-lg flex items-center justify-center text-muted-foreground flex-shrink-0"
            >
              {uploading
                ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                : <Camera size={18} />
              }
            </motion.button>
          )}
          <p className="text-xs text-muted-foreground leading-snug">
            {photoUrl
              ? 'Photo attached · this slip will appear in the feed'
              : 'Add a photo to share this in the feed (optional)'}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoUpload}
          />
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        {/* Submit */}
        <AnimatePresence mode="wait">
          {done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center gap-2 py-2.5 text-sm font-bold"
              style={{ color: 'hsl(var(--theme-accent))' }}
            >
              <CheckCircle size={16} /> Logged — stay accountable!
            </motion.div>
          ) : (
            <motion.button
              key="submit"
              type="button"
              whileTap={{ scale: 0.96 }}
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="w-full py-2.5 rounded-lg font-bold text-sm disabled:opacity-40 transition-opacity bg-destructive text-destructive-foreground"
            >
              {saving ? 'Logging…' : 'Log Self Slip 😔'}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
