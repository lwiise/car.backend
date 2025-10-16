// netlify/functions/_supa.js
import { createClient } from '@supabase/supabase-js';

export function supaAdmin() {
  const url  = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE; // service role — server only
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE');
  return createClient(url, key, { auth: { persistSession: false } });
}

export function ok(data, extraHeaders = {}) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Email',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      ...extraHeaders,
    },
    body: JSON.stringify(data),
  };
}
export function bad(status, message) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ error: message }),
  };
}
export function handleOptions() {
  return {
    statusCode: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Email',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
    },
    body: '',
  };
}
export function requireAdmin(event) {
  const raw = process.env.ADMIN_EMAILS || '';
  const allow = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const email = (event.headers['x-admin-email'] || event.headers['X-Admin-Email'] || '').toLowerCase();
  if (!email) return { ok: false, reason: 'Missing X-Admin-Email header' };
  if (allow.length && !allow.includes(email)) return { ok: false, reason: 'Email not allowed' };
  return { ok: true, email };
}
