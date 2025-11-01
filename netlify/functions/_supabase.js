// netlify/functions/_supabase.js
import { createClient } from "@supabase/supabase-js";

/**
 * Small helper: return the first defined env var from a list of keys.
 * Lets you support SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE, etc.
 */
function envOr(...keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (v) return v;
  }
  return undefined;
}

const SUPABASE_URL = envOr("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE = envOr(
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_ROLE"
);

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    "Missing Supabase env;",
    "URL present? ",
    !!SUPABASE_URL,
    "SERVICE_ROLE present? ",
    !!SERVICE_ROLE
  );
}

/**
 * Create a service-role Supabase client (bypasses RLS).
 * We do NOT persist session on server functions.
 */
function getAdminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE in environment."
    );
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
}

/**
 * Safe JSON parse for Lambda bodies.
 */
function parseJSON(body) {
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    return {};
  }
}

/**
 * Extract the Bearer token from the request's Authorization header,
 * ask Supabase who that is, and return { token, user }.
 */
async function getUserFromAuth(event) {
  const auth =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    "";
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

export { getAdminClient, parseJSON, getUserFromAuth };
