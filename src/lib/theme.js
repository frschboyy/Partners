// Theme management utility
export const FONT_SIZES = [
  { id: 'normal',  label: 'Normal',      px: 16, description: 'Default — works for most' },
  { id: 'large',   label: 'Large',       px: 18, description: 'Easier on the eyes' },
  { id: 'xlarge',  label: 'Extra Large', px: 20, description: 'High visibility' },
  { id: 'xxlarge', label: 'Maximum',     px: 22, description: 'Low vision / accessibility' },
];

export function applyFontSize(sizeId) {
  const size = FONT_SIZES.find(s => s.id === sizeId) || FONT_SIZES[0];
  document.documentElement.style.fontSize = `${size.px}px`;
}

export function getSavedFontSize() {
  return localStorage.getItem('accountable_font_size') || 'normal';
}

export function saveFontSize(sizeId) {
  localStorage.setItem('accountable_font_size', sizeId);
}

export const THEMES = [
  { id: 'lime', label: '🍋 Lime', description: 'Electric green — the OG' },
  { id: 'coral', label: '🪸 Coral', description: 'Hot red-orange energy' },
  { id: 'blue', label: '⚡ Electric Blue', description: 'Crisp and focused' },
  { id: 'pink', label: '🌸 Hot Pink', description: 'Bold and playful' },
  { id: 'orange', label: '🔥 Orange', description: 'Warm and driven' },
];

export function applyCustomHue(hue, darkMode) {
  const root = document.documentElement;
  const h = Math.round(hue);
  // Yellow-green range looks bright at high lightness — needs dark fg text
  const needsDarkFg = h >= 45 && h <= 165;
  const fg = needsDarkFg ? '0 0% 5%' : '0 0% 98%';

  if (darkMode) {
    root.style.setProperty('--theme-accent', `${h} 90% 57%`);
    root.style.setProperty('--theme-accent-fg', fg);
    root.style.setProperty('--theme-accent-muted', `${h} 50% 18%`);
    root.style.setProperty('--primary', `${h} 90% 57%`);
    root.style.setProperty('--primary-foreground', fg);
    root.style.setProperty('--accent', `${h} 90% 57%`);
    root.style.setProperty('--ring', `${h} 90% 57%`);
  } else {
    root.style.setProperty('--theme-accent', `${h} 80% 42%`);
    root.style.setProperty('--theme-accent-fg', '0 0% 98%');
    root.style.setProperty('--theme-accent-muted', `${h} 70% 90%`);
    root.style.setProperty('--primary', `${h} 80% 42%`);
    root.style.setProperty('--primary-foreground', '0 0% 98%');
    root.style.setProperty('--accent', `${h} 80% 42%`);
    root.style.setProperty('--ring', `${h} 80% 42%`);
  }
}

export function saveCustomHue(hue) {
  localStorage.setItem('accountable_custom_hue', String(hue));
}

export function getSavedCustomHue() {
  const saved = localStorage.getItem('accountable_custom_hue');
  return saved !== null ? Number(saved) : 200;
}

export function applyTheme(theme, darkMode) {
  const root = document.documentElement;

  // Clear any inline custom vars before switching to a preset
  root.style.removeProperty('--theme-accent');
  root.style.removeProperty('--theme-accent-fg');
  root.style.removeProperty('--theme-accent-muted');
  root.style.removeProperty('--primary');
  root.style.removeProperty('--primary-foreground');
  root.style.removeProperty('--accent');
  root.style.removeProperty('--ring');

  // Remove all theme classes
  root.classList.remove('theme-coral', 'theme-blue', 'theme-pink', 'theme-orange');
  root.classList.remove('dark', 'light');

  // Apply dark/light
  if (darkMode) {
    root.classList.add('dark');
  } else {
    root.classList.add('light');
  }

  if (theme === 'custom') {
    applyCustomHue(getSavedCustomHue(), darkMode);
  } else if (theme && theme !== 'lime') {
    root.classList.add(`theme-${theme}`);
  }
}

export function getSavedTheme() {
  return {
    theme: localStorage.getItem('accountable_theme') || 'lime',
    darkMode: localStorage.getItem('accountable_dark') !== 'false',
  };
}

export function saveTheme(theme, darkMode) {
  localStorage.setItem('accountable_theme', theme);
  localStorage.setItem('accountable_dark', darkMode ? 'true' : 'false');
}