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

export function applyTheme(theme, darkMode) {
  const root = document.documentElement;
  
  // Remove all theme classes
  root.classList.remove('theme-coral', 'theme-blue', 'theme-pink', 'theme-orange');
  root.classList.remove('dark', 'light');
  
  // Apply dark/light
  if (darkMode) {
    root.classList.add('dark');
  } else {
    root.classList.add('light');
  }
  
  // Apply color theme (lime is default, no extra class needed)
  if (theme && theme !== 'lime') {
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