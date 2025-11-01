// netlify/functions/_supabase.js
const { createClient } = require("@supabase/supabase-js");

/**
 * Helper to read one of multiple possible env var names.
 * This lets us support both your current naming and the names I suggested.
 */
function envOr(...keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (v) return v;
  }
  return undefined;
}

/**
 * Pull env vars.
 * We accept multiple possibilities so you don't get stuck.
 *
 * SUPABASE_URL:
 *   - SUPABASE_URL
 *   - NEXT_PUBLIC_SUPABASE_URL (fallback)
 *
 * SERVICE ROLE KEY:
 *   - SUPABASE_SERVICE        (what I told you earlier)
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - SUPABASE_SERVICE_ROLE
 */
const SUPABASE_URL = envOr("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE = envOr(
  "SUPABASE_SERVICE",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_ROLE"
);

// Comma-separated list of admin emails.
// Example in Netlify env:
// ADMIN_EMAILS="louisanaskaroti@gmail.com,anotheradmin@site.com"
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

// Create the high-privilege client (service_role)
function sbAdmin() {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error(
      "Missing Supabase env. You must set SUPABASE_URL and SUPABASE_SERVICE (service_role key) in Netlify environment variables."
    );
  }

  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Parse body safely (POST).
 */
function parseJSON(body) {
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    return {};
  }
}

/**
 * Internal helper: read bearer token and fetch user from Supabase.
 * Returns { token, user } where user can be null.
 */
async function getUserFromAuthHeader(event) {
  const authHeader =
    event.headers?.authorization || event.headers?.Authorization || "";

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) return { token: null, user: null };

  const supa = sbAdmin();
  const { data, error } = await supa.auth.getUser(token);
  if (error) {
    console.warn("auth.getUser error:", error);
    return { token, user: null };
  }

  return { token, user: data?.user || null };
}

/**
 * Guard for admin-only functions.
 * - Confirms there's a valid Supabase session token
 * - Confirms email is allowed (ADMIN_EMAILS)
 *
 * Returns:
 *   { ok:true, user }
 * OR
 *   { ok:false, statusCode:401/403, error:"..." }
 */
async function requireAdmin(event) {
  const { token, user } = await getUserFromAuthHeader(event);

  if (!token || !user) {
    return {
      ok: false,
      statusCode: 401,
      error: "Unauthorized (no valid Supabase session token)",
    };
  }

  const email = (user.email || "").toLowerCase();

  // If ADMIN_EMAILS is empty, we allow any signed-in user.
  // If ADMIN_EMAILS has values, user.email must be in that list.
  if (ADMIN_EMAILS.length && !ADMIN_EMAILS.includes(email)) {
    return {
      ok: false,
      statusCode: 403,
      error: "Forbidden (not in ADMIN_EMAILS)",
    };
  }

  return { ok: true, user };
}

module.exports = {
  sbAdmin,
  parseJSON,
  requireAdmin,
};
