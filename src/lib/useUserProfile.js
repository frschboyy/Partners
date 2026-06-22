import { useState, useEffect } from 'react';
import { api } from '@/api/supabaseClient';

export function useUserProfile(user) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadProfile();
  }, [user]);

  async function loadProfile() {
    setLoading(true);
    try {
      const profiles = await api.entities.UserProfile.filter({ user_id: user.id });
      if (profiles.length > 0) {
        setProfile(profiles[0]);
      } else {
        setProfile(null);
      }
    } catch (e) {
      console.error('Failed to load profile', e);
    }
    setLoading(false);
  }

  async function updateProfile(data) {
    if (!profile) return;
    const updated = await api.entities.UserProfile.update(profile.id, data);
    setProfile(updated);
    return updated;
  }

  async function createProfile(data) {
    const created = await api.entities.UserProfile.create({ user_id: user.id, ...data });
    setProfile(created);
    return created;
  }

  return { profile, loading, updateProfile, createProfile, reload: loadProfile };
}