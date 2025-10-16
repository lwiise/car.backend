// netlify/functions/adminListUsers.js — Netlify Functions v1 (CommonJS)
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
      return okJSON({
        items: Array.from({ length: Math.min(5, limit) }).map((_, i) => ({
          id: `mock-user-${offset + i + 1}`,
          email: `person${offset + i + 1}@example.com`,
          name: `Person ${offset + i + 1}`,
          nickname: `P${offset + i + 1}`,
          dob: '1990-01-01',
          gender: 'Male',
          country: 'USA',
          state: 'CA',
          created_at: new Date(Date.now() - i * 86400000).toISOString(),
        })),
      });
    }

    const adminEmail = requireAdminEmail(event);
    const supabase = serverClient();

    // Adjust columns/names if your schema differs
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,name,nickname,dob,gender,country,state,created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return okJSON({ items: data || [], meta: { admin: adminEmail } });
  } catch (err) {
    if (err?.message === 'NO_ADMIN_EMAIL_HEADER')
      return errorJSON(401, 'Missing x-admin-email header');
    if (err?.message === 'NOT_ALLOWED')
      return errorJSON(403, 'This email is not allowed to access the admin API');

    return errorJSON(500, 'adminListUsers failed', String(err?.message || err));
  }
};
