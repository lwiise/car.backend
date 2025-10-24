// netlify/functions/resultsSavePublic.js
import { createClient } from '@supabase/supabase-js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { guest_id, answers, top3 } = JSON.parse(event.body || '{}') || {};
    if (!guest_id || !Array.isArray(top3)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'guest_id and top3 are required' }) };
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE; // service key (secure)
    if (!url || !key) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Missing Supabase env vars' }) };
    }
    const sb = createClient(url, key);

    // Insert into your results table. Adjust table/columns if different.
    const payload = {
      user_id: null,
      guest_id,
      is_guest: true,
      answers: answers || {},
      top3: top3,
      created_at: new Date().toISOString()
    };

    const { error } = await sb.from('results').insert(payload);
    if (error) throw error;

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || String(e) }) };
  }
};
