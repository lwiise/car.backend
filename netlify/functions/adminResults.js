// netlify/functions/adminResults.js
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

    // Build base query with a join to profiles so we can show email + profile fields
    let query = supabase
      .from('results')
      .select(`
        id,
        created_at,
        answers,
        top3,
        user_id,
        profiles:profiles!results_user_id_fkey (
          id,
          email,
          name,
          nickname,
          dob,
          gender,
          country,
          state
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Optional email search
    if (search) {
      // Supabase doesn't let us filter joined columns directly; do two-step approach:
      const { data: profs, error: profErr } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', `%${search}%`);
      if (profErr) throw profErr;
      const ids = (profs || []).map(p => p.id);
      if (ids.length === 0) {
        return { statusCode: 200, body: JSON.stringify({ items: [], total: 0 }) };
      }
      query = query.in('user_id', ids);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    // Normalize payload for the frontend
    const items = (data || []).map(row => ({
      id: row.id,
      created_at: row.created_at,
      answers: row.answers || {},
      top3: row.top3 || [],
      user: {
        id: row.user_id,
        email: row.profiles?.email || '',
        name: row.profiles?.name || '',
        nickname: row.profiles?.nickname || '',
        dob: row.profiles?.dob || '',
        gender: row.profiles?.gender || '',
        country: row.profiles?.country || '',
        state: row.profiles?.state || ''
      }
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ items, total: count ?? items.length })
    };
  } catch (err) {
    console.error('adminResults error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
