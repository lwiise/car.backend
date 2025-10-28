// resultsSave.js
import cors from './cors.js';
import { supabaseAdmin, getUserFromRequest } from './_supabase.js';

export const handler = cors(async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { token, user } = await getUserFromRequest(event);
  if (!token || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'NO_SESSION' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }

  const answers = body.answers ?? null;
  const top3    = body.top3 ?? null;

  if (!answers || !top3) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing answers/top3' }) };
  }

  // Insert row bound to this user
  const payload = {
    user_id: user.id,                 // <— critical!
    email:   user.email || null,
    answers,
    top3
  };

  const { error } = await supabaseAdmin
    .from('results')
    .insert(payload);

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
});
