import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CORS = {
  'Access-Control-Allow-Origin': 'https://scopeonride.webflow.io',
  'Vary': 'Origin',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  // 👇 allow our custom header from the admin page
  'Access-Control-Allow-Headers': 'authorization, content-type, x-admin-email',
  'Access-Control-Max-Age': '86400'
};

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase env vars');
    }
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const url = new URL(event.rawUrl || `http://x${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`);
    const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '20', 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
    const from = offset;
    const to = offset + limit - 1;

    const { data, error, count } = await admin
      .from('results')
      .select(`
        id,
        user_id,
        created_at,
        answers,
        top3,
        profiles!inner(id,email,name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const items = (data || []).map(r => ({
      id: r.id,
      user_id: r.user_id,
      created_at: r.created_at,
      answers: r.answers,
      top3: r.top3,
      email: r.profiles?.email || null,
      name: r.profiles?.name || null
    }));

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, count: count ?? items.length })
    };
  } catch (err) {
    console.error('adminListResults error:', err);
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: String(err.message || err) })
    };
  }
}
