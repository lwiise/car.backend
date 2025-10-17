// netlify/functions/adminListUsers.js
const { createClient } = require('@supabase/supabase-js');

const ALLOW_ORIGIN = '*';
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
  };
}

exports.handler = async (event) => {
  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }

  const headers = { 'Content-Type': 'application/json', ...corsHeaders() };

  try {
    const url = new URL(event.rawUrl || `https://${event.headers.host}${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);

    // Mock mode
    if ((url.searchParams.get('mock') || '') === '1') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          items: [
            {
              id: '00000000-0000-4000-8000-000000000001',
              email: 'vip1@example.com',
              name: 'VIP One',
              nickname: 'VIP',
              dob: '1990-01-01',
              gender: 'Male',
              country: 'USA',
              state: 'CA',
              updated_at: new Date().toISOString(),
            },
            {
              id: '00000000-0000-4000-8000-000000000002',
              email: 'vip2@example.com',
              name: 'VIP Two',
              nickname: 'V2',
              dob: '1993-04-12',
              gender: 'Female',
              country: 'USA',
              state: 'NY',
              updated_at: null,
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

    // Pull users from profiles (your schema)
    let q = sb
      .from('profiles')
      .select('id, email, name, nickname, dob, gender, country, state, updated_at', { count: 'exact' })
      .order('updated_at', { ascending: false, nullsFirst: false }) // DESC NULLS LAST
      .order('email', { ascending: true });

    if (offset) q = q.range(offset, offset + limit - 1);
    else q = q.limit(limit);

    const { data, error } = await q;

    if (error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'ADMIN_USERS_FAILED', message: error.message }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ items: data || [] }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'ADMIN_USERS_CRASH', message: String(err?.message || err) }) };
  }
};
