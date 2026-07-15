import React, { useState } from 'react';
import { ImageOff, RefreshCw } from 'lucide-react';

// Post photos occasionally fail to decode/paint on memory-constrained mobile
// devices (seen on Android after a big camera photo is compressed and
// immediately re-rendered) even though the underlying file is fine — other
// viewers loading the same URL cold render it without issue. A bare <img>
// with no onError handling just stays blank forever in that case, so this
// gives the user a way to force a fresh decode instead of a silent gap.
export default function PostImage({ src, alt = '', className, style, ...rest }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  if (failed) {
    return (
      <button
        type="button"
        onClick={() => { setFailed(false); setAttempt(a => a + 1); }}
        className={`flex flex-col items-center justify-center gap-1 bg-secondary text-muted-foreground ${className || ''}`}
        style={style}
      >
        <ImageOff size={18} />
        <span className="text-[10px] flex items-center gap-1"><RefreshCw size={10} /> Tap to reload</span>
      </button>
    );
  }

  // A cache-busting param on retry forces a real re-fetch/re-decode rather
  // than replaying whatever the browser cached from the failed attempt.
  const retrySrc = attempt > 0 ? `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}` : src;

  return (
    <img
      src={retrySrc}
      alt={alt}
      className={className}
      style={style}
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}
