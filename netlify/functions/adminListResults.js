// netlify/functions/adminListResults.js
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
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);

    // --- Mock quick test ---
    if ((url.searchParams.get('mock') || '') === '1') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          items: [
            {
              id: 1,
              created_at: new Date().toISOString(),
              user_id: '00000000-0000-4000-8000-000000000001',
              answers: { Q1: 'Personal' },
              top3: [{ brand: 'Tesla', model: 'Model 3', reason: 'electric' }],
              profile: { id: '00000000-0000-4000-8000-000000000001', email: 'vip@example.com', name: 'VIP' },
            },
          ],
        }),
      };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'CONFIG_MISSING', message: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
      };
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Fetch results page (no join)
    let rq = sb
      .from('results')
      .select('id, created_at, user_id, answers, top3', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (offset) rq = rq.range(offset, offset + limit - 1);
    else rq = rq.limit(limit);

    const { data: results, error: resErr } = await rq;
    if (resErr) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'RESULTS_QUERY_FAILED', message: resErr.message }) };
    }

    if (!results || results.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ items: [] }) };
    }

    // 2) Batch fetch matching profiles by id IN (user_id)
    const userIds = [...new Set(results.map(r => r.user_id).filter(Boolean))];
    let profilesById = {};
    if (userIds.length) {
      const { data: profiles, error: profErr } = await sb
        .from('profiles')
        .select('id, email, name, nickname, dob, gender, country, state, updated_at')
        .in('id', userIds);

      if (profErr) {
        // Don’t hard-fail; return results without profile to keep UI working
        profilesById = {};
      } else {
        profilesById = (profiles || []).reduce((acc, p) => {
          acc[p.id] = p; return acc;
        }, {});
      }
    }

    // 3) Stitch profile into each result (as `profile`)
    const items = results.map(r => ({
      ...r,
      profile: profilesById[r.user_id] || null
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ items }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'ADMIN_RESULTS_CRASH', message: String(err?.message || err) }) };
  }
};
