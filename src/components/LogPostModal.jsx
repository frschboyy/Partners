import React, { useState, useRef, useEffect } from 'react';
import { X, Mic, MicOff, Camera, RefreshCw, Plus, AlertCircle } from 'lucide-react';
import { api, supabase } from '@/api/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { compressImage } from '@/lib/imageUtils';
import { useToast, Toast } from '@/components/Toast';

const POST_TYPES = [
  { id: 'meal', label: '🍽️ Meal', desc: 'Log what you ate' },
  { id: 'workout', label: '💪 Workout', desc: 'Log your training' },
];

// Groq cold-start can take ~8s; add network overhead and leave a comfortable margin.
const TRANSCRIBE_TIMEOUT_MS = 15000;

export default function LogPostModal({ currentUser, profile, rules = [], partnerIds = [], onPosted, onClose }) {
  const [postType, setPostType] = useState('meal');
  const [caption, setCaption] = useState('');
  const [photoUrls, setPhotoUrls] = useState([]); // multi-photo array
  const [workoutType, setWorkoutType] = useState('');
  const [workoutDuration, setWorkoutDuration] = useState('');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const { message: toastMessage, variant: toastVariant, show: showToast } = useToast();
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const fileInputRef = useRef(null);
  const transcribeTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      clearTimeout(transcribeTimeoutRef.current);
      // stop any active recording on unmount
      try { mediaRecorderRef.current?.stop(); } catch (_) {}
    };
  }, []);

  async function startRecording() {
    setVoiceError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Use webm if supported, fallback to mp4/ogg
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/ogg';
      const mr = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = handleRecordingStop;
      mr.start(100); // collect in 100ms chunks for reliability
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch (err) {
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setVoiceError('No microphone found on this device.');
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setVoiceError('Microphone blocked — click the lock icon in your browser address bar, set Microphone to Allow, then refresh.');
      } else {
        setVoiceError('Could not access microphone: ' + (err.message || err.name));
      }
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
    }
    setRecording(false);
  }

  async function handleRecordingStop() {
    if (chunksRef.current.length === 0) {
      setVoiceError('Recording was empty. Please try again.');
      return;
    }
    setTranscribing(true);
    setVoiceError('');

    // Set a timeout to avoid infinite spinner
    transcribeTimeoutRef.current = setTimeout(() => {
      setTranscribing(false);
      setVoiceError('Transcription timed out. Please type your description instead.');
    }, TRANSCRIBE_TIMEOUT_MS);

    try {
      const mimeType = chunksRef.current[0]?.type || 'audio/webm';
      const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
      const blob = new Blob(chunksRef.current, { type: mimeType });
      // Give the blob a proper filename so the transcription service recognises the format
      const audioFile = new File([blob], `recording.${ext}`, { type: mimeType });
      const { file_url } = await api.integrations.Core.UploadFile({ file: audioFile });
      const transcript = await api.integrations.Core.TranscribeAudio({ audio_url: file_url });

      if (!transcript || !transcript.trim()) {
        clearTimeout(transcribeTimeoutRef.current);
        setTranscribing(false);
        setVoiceError('Could not transcribe audio. Please type your description.');
        return;
      }

      const cleaned = await api.integrations.Core.InvokeLLM({
        prompt: `Clean up this voice transcription into a clear, concise description. Remove filler words, fix grammar, make it natural. Return ONLY the cleaned text, nothing else.\n\nTranscription: "${transcript}"`,
      });

      clearTimeout(transcribeTimeoutRef.current);
      setCaption(typeof cleaned === 'string' ? cleaned.trim() : transcript.trim());
      setTranscribing(false);
    } catch (err) {
      clearTimeout(transcribeTimeoutRef.current);
      setTranscribing(false);
      setVoiceError('Voice transcription failed. Please type your description instead.');
    }
  }

  async function handlePhotoUpload(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setPhotoError('');
    try {
      const compressed = await Promise.all(files.map(f => compressImage(f)));
      const uploads = await Promise.all(
        compressed.map(file => api.integrations.Core.UploadFile({ file }))
      );
      const newUrls = uploads.map(r => r.file_url).filter(Boolean);
      setPhotoUrls(prev => [...prev, ...newUrls]);
    } catch (err) {
      setPhotoError(err?.userMessage ?? 'Upload failed. Please try again.');
    }
    setUploading(false);
    // reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removePhoto(idx) {
    setPhotoUrls(prev => prev.filter((_, i) => i !== idx));
  }

  const canSubmit = !saving && photoUrls.length > 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (photoUrls.length === 0) {
      setPhotoError('Please add at least one photo before posting.');
      return;
    }
    setSaving(true);
    const today = new Date().toISOString().split('T')[0];
    const visibleTo = [currentUser.id, ...partnerIds];

    try {
      const postData = {
        user_id: currentUser.id,
        author_name: profile?.display_name || currentUser.full_name,
        author_emoji: profile?.emoji_avatar || '😎',
        post_type: postType,
        caption,
        photo_url: photoUrls[0] || '',
        photo_urls: photoUrls,
        post_date: today,
        visible_to: visibleTo,
        reactions: [],
      };
      if (postType === 'workout') {
        postData.workout_type = workoutType;
        postData.workout_duration = Number(workoutDuration);
      }
      await api.entities.Post.create(postData);

      const bodyText = caption?.trim()
        ? `"${caption.trim().slice(0, 80)}${caption.trim().length > 80 ? '…' : ''}"`
        : `${photoUrls.length} photo${photoUrls.length !== 1 ? 's' : ''} uploaded`;
      supabase.from('notifications').insert({
        user_id: currentUser.id,
        type: 'self_post_created',
        title: `You logged a ${postType}`,
        body: bodyText,
        read: true,
      });

      showToast('Post logged!');
      setTimeout(() => { onPosted?.(); onClose(); }, 900);
    } catch (err) {
      console.error('Failed to submit post:', err?.message || err);
      showToast('Failed to post — please try again', 'error');
    }
    setSaving(false);
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/70"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <Toast message={toastMessage} variant={toastVariant} />
        <motion.div
          className="w-full max-w-lg bg-card rounded-t-2xl flex flex-col"
          style={{ maxHeight: '92vh' }}
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          <div className="p-5 border-b border-border flex items-center justify-between flex-shrink-0">
            <h2 className="text-lg font-bold">Log Something</h2>
            <button onClick={onClose} className="p-2 rounded-full bg-secondary"><X size={18} /></button>
          </div>

          {/* Type selector */}
          <div className="flex gap-2 p-4 border-b border-border flex-shrink-0">
            {POST_TYPES.map(t => (
              <motion.button
                key={t.id}
                whileTap={{ scale: 0.94 }}
                onClick={() => { setPostType(t.id); setPhotoError(''); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-all ${
                  postType === t.id
                    ? 'border-primary bg-accent-muted text-accent-custom'
                    : 'border-border bg-secondary text-muted-foreground'
                }`}
              >
                {t.label}
              </motion.button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 space-y-4">
            {/* Caption / description */}
            {postType !== 'workout' && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                  {postType === 'meal' ? 'What did you eat?' : 'Notes'}
                </label>
                <textarea
                  className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={3}
                  placeholder={postType === 'meal' ? 'Describe your meal...' : 'What happened?'}
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                />

                {/* Voice-to-text — labelled so it's discoverable */}
                {postType === 'meal' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {transcribing ? (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-muted text-xs font-semibold text-muted-foreground">
                        <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin inline-block" />
                        Transcribing… (up to 15s)
                      </span>
                    ) : recording ? (
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        onClick={stopRecording}
                        animate={{ scale: [1, 1.04, 1] }}
                        transition={{ repeat: Infinity, duration: 0.8 }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold"
                      >
                        <MicOff size={13} /> Stop recording
                      </motion.button>
                    ) : (
                      <button
                        type="button"
                        onClick={startRecording}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-muted-foreground text-xs font-semibold transition-colors hover:text-foreground"
                      >
                        <Mic size={13} /> Describe with voice
                      </button>
                    )}
                    {caption && !transcribing && !recording && (
                      <button
                        type="button"
                        onClick={() => { setCaption(''); setVoiceError(''); }}
                        className="text-xs text-muted-foreground flex items-center gap-1"
                      >
                        <RefreshCw size={11} /> Clear
                      </button>
                    )}
                  </div>
                )}

                {voiceError && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle size={11} /> {voiceError}
                  </p>
                )}
              </div>
            )}

            {/* Workout fields */}
            {postType === 'workout' && (
              <>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Workout type</label>
                  <input
                    className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground"
                    placeholder="e.g. Running, HIIT, Weights"
                    value={workoutType}
                    onChange={e => setWorkoutType(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Duration (mins)</label>
                  <input
                    type="number"
                    className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground"
                    placeholder="45"
                    value={workoutDuration}
                    onChange={e => setWorkoutDuration(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Notes (optional)</label>
                  <textarea
                    className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm text-foreground resize-none"
                    rows={2}
                    placeholder="How'd it go?"
                    value={caption}
                    onChange={e => setCaption(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Photo upload */}
            <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block flex items-center gap-1">
                  Photos
                  <span className="text-destructive">*</span>
                  <span className="font-normal normal-case text-muted-foreground ml-1">(at least one required)</span>
                </label>

                {/* Existing photos grid */}
                {photoUrls.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {photoUrls.map((url, idx) => (
                      <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-secondary">
                        <img src={url} alt={`photo ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(idx)}
                          className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                    {/* Add more photos button */}
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.92 }}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground"
                    >
                      {uploading ? (
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <Plus size={18} />
                          <span className="text-[10px]">Add</span>
                        </>
                      )}
                    </motion.button>
                  </div>
                )}

                {/* Initial upload button (no photos yet) */}
                {photoUrls.length === 0 && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full h-32 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted-foreground transition-colors hover:border-primary/50"
                  >
                    {uploading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs">Uploading…</span>
                      </>
                    ) : (
                      <>
                        <Camera size={24} />
                        <span className="text-xs font-medium">Tap to add photos</span>
                        <span className="text-[10px] text-muted-foreground">Select multiple at once</span>
                      </>
                    )}
                  </motion.button>
                )}

                {photoError && (
                  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                    <AlertCircle size={11} /> {photoError}
                  </p>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
              </div>

            <motion.button
              type="submit"
              whileTap={{ scale: 0.96 }}
              disabled={!canSubmit}
              onClick={() => {
                if (photoUrls.length === 0) {
                  setPhotoError('Please add at least one photo before posting.');
                }
              }}
              className="w-full py-3 rounded-lg font-bold text-sm disabled:opacity-50 transition-opacity"
              style={{ background: 'hsl(var(--theme-accent))', color: 'hsl(var(--theme-accent-fg))' }}
            >
              {saving ? 'Posting…' : 'Post it 🚀'}
            </motion.button>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}