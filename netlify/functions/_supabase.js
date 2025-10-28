// _supabase.js
import { createClient } from '@supabase/supabase-js';

const url  = process.env.SUPABASE_URL;
const srk  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !srk) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env.');
}

// Admin client (bypasses RLS for server-side ops)
export const supabaseAdmin = createClient(url, srk, {
  auth: { persistSession: false }
});

// Read "Bearer <jwt>" and return the auth user (or null)
export async function getUserFromRequest(req) {
  const auth = req.headers?.authorization || req.headers?.Authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { token: null, user: null };
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) return { token, user: null };
  return { token, user: data?.user || null };
}
