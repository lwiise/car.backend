// netlify/functions/adminUserDetails.js
import { createClient } from '@supabase/supabase-js';

// --- CORS helpers (same pattern as the other admin endpoints) ---
const ALLOW_ORIGIN = '*';
const ALLOW_HEADERS = 'content-type,x-admin-email';
const ALLOW_METHODS = 'GET,OPTIONS';

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Allow-Methods': ALLOW_METHODS,
    ...extra,
  };
}

export async function handler(event) {
  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }

  try {
    // --- Admin “auth” via header (email allow-list) ---
    const adminEmail = (event.headers['x-admin-email'] || event.headers['X-Admin-Email'] || '').toLowerCase().trim();

    // Put your admin emails here or via the ADMIN_EMAILS env var (comma-separated)
    const configured =
      (process.env.ADMIN_EMAILS || 'anaskaroti@gmail.com,anas@scopeonride.com,anas@comaro.com')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

    if (!adminEmail || !configured.includes(adminEmail)) {
      return {
        statusCode: 401,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'unauthorized admin' }),
      };
    }

    // --- Mock switch for quick testing ---
    const params = new URLSearchParams(event.queryStringParameters || {});
    if (params.get('mock') === '1') {
      return {
        statusCode: 200,
        headers: corsHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({
          profile: {
            id: '00000000-0000-0000-0000-000000000000',
            email: 'demo@example.com',
            name: 'Demo User',
            nickname: 'Demo',
            dob: '1990-01-01',
            gender: 'Prefer not to say',
            country: 'US',
            state: 'CA',
          },
          latest: {
            id: 123,
            created_at: new Date().toISOString(),
            top3: [
              { brand: 'Tesla', model: 'Model 3', reason: 'Great range', type: 'EV' },
              { brand: 'BMW', model: 'i4', reason: 'Sporty drive', type: 'EV' },
              { brand: 'Audi', model: 'Q4 e-tron', reason: 'Comfort', type: 'EV' },
            ],
            answers: { budget: '50000', usage: { city: 'on', highway: 'on' } },
          },
        }),
      };
    }

    // --- Inputs ---
    const userId = params.get('id');
    if (!userId) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'missing id' }),
      };
    }

    // --- Supabase (service role) ---
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE;
    if (!supabaseUrl || !serviceKey) {
      return {
        statusCode: 500,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'server not configured (supabase env)' }),
      };
    }
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // --- Fetch profile ---
    const { data: profile, error: pErr } = await sb
      .from('profiles')
      .select('id,email,name,nickname,dob,gender,country,state')
      .eq('id', userId)
      .single();

    if (pErr) {
      return {
        statusCode: 404,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'profile not found', detail: pErr.message }),
      };
    }

    // --- Latest result for that user ---
    const { data: latest, error: rErr } = await sb
      .from('results')
      .select('id, created_at, top3, answers')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // If no results yet, return profile with latest = null
    const payload = { profile, latest: latest || null };

    return {
      statusCode: 200,
      headers: corsHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify(payload),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'internal', detail: String(e && e.message ? e.message : e) }),
    };
  }
}
