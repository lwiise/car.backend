// netlify/functions/adminListResults.js
const { createClient } = require('@supabase/supabase-js');

const ALLOW_ORIGIN  = 'https://scopeonride.webflow.io'; // or '*'
const ALLOW_HEADERS = 'content-type, x-admin-email';
const cors = {
  'Access-Control-Allow-Origin': ALLOW_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': ALLOW_HEADERS,
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  const headers = { 'Content-Type': 'application/json', ...cors };

  try {
    const url = new URL(event.rawUrl || `https://${event.headers.host}${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`);
    const limit  = Math.min(parseInt(url.searchParams.get('limit')  || '20', 10), 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);
    const q      = (url.searchParams.get('q') || '').trim();

    // optionally read but not enforce
    const adminEmail = event.headers['x-admin-email'] || event.headers['X-Admin-Email'];

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // join results ← profiles (for name/email)
    let rq = sb
      .from('results')
      .select('id, created_at, top3, answers, profiles:profiles!results_user_id_fkey ( id, email, name, nickname )')
      .order('created_at', { ascending: false });

    if (q) {
      rq = rq.or(`profiles.email.ilike.%${q}%,profiles.name.ilike.%${q}%`);
    }

    if (offset) rq = rq.range(offset, offset + limit - 1);
    else rq = rq.limit(limit);

    const { data, error } = await rq;
    if (error) throw error;

    return { statusCode: 200, headers, body: JSON.stringify({ items: data || [] }) };
  } catch (err) {
    console.error('adminListResults crash:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'ADMIN_RESULTS', message: String(err?.message || err) }) };
  }
};
