import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Drop-in helpers to match the base44 entity API shape used throughout the app
export function entityClient(tableName) {
  return {
    async list(orderBy = 'created_at', limit = 50) {
      const col = orderBy.startsWith('-') ? orderBy.slice(1) : orderBy;
      const asc = !orderBy.startsWith('-');
      const { data } = await supabase.from(tableName).select('*').order(col, { ascending: asc }).limit(limit);
      return data || [];
    },
    async filter(filters, orderBy = 'created_at', limit = 50) {
      const col = orderBy.startsWith('-') ? orderBy.slice(1) : orderBy;
      const asc = !orderBy.startsWith('-');
      let q = supabase.from(tableName).select('*');
      Object.entries(filters).forEach(([k, v]) => { q = q.eq(k, v); });
      const { data, error } = await q.order(col, { ascending: asc }).limit(limit);
      if (error) throw error;
      return data || [];
    },
    async create(payload) {
      const { data, error } = await supabase.from(tableName).insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    async update(id, payload) {
      const { data, error } = await supabase.from(tableName).update(payload).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    async delete(id) {
      const { error } = await supabase.from(tableName).delete().eq('id', id);
      if (error) throw error;
    },
    subscribe(callback) {
      const channelName = `${tableName}-${Math.random().toString(36).slice(2)}`;
      const channel = supabase.channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table: tableName },
          payload => callback({ type: payload.eventType, id: payload.new?.id || payload.old?.id, data: payload.new })
        ).subscribe();
      return () => supabase.removeChannel(channel);
    }
  };
}

export const api = {
  auth: {
    async me() {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
    async loginViaEmailPassword(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async loginWithProvider(provider) {
      await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
    },
    async register({ email, password }) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
    },
    async deleteAccount() {
      const { error } = await supabase.rpc('delete_user');
      if (error) throw error;
      await supabase.auth.signOut();
      window.location.href = '/login';
    },
    async setPassword(newPassword) {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        data: { has_set_password: true },
      });
      if (error) throw error;
    },
    async logout() {
      localStorage.removeItem('accountable_last_tab');
      await supabase.auth.signOut();
      window.location.href = '/login';
    },
    async isAuthenticated() {
      const { data: { user } } = await supabase.auth.getUser();
      return !!user;
    },
    async updateMe(data) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('user_profiles').update(data).eq('user_id', user.id);
    },
    async resetPasswordRequest(email) {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    },
    async resetPassword({ resetToken: _, newPassword }) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
  },
  entities: {
    UserProfile: entityClient('user_profiles'),
    Post: entityClient('posts'),
    Rule: entityClient('rules'),
    Slip: entityClient('slips'),
    Partnership: entityClient('partnerships'),
    PartnerRequest: entityClient('partner_requests'),
    ChatMessage: entityClient('chat_messages'),
    Notification: entityClient('notifications'),
    SummertidesDeclaration: entityClient('summertides_declarations'),
    User: entityClient('user_profiles'), // alias
  },
  integrations: {
    Core: {
      async UploadFile({ file }) {
        const name = file.name || `upload-${Date.now()}`;
        const { data, error } = await supabase.storage.from('uploads').upload(`public/${Date.now()}-${name}`, file, { upsert: true });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(data.path);
        return { file_url: publicUrl };
      },
      async TranscribeAudio({ audio_url }) {
        const resp = await fetch(audio_url);
        const blob = await resp.blob();
        const form = new FormData();
        form.append('file', blob, 'recording.webm');
        form.append('model', 'whisper-large-v3');
        const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${import.meta.env.VITE_GROQ_API_KEY}` },
          body: form,
        });
        const json = await res.json();
        return json.text || '';
      },
      async GetEmbeddings(inputs) {
        const res = await fetch('https://api.groq.com/openai/v1/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_GROQ_API_KEY}` },
          body: JSON.stringify({ model: 'nomic-embed-text', input: inputs }),
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error.message);
        return json.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
      },
      async InvokeLLM({ prompt }) {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_GROQ_API_KEY}` },
          body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }] }),
        });
        const json = await res.json();
        return json.choices?.[0]?.message?.content || '';
      },
      async SendEmail({ to, subject, body }) {
        // Use Resend: https://resend.com
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_RESEND_API_KEY}` },
          body: JSON.stringify({ from: 'onboarding@resend.dev', to, subject, html: body }),
        });
      },
    },
  },
  analytics: {
    track({ eventName, properties }) {
      // Optional: wire up to Posthog or just log
      console.log('[analytics]', eventName, properties);
    },
  },
  users: {
    async inviteUser(email, role) {
      // Implement via Supabase admin API or remove
      console.warn('inviteUser not implemented — use Supabase dashboard or admin API');
    },
  },
};

// Note: previous code used a `base44` SDK. The new API surface is exported as `api`.