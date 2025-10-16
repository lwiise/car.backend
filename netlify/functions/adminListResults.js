// netlify/functions/adminListResults.js
import { createClient } from '@supabase/supabase-js';

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
    const adminEmail = req.headers.get('x-admin-email') || '';
    if (!adminEmail) {
      return Response.json({ error: 'missing admin email' }, { status: 401, headers: cors });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE
    );

    const url = new URL(req.url);
    const limit = Number(url.searchParams.get('limit') || 50);
    const offset = Number(url.searchParams.get('offset') || 0);

    // Grab recent results
    const { data: results, error: rErr } = await supabase
      .from('results')
      .select('id, user_id, created_at, answers, top3')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (rErr) throw rErr;

    // Attach user emails to each result for easier reading
    const userIds = [...new Set(results.map(r => r.user_id).filter(Boolean))];
    let emailById = {};
    if (userIds.length) {
      const { data: users, error: uErr } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', userIds);
      if (uErr) throw uErr;
      for (const u of users) emailById[u.id] = u.email;
    }

    const items = results.map(r => ({ ...r, email: emailById[r.user_id] || null }));
    return Response.json({ items, limit, offset }, { headers: cors });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500, headers: cors });
  }
}
