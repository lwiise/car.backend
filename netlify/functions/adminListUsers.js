// netlify/functions/adminListUsers.js
import { serverClient, okJSON, errorJSON, corsHeaders, requireAdminEmail, readPager } from './_supabase.js';

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });

  try {
    const { limit, offset, mock } = readPager(req.url);

    // mock mode for quick UI tests
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

    const email = requireAdminEmail(req); // validates header
    const supabase = serverClient();

    // adjust column list if your schema differs
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,name,nickname,dob,gender,country,state,created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return okJSON({ items: data || [], meta: { admin: email } });
  } catch (err) {
    // map our validation errors to friendly codes
    if (err?.message === 'NO_ADMIN_EMAIL_HEADER')
      return errorJSON(401, 'Missing x-admin-email header');
    if (err?.message === 'NOT_ALLOWED')
      return errorJSON(403, 'This email is not allowed to access the admin API');

    return errorJSON(500, 'adminListUsers failed', String(err?.message || err));
  }
}

export const config = { path: '/.netlify/functions/adminListUsers' };
