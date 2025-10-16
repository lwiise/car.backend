
// Simple email allow-list guard
const ALLOW = (process.env.ADMIN_EMAILS || "")
  .toLowerCase()
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

function requireAdmin(event) {
  const email = (event.headers["x-admin-email"] || "").toLowerCase();
  if (!email || (ALLOW.length && !ALLOW.includes(email))) {
    return { statusCode: 403, body: "Forbidden" };
  }
  return null; // ok
}

// Inside your handler:
exports.handler = async (event) => {
  const guard = requireAdmin(event);
  if (guard) return guard;

  // ... existing code to list users/results ...
};

// netlify/functions/adminListResults.js
const { createClient } = require('@supabase/supabase-js');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: 'ok' };
  }

  try {
    const auth = event.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) return { statusCode: 401, headers: cors, body: 'Missing token' };

    const SUPABASE_URL  = process.env.SUPABASE_URL;
    const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY;
    const ADMIN_EMAILS  = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    // Verify caller and admin allowlist
    const { data: userData, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !userData?.user?.email) {
      return { statusCode: 401, headers: cors, body: 'Invalid token' };
    }
    const email = userData.user.email.toLowerCase();
    if (!ADMIN_EMAILS.includes(email)) {
      return { statusCode: 403, headers: cors, body: 'Forbidden' };
    }

    // Pagination + optional user filter
    const limit  = Math.min(parseInt(event.queryStringParameters?.limit || '50', 10), 200);
    const offset = Math.max(parseInt(event.queryStringParameters?.offset || '0', 10), 0);
    const userId = event.queryStringParameters?.user_id || null;
    const from   = offset;
    const to     = offset + limit - 1;

    let q = sb
      .from('results')
      .select('id,user_id,created_at,answers,top3')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (userId) q = q.eq('user_id', userId);

    const { data, error } = await q;
    if (error) {
      return { statusCode: 500, headers: cors, body: error.message };
    }

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: data || [] }),
    };
  } catch (e) {
    return { statusCode: 500, headers: cors, body: e.message || 'Server error' };
  }
};
