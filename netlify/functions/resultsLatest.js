// resultsLatest.js
import cors from './cors.js';
import { supabaseAdmin, getUserFromRequest } from './_supabase.js';

export const handler = cors(async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { token, user } = await getUserFromRequest(event);
  if (!token || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'NO_SESSION' }) };
  }

  const { data, error } = await supabaseAdmin
    .from('results')
    .select('id, created_at, top3, answers')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  return { statusCode: 200, body: JSON.stringify(data || null) };
});
