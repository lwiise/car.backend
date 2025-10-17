// netlify/functions/adminListUsers.js
const { createClient } = require('@supabase/supabase-js');

const ALLOW_ORIGIN = '*';
const cors = {
  'Access-Control-Allow-Origin': ALLOW_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }

  const headers = { 'Content-Type': 'application/json', ...cors };

  try {
    const url = new URL(event.rawUrl || `https://${event.headers.host}${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`);
    const limit  = Math.min(parseInt(url.searchParams.get('limit')  || '12', 10), 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);
    const q      = (url.searchParams.get('q') || '').trim();

    // Quick mock for testing
    if ((url.searchParams.get('mock') || '') === '1') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          items: [{
            id: '00000000-0000-4000-8000-000000000001',
            email: 'demo@example.com',
            name: 'Demo User',
            nickname: 'Demo',
            latest: {
              id: 123,
              created_at: new Date().toISOString(),
              top3: [{ brand:'Tesla', model:'Model 3', reason:'electric and modern' }]
            }
          }]
        })
      };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error:'CONFIG_MISSING' }) };
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Pull a page of profiles (optionally filter by q in name/email)
    let pf = sb
      .from('profiles')
      .select('id, email, name, nickname, dob, gender, country, state, updated_at')
      .order('updated_at', { ascending: false });

    if (q) {
      // simple ILIKE on name/email
      pf = pf.or(`name.ilike.%${q}%,email.ilike.%${q}%`);
    }

    if (offset) pf = pf.range(offset, offset + limit - 1);
    else pf = pf.limit(limit);

    const { data: profiles, error: profErr } = await pf;
    if (profErr) {
      return { statusCode: 500, headers, body: JSON.stringify({ error:'PROFILES_QUERY_FAILED', message: profErr.message }) };
    }

    if (!profiles || profiles.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ items: [] }) };
    }

    // 2) Batch fetch all results for these users, then reduce to latest per user
    const userIds = profiles.map(p => p.id).filter(Boolean);
    const { data: resData, error: resErr } = await sb
      .from('results')
      .select('id, user_id, created_at, top3')
      .in('user_id', userIds)
      .order('created_at', { ascending: false });

    if (resErr) {
      // don’t kill the page—just return users without latest data
      console.error('RESULTS_QUERY_FAILED', resErr.message);
    }

    // Reduce to latest result per user_id
    const latestByUser = {};
    (resData || []).forEach(r => {
      if (!latestByUser[r.user_id]) latestByUser[r.user_id] = r; // first encountered due to desc order is latest
    });

    // 3) Stitch latest into each profile
    const items = profiles.map(p => ({
      ...p,
      latest: latestByUser[p.id] ? {
        id: latestByUser[p.id].id,
        created_at: latestByUser[p.id].created_at,
        top3: latestByUser[p.id].top3
      } : null
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ items }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error:'ADMIN_USERS_CRASH', message: String(err?.message || err) }) };
  }
};
