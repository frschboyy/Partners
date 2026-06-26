import React, { useState, useEffect, useRef } from 'react';
import Picker from '@emoji-mart/react';
import emojiData from '@emoji-mart/data';
import { motion } from 'framer-motion';
import { supabase } from '@/api/supabaseClient';

const GIPHY_KEY = import.meta.env.VITE_GIPHY_API_KEY;
const GIPHY_BASE = 'https://api.giphy.com/v1';

async function fetchGiphy(query, isSticker) {
  if (!GIPHY_KEY) return [];
  const type = isSticker ? 'stickers' : 'gifs';
  const endpoint = query ? 'search' : 'trending';
  const params = new URLSearchParams({ api_key: GIPHY_KEY, limit: 24, rating: 'g', ...(query ? { q: query } : {}) });
  try {
    const res = await fetch(`${GIPHY_BASE}/${type}/${endpoint}?${params}`);
    const json = await res.json();
    return json.data || [];
  } catch {
    return [];
  }
}

function MediaGrid({ results, loading, onSelect }) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-1.5 p-3">
        {[...Array(9)].map((_, i) => (
          <div key={i} className="aspect-video bg-secondary rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }
  if (!results.length) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No results
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-1.5 p-3">
      {results.map(r => {
        const preview = r.images?.fixed_height_small?.url || r.images?.preview_gif?.url;
        const full = r.images?.original?.url || preview;
        if (!preview) return null;
        return (
          <button
            key={r.id}
            onClick={() => onSelect(preview, full)}
            className="aspect-video bg-secondary rounded-lg overflow-hidden hover:opacity-75 transition-opacity focus:outline-none"
          >
            <img src={preview} alt="" className="w-full h-full object-cover" loading="lazy" />
          </button>
        );
      })}
    </div>
  );
}

function MyStickersTab({ currentUser, onSelect }) {
  const [stickers, setStickers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const fileInputRef = useRef(null);

  const folder = `stickers/${currentUser?.id}`;

  async function loadStickers() {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.storage.from('uploads').list(folder, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
      if (error) throw error;
      const files = (data || []).filter(f => f.name !== '.emptyFolderPlaceholder');
      const urls = files.map(f => {
        const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(`${folder}/${f.name}`);
        return { name: f.name, url: publicUrl };
      });
      setStickers(urls);
    } catch {
      setStickers([]);
    }
    setLoading(false);
  }

  useEffect(() => { loadStickers(); }, [currentUser?.id]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !currentUser?.id) return;
    const allowed = ['image/png', 'image/gif', 'image/webp', 'image/jpeg'];
    if (!allowed.includes(file.type)) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${folder}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('uploads').upload(path, file, { upsert: false });
      if (!error) await loadStickers();
    } catch {}
    setUploading(false);
    e.target.value = '';
  }

  async function handleDelete(name) {
    try {
      await supabase.storage.from('uploads').remove([`${folder}/${name}`]);
      setStickers(prev => prev.filter(s => s.name !== name));
    } catch {}
  }

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-1.5 p-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="aspect-square bg-secondary rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-2.5 pb-2 flex-shrink-0 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Your personal stickers</span>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium transition-opacity disabled:opacity-50"
          style={{ background: 'hsl(var(--theme-accent))', color: 'white' }}
        >
          {uploading ? '…' : '+ Upload'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/gif,image/webp,image/jpeg"
          className="hidden"
          onChange={handleUpload}
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {stickers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
            <span className="text-3xl">🖼️</span>
            <p className="text-sm text-muted-foreground">No stickers yet. Upload your first one!</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 p-3">
            {stickers.map(s => (
              <div
                key={s.name}
                className="relative aspect-square bg-secondary rounded-lg overflow-hidden group"
              >
                <button
                  onClick={() => onSelect(s.url, s.url)}
                  className="w-full h-full focus:outline-none"
                >
                  <img src={s.url} alt="" className="w-full h-full object-contain p-1" loading="lazy" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(s.name); }}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center leading-none opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-black/80"
                  title="Remove sticker"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPicker({ onEmojiSelect, onMediaSelect, currentUser }) {
  const [tab, setTab] = useState('emoji');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  const pickerTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';

  useEffect(() => {
    if (tab === 'gif' || tab === 'sticker') loadMedia('');
  }, [tab]);

  async function loadMedia(q) {
    setLoading(true);
    const data = await fetchGiphy(q, tab === 'sticker');
    setResults(data);
    setLoading(false);
  }

  function handleSearch(e) {
    const q = e.target.value;
    setSearch(q);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => loadMedia(q), 400);
  }

  function switchTab(id) {
    setTab(id);
    setSearch('');
    setResults([]);
  }

  const tabs = [
    { id: 'emoji', label: '😊 Emoji' },
    { id: 'gif', label: 'GIF' },
    { id: 'sticker', label: '✨ Sticker' },
    { id: 'my-stickers', label: '⭐ Mine' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-full left-0 right-0 z-50 border border-border rounded-t-2xl shadow-2xl overflow-hidden"
      style={{ background: 'hsl(var(--background))' }}
    >
      {/* Tab bar */}
      <div className="flex border-b border-border">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            className="flex-1 py-2.5 text-xs font-semibold transition-colors relative"
            style={tab === t.id
              ? { color: 'hsl(var(--theme-accent))' }
              : { color: 'hsl(var(--muted-foreground))' }
            }
          >
            {t.label}
            {tab === t.id && (
              <motion.div
                layoutId="picker-underline"
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ background: 'hsl(var(--theme-accent))' }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Emoji tab */}
      {tab === 'emoji' && (
        <div style={{ height: 340 }}>
          <Picker
            data={emojiData}
            onEmojiSelect={e => onEmojiSelect(e.native)}
            theme={pickerTheme}
            set="native"
            previewPosition="none"
            skinTonePosition="none"
            navPosition="bottom"
            perLine={9}
            emojiSize={22}
            emojiButtonSize={32}
            maxFrequentRows={1}
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        </div>
      )}

      {/* GIF / Sticker tab */}
      {(tab === 'gif' || tab === 'sticker') && (
        <div style={{ height: 340 }}>
          {!GIPHY_KEY ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
              <p className="text-sm text-muted-foreground">
                Add your Giphy API key to enable {tab === 'gif' ? 'GIFs' : 'Stickers'}.
              </p>
              <code className="text-xs px-2 py-1 bg-secondary rounded font-mono">
                VITE_GIPHY_API_KEY=your_key
              </code>
              <p className="text-xs text-muted-foreground">
                Free developer key at developers.giphy.com
              </p>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="px-3 pt-2.5 pb-2 flex-shrink-0">
                <input
                  className="w-full bg-input border border-border rounded-full px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder={`Search ${tab === 'gif' ? 'GIFs' : 'stickers'}…`}
                  value={search}
                  onChange={handleSearch}
                  autoFocus
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                <MediaGrid
                  results={results}
                  loading={loading}
                  onSelect={(preview, full) => onMediaSelect(preview, full, tab)}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* My Stickers tab */}
      {tab === 'my-stickers' && (
        <div style={{ height: 340 }}>
          <MyStickersTab
            currentUser={currentUser}
            onSelect={(preview, full) => onMediaSelect(preview, full, 'sticker')}
          />
        </div>
      )}
    </motion.div>
  );
}
