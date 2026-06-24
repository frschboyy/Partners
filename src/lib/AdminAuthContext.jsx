import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [state, setState] = useState({ user: null, isAdmin: false, loading: true });

  useEffect(() => {
    let active = true;

    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        if (active) setState({ user: null, isAdmin: false, loading: false });
        return;
      }
      const { data } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (active) setState({ user: session.user, isAdmin: !!data, loading: false });
    }

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      if (active) checkSession();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function loginAsAdmin(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', data.user.id)
      .maybeSingle();

    if (!adminRow) {
      await supabase.auth.signOut();
      throw new Error('This account does not have admin access.');
    }

    setState({ user: data.user, isAdmin: true, loading: false });
    return data.user;
  }

  async function logoutAdmin() {
    await supabase.auth.signOut();
    setState({ user: null, isAdmin: false, loading: false });
  }

  return (
    <AdminAuthContext.Provider value={{ ...state, loginAsAdmin, logoutAdmin }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used inside AdminAuthProvider');
  return ctx;
}
