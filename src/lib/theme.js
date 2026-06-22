// Theme management utility
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