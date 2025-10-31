// netlify/functions/profileUpsertCORS.js
import cors from './cors.js';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE; // service key (NOT anon)

async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // auth
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Missing bearer token' })
    };
  }

  // user profile body
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON body' })
    };
  }

  // connect to supabase with service role (so we can upsert profile row)
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false }
  });

  // we expect: { user_id, email, profile: {...}, picks: [...], answers: {...} }
  const { user_id, email, profile, picks, answers } = payload;

  if (!user_id || !email) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing user_id or email' })
    };
  }

  // 1) upsert profile table
  const { error: profileErr } = await sb
    .from('profiles')
    .upsert({
      user_id,
      email,
      full_name: profile.full_name || null,
      first_name: profile.first_name || null,
      gender: profile.gender || null,
      dob: profile.dob || null,
      country: profile.country || null,
      region: profile.region || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

  if (profileErr) {
    console.error('profile upsert error', profileErr);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'profile upsert failed' })
    };
  }

  // 2) save latest quiz result (optional)
  if (Array.isArray(picks) && picks.length) {
    const { error: resultErr } = await sb
      .from('results')
      .insert([{
        user_id,
        email,
        top3: picks,
        answers,
      }]);

    if (resultErr) {
      console.error('results insert error', resultErr);
      // not fatal for the response, we'll just warn
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true })
  };
}

export const handler = cors(handler);
