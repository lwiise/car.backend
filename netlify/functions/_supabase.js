// netlify/functions/_supabase.js
const { createClient } = require("@supabase/supabase-js");

function envOr(...keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (v) return v;
  }
  return undefined;
}

const SUPABASE_URL = envOr("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE = envOr("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE");

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing Supabase env; URL:", !!SUPABASE_URL, "SERVICE_ROLE:", !!SERVICE_ROLE);
}

function getAdminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE env.");
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

function parseJSON(body) {
  try { return body ? JSON.parse(body) : {}; } catch { return {}; }
}

async function getUserFromAuth(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return { token: null, user: null };

  const supa = getAdminClient();
  const { data, error } = await supa.auth.getUser(token);
  if (error) {
    console.warn("auth.getUser error:", error);
    return { token, user: null };
  }
  return { token, user: data?.user || null };
}

module.exports = {
  getAdminClient,
  parseJSON,
  getUserFromAuth,
};
