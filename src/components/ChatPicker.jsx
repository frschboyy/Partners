import React, { useState, useEffect, useRef } from 'react';
import Picker from '@emoji-mart/react';
import emojiData from '@emoji-mart/data';
import { motion } from 'framer-motion';

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

export default function ChatPicker({ onEmojiSelect, onMediaSelect }) {
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
    </motion.div>
  );
}
