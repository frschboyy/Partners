export const GOAL_OPTIONS = [
  { id: 'alcohol', label: 'No Alcohol', emoji: '🍺', category: 'alcohol' },
  { id: 'smoking', label: 'No Smoking', emoji: '🚬', category: 'smoking' },
  { id: 'junk_food', label: 'No Junk Food', emoji: '🍔', category: 'junk_food' },
  { id: 'sugar', label: 'No Sugar', emoji: '🍭', category: 'sugar' },
  { id: 'caffeine', label: 'No Caffeine', emoji: '☕', category: 'caffeine' },
  { id: 'social_media', label: 'Less Social Media', emoji: '📱', category: 'social_media' },
  { id: 'weight', label: 'Lose Weight', emoji: '⚖️', category: 'weight' },
  { id: 'running', label: 'Daily Running', emoji: '🏃', category: 'running' },
  { id: 'gym', label: 'Gym Consistency', emoji: '💪', category: 'gym' },
  { id: 'custom', label: 'Custom Rule', emoji: '✍️', category: 'custom' },
];

export function getGoalEmoji(category) {
  return GOAL_OPTIONS.find(g => g.category === category)?.emoji || '✍️';
}

export function getGoalLabel(category) {
  return GOAL_OPTIONS.find(g => g.category === category)?.label || 'Custom Rule';
}