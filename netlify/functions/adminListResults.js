// netlify/functions/adminListResults.js
import { adminClient, isAllowedAdmin, json, badRequest, forbidden, serverError } from './_supabase.js';

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json({}, 200);

  try {
    const adminEmail = event.headers['x-admin-email'] || event.headers['X-Admin-Email'];
    if (!adminEmail) return badRequest('Missing x-admin-email header');
    if (!isAllowedAdmin(adminEmail)) return forbidden('Not an allowed admin');

    const limit  = Math.min(parseInt(event.queryStringParameters?.limit ?? '20', 10) || 20, 100);
    const offset = parseInt(event.queryStringParameters?.offset ?? '0', 10) || 0;

    const supa = adminClient();

    // total count
    const { count: total, error: countErr } = await supa
      .from('results')
      .select('*', { count: 'exact', head: true });
    if (countErr) throw countErr;

    // grab result rows
    const { data: rows, error } = await supa
      .from('results')
      .select('id,user_id,answers,top3,created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // fetch the related user profiles in one go
    const userIds = Array.from(new Set((rows || []).map(r => r.user_id).filter(Boolean)));
    let profilesById = {};
    if (userIds.length) {
      const { data: profs, error: pErr } = await supa
        .from('profiles')
        .select('id,email,name,nickname')
        .in('id', userIds);
      if (pErr) throw pErr;
      profilesById = (profs || []).reduce((acc, p) => { acc[p.id] = p; return acc; }, {});
    }

    const items = (rows || []).map(r => ({
      id: r.id,
      created_at: r.created_at,
      answers: r.answers,
      top3: r.top3,
      user: profilesById[r.user_id] || { id: r.user_id },
    }));

    return json({ items, total, limit, offset });
  } catch (e) {
    console.error('adminListResults error:', e);
    return serverError(e.message);
  }
};
