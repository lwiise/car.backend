// netlify/functions/adminListResults.js — Netlify Functions v1 (CommonJS)
const {
  serverClient, okJSON, errorJSON, corsHeaders, requireAdminEmail, readPager,
} = require('./_supabase.js');

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  try {
    const { limit, offset, mock } = readPager(`https://x${event.rawUrl.slice(event.rawUrl.indexOf('://'))}`);

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

    const adminEmail = requireAdminEmail(event);
    const supabase = serverClient();

    // 1) list results
    const { data: results, error } = await supabase
      .from('results')
      .select('id,created_at,user_id,answers,top3')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    if (!results || results.length === 0) {
      return okJSON({ items: [], meta: { admin: adminEmail } });
    }

    // 2) join emails
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

    const items = results.map(r => ({ ...r, user_email: emailById[r.user_id] || null }));
    return okJSON({ items, meta: { admin: adminEmail } });
  } catch (err) {
    if (err?.message === 'NO_ADMIN_EMAIL_HEADER')
      return errorJSON(401, 'Missing x-admin-email header');
    if (err?.message === 'NOT_ALLOWED')
      return errorJSON(403, 'This email is not allowed to access the admin API');

    return errorJSON(500, 'adminListResults failed', String(err?.message || err));
  }
};
