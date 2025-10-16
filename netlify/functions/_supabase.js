// netlify/functions/_supabase.js  — Netlify Functions v1 (CommonJS)
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

// Set your allowed origin (Webflow site)
const ALLOW_ORIGIN = 'https://scopeonride.webflow.io'; // or '*' while testing

function serverClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    const miss = [];
    if (!SUPABASE_URL) miss.push('SUPABASE_URL');
    if (!SERVICE_ROLE) miss.push('SUPABASE_SERVICE_ROLE');
    throw new Error(`Missing env: ${miss.join(', ')}`);
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Headers': 'content-type,x-admin-email',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  };
}

function okJSON(body, extra = {}) {
  return {
    statusCode: 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders(), extra),
    body: JSON.stringify(body),
  };
}

function errorJSON(status, message, details = null) {
  return {
    statusCode: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, corsHeaders()),
    body: JSON.stringify({ error: message, details }),
  };
}

// Put your **real admin emails** here:
const allowedAdmins = [
  'anaskaroti@gmail.com',
  'anus.anu32@gmail.com',
  'info@scopeonride.com',
];

function requireAdminEmail(event) {
  const email = String((event.headers['x-admin-email'] || event.headers['X-Admin-Email'] || '')).trim().toLowerCase();
  if (!email) throw new Error('NO_ADMIN_EMAIL_HEADER');
  const ok = allowedAdmins.map((e) => e.toLowerCase()).includes(email);
  if (!ok) throw new Error('NOT_ALLOWED');
  return email;
}

function readPager(url) {
  const u = new URL(url);
  const limit = Math.max(1, Math.min(100, parseInt(u.searchParams.get('limit') || '20', 10)));
  const offset = Math.max(0, parseInt(u.searchParams.get('offset') || '0', 10));
  const mock = u.searchParams.get('mock') === '1';
  return { limit, offset, mock };
}

module.exports = {
  serverClient,
  corsHeaders,
  okJSON,
  errorJSON,
  requireAdminEmail,
  readPager,
};
