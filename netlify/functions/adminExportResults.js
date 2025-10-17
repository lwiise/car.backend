// netlify/functions/adminUserDetails.js
import { createClient } from '@supabase/supabase-js';

// ---- CORS (matches your other admin functions)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,x-admin-email',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};
const ok = (body, extra = {}) => ({
  statusCode: 200,
  headers: { ...CORS, ...extra },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const err = (code, body) => ({
  statusCode: code,
  headers: CORS,
  body: JSON.stringify(body),
});

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return ok('');

  try {
    // ----- Admin allow-list via header
    const adminEmail = (event.headers['x-admin-email'] || event.headers['X-Admin-Email'] || '')
      .toLowerCase()
      .trim();

    const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ||
      'anaskaroti@gmail.com,anas@scopeonride.com,anas@comaro.com')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    if (!adminEmail || !ADMIN_EMAILS.includes(adminEmail)) {
      return err(401, { error: 'unauthorized admin', who: adminEmail });
    }

    const qs = new URLSearchParams(event.queryStringParameters || {});
    const wantMock = qs.get('mock') === '1';

    if (wantMock) {
      return ok({
        profile: {
          id: '00000000-0000-0000-0000-000000000000',
          email: 'demo@example.com',
          name: 'Demo User',
          nickname: 'Demo',
          dob: '1990-01-01',
          gender: 'Prefer not to say',
          country: 'US',
          state: 'CA',
        },
        latest: {
          id: 1,
          created_at: new Date().toISOString(),
          top3: [
            { brand: 'Tesla', model: 'Model 3', reason: 'Range', type: 'EV' },
            { brand: 'BMW', model: 'i4', reason: 'Drive', type: 'EV' },
            { brand: 'Audi', model: 'Q4 e-tron', reason: 'Comfort', type: 'EV' },
          ],
          answers: { budget: '50000', usage: { city: 'on', highway: 'on' } },
        },
      }, { 'content-type': 'application/json' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE;
    if (!supabaseUrl || !serviceKey) {
      return err(500, { error: 'server not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE)' });
    }
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // ----- Accept id OR email
    let userId = (qs.get('id') || '').trim();
    const email = (qs.get('email') || '').trim().toLowerCase();

    if (!userId && !email) {
      return err(400, { error: 'missing id or email' });
    }

    // If only email is present, resolve profile.id first
    if (!userId && email) {
      const { data: profByEmail, error: emErr } = await sb
        .from('profiles')
        .select('id,email,name,nickname,dob,gender,country,state')
        .eq('email', email)
        .maybeSingle();

      if (emErr) return err(500, { error: 'db error (profiles by email)', detail: emErr.message });
      if (!profByEmail) return err(404, { error: 'profile not found for email', email });

      userId = profByEmail.id;

      // We already have full profile, keep it to avoid a second query
      const { data: latest, error: rErr } = await sb
        .from('results')
        .select('id,created_at,top3,answers')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return ok({ profile: profByEmail, latest: latest || null }, { 'content-type': 'application/json' });
    }

    // We have userId -> fetch profile + latest result
    const { data: profile, error: pErr } = await sb
      .from('profiles')
      .select('id,email,name,nickname,dob,gender,country,state')
      .eq('id', userId)
      .single();

    if (pErr) return err(404, { error: 'profile not found', detail: pErr.message, id: userId });

    const { data: latest, error: rErr } = await sb
      .from('results')
      .select('id,created_at,top3,answers')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (rErr) return err(500, { error: 'db error (results)', detail: rErr.message });

    return ok({ profile, latest: latest || null }, { 'content-type': 'application/json' });
  } catch (e) {
    return err(500, { error: 'internal', detail: String(e?.message || e) });
  }
}
