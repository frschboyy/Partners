export const EMOJI_REACTIONS = ['❤️', '🔥', '💪', '😂', '👀', '🫡'];

export const POST_TYPE_LABELS = {
  meal: '🍽️ Meal',
  workout: '💪 Workout',
  slip: '😔 Slip',
  milestone: '🏆 Milestone',
};

export const POST_TYPE_EMOJI = {
  meal: '🍽️',
  workout: '💪',
  slip: '😔',
  milestone: '🏆',
};

// Summertides event: July 1–6 (month index 6 = July)
export const SUMMERTIDES = { month: 6, startDay: 1, endDay: 6 };

// No-slip streak celebrations, escalating in rarity/weight
export const STREAK_MILESTONES = [
  { days: 7, emoji: '🔥', title: 'One Week Strong', body: "You've gone a full week without a slip. Keep the streak alive." },
  { days: 30, emoji: '🏅', title: 'One Month Clean', body: "30 days without a slip — that's real discipline." },
  { days: 180, emoji: '💎', title: 'Half a Year', body: '6 months without a slip. This is who you are now.' },
  { days: 365, emoji: '👑', title: 'One Full Year', body: '365 days without a slip. Legendary.' },
];
