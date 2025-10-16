// netlify/functions/adminListUsers.js
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
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    if (countErr) throw countErr;

    // rows
    const { data: items, error } = await supa
      .from('profiles')
      .select('id,email,name,nickname,dob,gender,country,state,created_at,updated_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return json({ items, total, limit, offset });
  } catch (e) {
    console.error('adminListUsers error:', e);
    return serverError(e.message);
  }
};
