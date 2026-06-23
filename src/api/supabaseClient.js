import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function isTransientError(err) {
  const status = err?.status ?? err?.statusCode ?? 0;
  if (status === 408 || status === 429 || status >= 500) return true;
  const msg = (err?.message ?? '').toLowerCase();
  return msg.includes('network') || msg.includes('timeout') || msg.includes('fetch') || msg.includes('aborted');
}

// Safe for idempotent (read-only) operations only — do NOT wrap writes.
export async function withRetry(fn, { maxAttempts = 3, baseDelayMs = 600 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1 && isTransientError(err)) {
        await new Promise(r => setTimeout(r, baseDelayMs * 2 ** attempt));
      } else {
        break;
      }
    }
  }
  throw lastError;
}

// Drop-in helpers to match the base44 entity API shape used throughout the app
export function entityClient(tableName) {
  return {
    async list(orderBy = 'created_at', limit = 50) {
      const col = orderBy.startsWith('-') ? orderBy.slice(1) : orderBy;
      const asc = !orderBy.startsWith('-');
      return withRetry(async () => {
        const { data, error } = await supabase.from(tableName).select('*').order(col, { ascending: asc }).limit(limit);
        if (error) throw error;
        return data || [];
      });
    },
    async filter(filters, orderBy = 'created_at', limit = 50) {
      const col = orderBy.startsWith('-') ? orderBy.slice(1) : orderBy;
      const asc = !orderBy.startsWith('-');
      return withRetry(async () => {
        let q = supabase.from(tableName).select('*');
        Object.entries(filters).forEach(([k, v]) => { q = q.eq(k, v); });
        const { data, error } = await q.order(col, { ascending: asc }).limit(limit);
        if (error) throw error;
        return data || [];
      });
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
      // Random suffix prevents multiple active subscribers on the same table from
      // sharing a channel and receiving each other's callbacks.
      const channelName = `${tableName}-${Math.random().toString(36).slice(2)}`;
      const channel = supabase.channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table: tableName },
          payload => callback({
          type: payload.eventType.toLowerCase(),
          id: payload.new?.id || payload.old?.id,
          data: payload.eventType === 'DELETE' ? payload.old : payload.new,
        })
        ).subscribe();
      return () => supabase.removeChannel(channel);
    },
    subscribeFiltered(column, value, callback) {
      const channelName = `${tableName}-${column}-${value}-${Math.random().toString(36).slice(2)}`;
      const channel = supabase.channel(channelName)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: tableName,
          filter: `${column}=eq.${value}`,
        }, payload => callback({
          type: payload.eventType.toLowerCase(),
          id: payload.new?.id || payload.old?.id,
          data: payload.eventType === 'DELETE' ? payload.old : payload.new,
        }))
        .subscribe();
      return () => supabase.removeChannel(channel);
    },
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
        const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — Supabase free-tier storage limit
        if (file.size > MAX_BYTES) {
          const mb = (file.size / 1024 / 1024).toFixed(1);
          const err = new Error('FILE_TOO_LARGE');
          err.userMessage = `File is too large (${mb} MB). Please use an image under 10 MB.`;
          throw err;
        }

        if (!navigator.onLine) {
          const err = new Error('OFFLINE');
          err.userMessage = "You're offline. Reconnect and try uploading again.";
          throw err;
        }

        const name = file.name || `upload-${Date.now()}`;
        let data, uploadError;
        try {
          ({ data, error: uploadError } = await supabase.storage
            .from('uploads')
            .upload(`public/${Date.now()}-${name}`, file, { upsert: true }));
        } catch (networkErr) {
          const err = networkErr instanceof Error ? networkErr : new Error(String(networkErr));
          err.userMessage = 'Network error during upload — check your connection and try again.';
          throw err;
        }

        if (uploadError) {
          const status = uploadError.statusCode ?? uploadError.status ?? 0;
          uploadError.userMessage =
            status === 413 ? 'File is too large for the server. Try a smaller image.' :
            status >= 500  ? 'Server error — please try again in a moment.' :
            status === 401 || status === 403 ? 'Upload permission denied. Please sign in again.' :
            `Upload failed: ${uploadError.message}`;
          throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(data.path);
        return { file_url: publicUrl };
      },
      async TranscribeAudio({ audio_url }) {
        const { data, error } = await supabase.functions.invoke('groq-proxy', {
          body: { action: 'transcribe', audio_url },
        });
        if (error) throw error;
        return data.text || '';
      },
      async GetEmbeddings(inputs) {
        const { data, error } = await supabase.functions.invoke('groq-proxy', {
          body: { action: 'embeddings', inputs },
        });
        if (error) throw error;
        return data.embeddings;
      },
      async InvokeLLM({ prompt }) {
        const { data, error } = await supabase.functions.invoke('groq-proxy', {
          body: { action: 'llm', prompt },
        });
        if (error) throw error;
        return data.content || '';
      },
      async SendEmail({ to, subject, body }) {
        const { error } = await supabase.functions.invoke('send-email', {
          body: { to, subject, body },
        });
        if (error) throw error;
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