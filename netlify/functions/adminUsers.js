// netlify/functions/adminUsers.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  try {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE; // service key (NOT anon)
    if (!url || !serviceKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE' }) };
    }

    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

    const qs = new URLSearchParams(event.queryStringParameters || {});
    const limit  = Math.min(parseInt(qs.get('limit')  || '20', 10), 100);
    const offset = Math.max(parseInt(qs.get('offset') || '0', 10), 0);
    const search = (qs.get('search') || '').trim().toLowerCase(); // email search

    let profQ = supabase
      .from('profiles')
      .select(`
        id,
        email,
        name,
        nickname,
        dob,
        gender,
        country,
        state
      `, { count: 'exact' })
      .order('email', { ascending: true })
      .range(offset, offset + limit - 1);

    if (search) profQ = profQ.ilike('email', `%${search}%`);

    const { data: profiles, error: pErr, count } = await profQ;
    if (pErr) throw pErr;

    // Fetch latest result per user (optional but useful in list view)
    const ids = (profiles || []).map(p => p.id);
    let latestByUser = {};
    if (ids.length) {
      const { data: results, error: rErr } = await supabase
        .from('results')
        .select('id, user_id, created_at')
        .in('user_id', ids)
        .order('created_at', { ascending: false });
      if (rErr) throw rErr;
      for (const r of results || []) {
        if (!latestByUser[r.user_id]) latestByUser[r.user_id] = r;
      }
    }

    const items = (profiles || []).map(p => ({
      id: p.id,
      email: p.email,
      name: p.name || '',
      nickname: p.nickname || '',
      dob: p.dob || '',
      gender: p.gender || '',
      country: p.country || '',
      state: p.state || '',
      latest_result: latestByUser[p.id] || null
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ items, total: count ?? items.length })
    };
  } catch (err) {
    console.error('adminUsers error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
