// netlify/functions/adminUsers.js
import { supaAdmin, ok, bad, handleOptions, requireAdmin } from './_supa.js';

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const gate = requireAdmin(event);
  if (!gate.ok) return bad(403, gate.reason);

  const url = new URL(event.rawUrl || `https://x${event.path}${event.queryStringParameters ? '?' : ''}`);
  const qs = Object.fromEntries(url.searchParams.entries());
  const limit  = Math.min(parseInt(qs.limit || '20', 10), 100);
  const offset = Math.max(parseInt(qs.offset || '0', 10), 0);
  const search = (qs.search || '').trim();

  try {
    const supa = supaAdmin();

    let q = supa
      .from('profiles')
      .select('user_id, email, name, nickname, dob, gender, country, state, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      // very simple ilike filter (add more ORs if you want)
      q = q.or([
        `email.ilike.%${search}%`,
        `name.ilike.%${search}%`,
        `nickname.ilike.%${search}%`,
        `country.ilike.%${search}%`,
        `state.ilike.%${search}%`,
      ].join(','));
    }

    const { data: profiles, error, count } = await q;
    if (error) throw error;

    // fetch each user's latest result (optional, keeps UI nice)
    const userIds = (profiles || []).map(p => p.user_id).filter(Boolean);
    let latestByUser = {};
    if (userIds.length) {
      const { data: latest } = await supa
        .from('results')
        .select('id, user_id, created_at, top3')
        .in('user_id', userIds)
        .order('created_at', { ascending: false });
      // keep only first per user (already sorted desc)
      for (const r of latest || []) if (!latestByUser[r.user_id]) latestByUser[r.user_id] = r;
    }

    const items = (profiles || []).map(p => ({
      user_id: p.user_id,
      email: p.email,
      name: p.name,
      nickname: p.nickname,
      dob: p.dob,
      gender: p.gender,
      country: p.country,
      state: p.state,
      created_at: p.created_at,
      latest_result: latestByUser[p.user_id] ? {
        id: latestByUser[p.user_id].id,
        created_at: latestByUser[p.user_id].created_at,
        top3: Array.isArray(latestByUser[p.user_id].top3) ? latestByUser[p.user_id].top3 : [],
      } : null,
    }));

    return ok({ items, total: count ?? items.length, limit, offset, search });
  } catch (err) {
    console.error('[adminUsers]', err);
    return bad(500, err.message || 'Server error');
  }
}
