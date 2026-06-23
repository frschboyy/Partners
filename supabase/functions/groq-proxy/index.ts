import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, ...params } = await req.json();

    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    if (!GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY secret not set — add it in the Supabase dashboard');
    }

    let result: unknown;

    if (action === 'transcribe') {
      const { audio_url } = params as { audio_url: string };
      const audioResp = await fetch(audio_url);
      const blob = await audioResp.blob();
      const form = new FormData();
      form.append('file', blob, 'recording.webm');
      form.append('model', 'whisper-large-v3');
      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || `Groq transcription error ${res.status}`);
      result = { text: json.text || '' };

    } else if (action === 'llm') {
      const { prompt } = params as { prompt: string };
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || `Groq LLM error ${res.status}`);
      result = { content: json.choices?.[0]?.message?.content || '' };

    } else if (action === 'embeddings') {
      const { inputs } = params as { inputs: string[] };
      const res = await fetch('https://api.groq.com/openai/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({ model: 'nomic-embed-text', input: inputs }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || `Groq embeddings error ${res.status}`);
      result = {
        embeddings: (json.data as { index: number; embedding: number[] }[])
          .sort((a, b) => a.index - b.index)
          .map(d => d.embedding),
      };

    } else {
      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
