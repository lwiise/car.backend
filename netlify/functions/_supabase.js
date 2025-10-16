// netlify/functions/_supabase.js
import { createClient } from '@supabase/supabase-js';

// ====== PUT YOUR ADMIN EMAILS HERE ======
// Replace these examples with your real admin emails.
// You can add as many as you want.
const allowedAdmins = [
  'you@example.com',
  'second.admin@example.com',
];

export function isAllowedAdmin(email) {
  return typeof email === 'string' && allowedAdmins.map(s => s.toLowerCase().trim()).includes(email.toLowerCase().trim());
}

export function adminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE env var');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

export function cors(res) {
  res.headers = {
    ...(res.headers || {}),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type,x-admin-email',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
  };
  return res;
}

export function json(body, status = 200, extraHeaders = {}) {
  return cors({
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  });
}

export function badRequest(msg) { return json({ error: msg }, 400); }
export function forbidden(msg)  { return json({ error: msg || 'forbidden' }, 403); }
export function serverError(msg){ return json({ error: msg || 'server error' }, 500); }
