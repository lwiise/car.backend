// netlify/functions/_supabase.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

// 1) Create the server client (needs service role for admin read)
export function serverClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    const miss = [];
    if (!SUPABASE_URL) miss.push('SUPABASE_URL');
    if (!SERVICE_ROLE) miss.push('SUPABASE_SERVICE_ROLE');
    throw new Error(`Missing env: ${miss.join(', ')}`);
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
}

// 2) CORS helpers
const ALLOW_ORIGIN = '*';
export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Headers': 'content-type,x-admin-email',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  };
}
export function okJSON(body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(), ...extra },
  });
}
export function errorJSON(status, message, details = null) {
  return new Response(JSON.stringify({ error: message, details }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

// 3) Admin allow-list  ⬅️ put your real admin emails here
const allowedAdmins = [
  'anaskaroti@gmail.com',
  'admin2@example.com',
  // add more…
];

// 4) Read/validate admin email from header
export function requireAdminEmail(req) {
  const email = (req.headers.get('x-admin-email') || '').trim().toLowerCase();
  if (!email) throw new Error('NO_ADMIN_EMAIL_HEADER');
  const ok =
    allowedAdmins.length === 0 ||
    allowedAdmins.map((e) => e.toLowerCase()).includes(email);
  if (!ok) throw new Error('NOT_ALLOWED');
  return email;
}

// 5) Small util to parse limit/offset
export function readPager(url) {
  const u = new URL(url);
  const limit = Math.max(1, Math.min(100, parseInt(u.searchParams.get('limit') || '20', 10)));
  const offset = Math.max(0, parseInt(u.searchParams.get('offset') || '0', 10));
  return { limit, offset, mock: u.searchParams.get('mock') === '1' };
}
