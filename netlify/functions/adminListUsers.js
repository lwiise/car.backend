// netlify/functions/adminListUsers.js
import { createClient } from '@supabase/supabase-js';

// --- CORS helper (Webflow -> Netlify) ---
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Email',
};

export default async (req, context) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    // Minimal “login” — page sends X-Admin-Email (already implemented in the UI)
    const adminEmail = req.headers.get('x-admin-email') || '';
    if (!adminEmail) {
      return Response.json({ error: 'missing admin email' }, { status: 401, headers: cors });
    }

    // Use SERVICE ROLE to bypass RLS for admin views
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE
    );

    // Pagination (defaults)
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get('limit') || 25);
    const offset = Number(url.searchParams.get('offset') || 0);

    // Pull basic profile info
    // Adjust table/column names if yours differ
    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('id, email, name, nickname, gender, dob, country, state, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (pErr) throw pErr;

    // Fetch latest result per user in one go, then map
    const userIds = profiles.map(p => p.id);
    let latestByUser = {};
    if (userIds.length) {
      const { data: results, error: rErr } = await supabase
        .from('results')
        .select('id, user_id, created_at, answers, top3')
        .in('user_id', userIds)
        .order('created_at', { ascending: false });

      if (rErr) throw rErr;

      for (const r of results) {
        if (!latestByUser[r.user_id]) latestByUser[r.user_id] = r; // first seen is latest due to order
      }
    }

    const items = profiles.map(p => ({
      profile: p,
      latest_result: latestByUser[p.id] || null,
    }));

    return Response.json({ items, limit, offset }, { headers: cors });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500, headers: cors });
  }
}
