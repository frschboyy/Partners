export const PREDEFINED_RULES = [
  // Alcohol
  { id: 'no_alcohol',       title: 'No Alcohol',           emoji: '🍺', category: 'alcohol' },
  { id: 'no_beer',          title: 'No Beer',              emoji: '🍺', category: 'alcohol' },
  { id: 'no_wine',          title: 'No Wine',              emoji: '🍷', category: 'alcohol' },
  { id: 'no_spirits',       title: 'No Spirits',           emoji: '🥃', category: 'alcohol' },
  { id: 'no_cocktails',     title: 'No Cocktails',         emoji: '🍹', category: 'alcohol' },
  { id: 'no_shots',         title: 'No Shots',             emoji: '🥃', category: 'alcohol' },

  // Smoking & Substances
  { id: 'no_smoking',       title: 'No Smoking',           emoji: '🚬', category: 'smoking' },
  { id: 'no_vaping',        title: 'No Vaping',            emoji: '💨', category: 'smoking' },
  { id: 'no_hookah',        title: 'No Hookah',            emoji: '🌬️', category: 'smoking' },
  { id: 'no_cannabis',      title: 'No Cannabis',          emoji: '🌿', category: 'smoking' },

  // Junk & Fast Food
  { id: 'no_junk_food',     title: 'No Junk Food',         emoji: '🍔', category: 'junk_food' },
  { id: 'no_fast_food',     title: 'No Fast Food',         emoji: '🌮', category: 'junk_food' },
  { id: 'no_fried_food',    title: 'No Fried Food',        emoji: '🍟', category: 'junk_food' },
  { id: 'no_chips',         title: 'No Chips',             emoji: '🥔', category: 'junk_food' },
  { id: 'no_processed_food',title: 'No Processed Food',    emoji: '🏭', category: 'junk_food' },
  { id: 'no_eating_out',    title: 'No Eating Out',        emoji: '🍽️', category: 'junk_food' },
  { id: 'no_takeaway',      title: 'No Takeaway',          emoji: '🥡', category: 'junk_food' },
  { id: 'no_pizza',         title: 'No Pizza',             emoji: '🍕', category: 'junk_food' },

  // Sugar & Sweets
  { id: 'no_sugar',         title: 'No Sugar',             emoji: '🍭', category: 'sugar' },
  { id: 'no_sweets',        title: 'No Sweets',            emoji: '🍬', category: 'sugar' },
  { id: 'no_chocolate',     title: 'No Chocolate',         emoji: '🍫', category: 'sugar' },
  { id: 'no_dessert',       title: 'No Dessert',           emoji: '🍰', category: 'sugar' },
  { id: 'no_ice_cream',     title: 'No Ice Cream',         emoji: '🍦', category: 'sugar' },
  { id: 'no_soda',          title: 'No Soda',              emoji: '🥤', category: 'sugar' },
  { id: 'no_juice',         title: 'No Juice',             emoji: '🧃', category: 'sugar' },
  { id: 'no_energy_drinks', title: 'No Energy Drinks',     emoji: '⚡', category: 'sugar' },

  // Caffeine
  { id: 'no_caffeine',      title: 'No Caffeine',          emoji: '☕', category: 'caffeine' },
  { id: 'no_coffee',        title: 'No Coffee',            emoji: '☕', category: 'caffeine' },
  { id: 'no_tea',           title: 'No Tea',               emoji: '🍵', category: 'caffeine' },

  // Social Media & Screen Time
  { id: 'no_social_media',  title: 'No Social Media',      emoji: '📵', category: 'social_media' },
  { id: 'less_social_media',title: 'Less Social Media',    emoji: '📱', category: 'social_media' },
  { id: 'no_tiktok',        title: 'No TikTok',            emoji: '📱', category: 'social_media' },
  { id: 'no_instagram',     title: 'No Instagram',         emoji: '📷', category: 'social_media' },
  { id: 'no_twitter',       title: 'No Twitter / X',       emoji: '🐦', category: 'social_media' },
  { id: 'no_youtube',       title: 'No YouTube',           emoji: '📺', category: 'social_media' },
  { id: 'no_netflix',       title: 'No Netflix',           emoji: '🎬', category: 'social_media' },
  { id: 'no_gaming',        title: 'No Gaming',            emoji: '🎮', category: 'social_media' },
  { id: 'no_phone_before_bed', title: 'No Phone Before Bed', emoji: '📵', category: 'social_media' },

  // Running & Cardio
  { id: 'daily_running',    title: 'Daily Running',        emoji: '🏃', category: 'running' },
  { id: 'morning_run',      title: 'Morning Run',          emoji: '🌅', category: 'running' },
  { id: 'daily_steps',      title: '10,000 Steps Daily',   emoji: '👟', category: 'running' },
  { id: 'cycling',          title: 'Cycling',              emoji: '🚴', category: 'running' },
  { id: 'swimming',         title: 'Swimming',             emoji: '🏊', category: 'running' },

  // Gym & Strength
  { id: 'gym_consistency',  title: 'Gym Consistency',      emoji: '💪', category: 'gym' },
  { id: 'daily_workout',    title: 'Daily Workout',        emoji: '🏋️', category: 'gym' },
  { id: 'morning_workout',  title: 'Morning Workout',      emoji: '🌅', category: 'gym' },
  { id: 'daily_stretching', title: 'Daily Stretching',     emoji: '🤸', category: 'gym' },
  { id: 'daily_yoga',       title: 'Daily Yoga',           emoji: '🧘', category: 'gym' },
  { id: 'no_skipping_gym',  title: 'No Skipping the Gym',  emoji: '🏋️', category: 'gym' },

  // Weight & Diet
  { id: 'lose_weight',      title: 'Lose Weight',          emoji: '⚖️', category: 'weight' },
  { id: 'eat_clean',        title: 'Eat Clean',            emoji: '🥗', category: 'weight' },
  { id: 'calorie_counting', title: 'Calorie Counting',     emoji: '📊', category: 'weight' },
  { id: 'intermittent_fasting', title: 'Intermittent Fasting', emoji: '⏰', category: 'weight' },
  { id: 'no_late_night_eating', title: 'No Late Night Eating', emoji: '🌙', category: 'weight' },
  { id: 'no_snacking',      title: 'No Snacking',          emoji: '🥨', category: 'weight' },
  { id: 'drink_more_water', title: 'Drink More Water',     emoji: '💧', category: 'weight' },
  { id: 'no_dairy',         title: 'No Dairy',             emoji: '🥛', category: 'weight' },
  { id: 'no_gluten',        title: 'No Gluten',            emoji: '🌾', category: 'weight' },
  { id: 'no_meat',          title: 'No Meat',              emoji: '🥩', category: 'weight' },

  // Sleep
  { id: 'sleep_before_midnight', title: 'Sleep Before Midnight', emoji: '🌙', category: 'custom' },
  { id: 'eight_hours_sleep',title: '8 Hours of Sleep',     emoji: '😴', category: 'custom' },
  { id: 'consistent_sleep', title: 'Consistent Sleep Schedule', emoji: '⏰', category: 'custom' },
  { id: 'no_phone_in_bed',  title: 'No Phone in Bed',      emoji: '📵', category: 'custom' },
  { id: 'no_napping',       title: 'No Napping',           emoji: '💤', category: 'custom' },

  // Mindfulness & Mental Health
  { id: 'daily_meditation', title: 'Daily Meditation',     emoji: '🧘', category: 'custom' },
  { id: 'daily_reading',    title: 'Daily Reading',        emoji: '📚', category: 'custom' },
  { id: 'daily_journaling', title: 'Daily Journaling',     emoji: '📔', category: 'custom' },
  { id: 'daily_gratitude',  title: 'Daily Gratitude',      emoji: '🙏', category: 'custom' },
  { id: 'cold_shower',      title: 'Cold Shower',          emoji: '🚿', category: 'custom' },
  { id: 'no_complaining',   title: 'No Complaining',       emoji: '🤐', category: 'custom' },
  { id: 'no_gossiping',     title: 'No Gossiping',         emoji: '🤫', category: 'custom' },

  // Finance
  { id: 'no_impulse_buying',title: 'No Impulse Buying',    emoji: '💳', category: 'custom' },
  { id: 'daily_savings',    title: 'Daily Savings',        emoji: '💰', category: 'custom' },
  { id: 'budget_tracking',  title: 'Budget Tracking',      emoji: '📊', category: 'custom' },
  { id: 'no_online_shopping', title: 'No Online Shopping', emoji: '🛒', category: 'custom' },

  // Personal Development
  { id: 'daily_learning',   title: 'Daily Learning',       emoji: '📚', category: 'custom' },
  { id: 'language_practice',title: 'Language Practice',    emoji: '🗣️', category: 'custom' },
  { id: 'no_procrastinating',title: 'No Procrastinating',  emoji: '⏳', category: 'custom' },
  { id: 'networking',       title: 'Networking',           emoji: '🤝', category: 'custom' },
  { id: 'wake_up_early',    title: 'Wake Up Early',        emoji: '🌄', category: 'custom' },
  { id: 'daily_planning',   title: 'Daily Planning',       emoji: '📋', category: 'custom' },
];
