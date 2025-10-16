// netlify/functions/adminListResults.js
import { serverClient, okJSON, errorJSON, corsHeaders, requireAdminEmail, readPager } from './_supabase.js';

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });

  try {
    const { limit, offset, mock } = readPager(req.url);

    // mock mode for quick UI tests
    if (mock) {
      const now = Date.now();
      return okJSON({
        items: Array.from({ length: Math.min(6, limit) }).map((_, i) => ({
          id: `mock-res-${offset + i + 1}`,
          created_at: new Date(now - i * 3600_000).toISOString(),
          user_id: `mock-user-${offset + i + 1}`,
          user_email: `person${offset + i + 1}@example.com`,
          answers: { q1: 'Personal', q2: 'Monthly', _meta: { ua: 'mock' } },
          top3: [
            { brand: 'Tesla', model: 'Model 3', image: '', reason: 'electric and modern' },
            { brand: 'BMW', model: 'X5', image: '', reason: 'luxury family SUV' },
            { brand: 'Toyota', model: 'Corolla', image: '', reason: 'reliable and affordable' },
          ],
        })),
      });
    }

    const email = requireAdminEmail(req);
    const supabase = serverClient();

    // 1) fetch results
    const { data: results, error } = await supabase
      .from('results')
      .select('id,created_at,user_id,answers,top3')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    if (!results || results.length === 0) {
      return okJSON({ items: [], meta: { admin: email } });
    }

    // 2) fetch emails for those users (simple 2-step join)
    const userIds = [...new Set(results.map(r => r.user_id).filter(Boolean))];
    let emailById = {};
    if (userIds.length) {
      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('id,email')
        .in('id', userIds);
      if (pErr) throw pErr;
      emailById = Object.fromEntries((profs || []).map(p => [p.id, p.email]));
    }

    const items = results.map(r => ({
      ...r,
      user_email: emailById[r.user_id] || null,
    }));

    return okJSON({ items, meta: { admin: email } });
  } catch (err) {
    if (err?.message === 'NO_ADMIN_EMAIL_HEADER')
      return errorJSON(401, 'Missing x-admin-email header');
    if (err?.message === 'NOT_ALLOWED')
      return errorJSON(403, 'This email is not allowed to access the admin API');

    return errorJSON(500, 'adminListResults failed', String(err?.message || err));
  }
}

export const config = { path: '/.netlify/functions/adminListResults' };
