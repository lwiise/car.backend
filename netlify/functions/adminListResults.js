// netlify/functions/adminListResults.js
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
              id: 123,
              created_at: new Date().toISOString(),
              user_id: '00000000-0000-4000-8000-000000000001',
              answers: { Q1: 'Personal', budget: '200-400' },
              top3: [
                { brand: 'Tesla', model: 'Model 3', reason: 'electric and modern', image: '' },
                { brand: 'BMW', model: 'X5', reason: 'luxury family SUV', image: '' },
                { brand: 'Toyota', model: 'Corolla', reason: 'reliable', image: '' },
              ],
              profiles: { email: 'vip1@example.com', name: 'VIP One', nickname: 'VIP' },
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

    // results with joined profiles (email/name/nickname)
    // Supabase will use FK results.user_id -> profiles.id
    let q = sb
      .from('results')
      .select(
        'id, created_at, user_id, answers, top3, profiles ( id, email, name, nickname )',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    if (offset) q = q.range(offset, offset + limit - 1);
    else q = q.limit(limit);

    const { data, error } = await q;
    if (error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'ADMIN_RESULTS_FAILED', message: error.message }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ items: data || [] }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'ADMIN_RESULTS_CRASH', message: String(err?.message || err) }) };
  }
};
