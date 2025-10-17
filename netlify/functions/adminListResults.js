// netlify/functions/adminListResults.js
const { createClient } = require('@supabase/supabase-js');

const ALLOW_ORIGIN  = 'https://scopeonride.webflow.io'; // or '*' while testing
const ALLOW_HEADERS = 'content-type, x-admin-email';
const CORS = {
  'Access-Control-Allow-Origin': ALLOW_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': ALLOW_HEADERS,
};

exports.handler = async (event) => {
  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  const headers = { 'Content-Type': 'application/json', ...CORS };

  try {
    const url = new URL(
      event.rawUrl ||
      `https://${event.headers.host}${event.path}${event.rawQuery ? `?${event.rawQuery}` : ''}`
    );
    const limit  = Math.min(parseInt(url.searchParams.get('limit')  || '20', 10), 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0',  10), 0);
    const q      = (url.searchParams.get('q') || '').trim();

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // If search query present, find matching profile IDs first
    let filterIds = null;
    if (q) {
      const { data: matchProfiles, error: mpErr } = await sb
        .from('profiles')
        .select('id')
        .or(`email.ilike.%${q}%,name.ilike.%${q}%`);
      if (mpErr) throw mpErr;
      filterIds = (matchProfiles || []).map(p => p.id);
      if (!filterIds.length) {
        return { statusCode: 200, headers, body: JSON.stringify({ items: [] }) };
      }
    }

    // Fetch results page (no join)
    let rq = sb
      .from('results')
      .select('id, user_id, created_at, top3, answers')
      .order('created_at', { ascending: false });

    if (filterIds) rq = rq.in('user_id', filterIds);
    if (offset) rq = rq.range(offset, offset + limit - 1);
    else rq = rq.limit(limit);

    const { data: results, error: resErr } = await rq;
    if (resErr) throw resErr;

    if (!results?.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ items: [] }) };
    }

    // Fetch profiles for those user_ids and merge
    const userIds = [...new Set(results.map(r => r.user_id).filter(Boolean))];
    const { data: profs, error: profErr } = await sb
      .from('profiles')
      .select('id, email, name, nickname')
      .in('id', userIds);
    if (profErr) throw profErr;

    const byId = Object.fromEntries((profs || []).map(p => [p.id, p]));

    const items = results.map(r => ({
      id: r.id,
      created_at: r.created_at,
      top3: r.top3,
      answers: r.answers,
      profile: byId[r.user_id] || null
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ items }) };
  } catch (err) {
    console.error('adminListResults error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'ADMIN_RESULTS', message: String(err?.message || err) })
    };
  }
};
