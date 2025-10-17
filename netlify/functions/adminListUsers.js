// netlify/functions/adminListUsers.js
const { createClient } = require('@supabase/supabase-js');

const ALLOW_ORIGIN  = 'https://scopeonride.webflow.io'; // or '*' if you prefer
const ALLOW_HEADERS = 'content-type, x-admin-email';
const cors = {
  'Access-Control-Allow-Origin': ALLOW_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': ALLOW_HEADERS,
};

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  const headers = { 'Content-Type': 'application/json', ...cors };

  try {
    const url = new URL(event.rawUrl || `https://${event.headers.host}${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`);
    const limit  = Math.min(parseInt(url.searchParams.get('limit')  || '12', 10), 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);
    const q      = (url.searchParams.get('q') || '').trim();

    // Optional read (we just ignore it, but we must allow it via CORS)
    const adminEmail = event.headers['x-admin-email'] || event.headers['X-Admin-Email'];

    // Mock tester
    if ((url.searchParams.get('mock') || '') === '1') {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ items: [
          { id:'000…001', email:'demo@example.com', name:'Demo', nickname:'Demo', latest:null }
        ] })
      };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) profiles page (optionally filter)
    let pf = sb.from('profiles')
      .select('id, email, name, nickname, dob, gender, country, state, updated_at')
      .order('updated_at', { ascending: false });

    if (q) pf = pf.or(`name.ilike.%${q}%,email.ilike.%${q}%`);
    if (offset) pf = pf.range(offset, offset + limit - 1);
    else pf = pf.limit(limit);

    const { data: profiles, error: profErr } = await pf;
    if (profErr) throw profErr;

    if (!profiles?.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ items: [] }) };
    }

    // 2) batch latest results for those users
    const userIds = profiles.map(p => p.id).filter(Boolean);
    const { data: resData, error: resErr } = await sb
      .from('results')
      .select('id, user_id, created_at, top3')
      .in('user_id', userIds)
      .order('created_at', { ascending: false });

    if (resErr) console.error('results query:', resErr.message);

    const latestByUser = {};
    (resData || []).forEach(r => { if (!latestByUser[r.user_id]) latestByUser[r.user_id] = r; });

    const items = profiles.map(p => ({
      ...p,
      latest: latestByUser[p.id]
        ? { id: latestByUser[p.id].id, created_at: latestByUser[p.id].created_at, top3: latestByUser[p.id].top3 }
        : null
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ items }) };
  } catch (err) {
    console.error('adminListUsers crash:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'ADMIN_USERS', message: String(err?.message || err) }) };
  }
};
