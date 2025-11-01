// netlify/functions/_supabase.js
import { createClient } from "@supabase/supabase-js";

/**
 * Helper to read from multiple possible env names.
 * (People name these differently sometimes.)
 */
function envOr(...keys) {
  for (const k of keys) {
    const v = process.env[k];
    if (v) return v;
  }
  return undefined;
}

// pull secrets from Netlify env
const SUPABASE_URL = envOr(
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL"
);

const SERVICE_ROLE = envOr(
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_ROLE"
);

/**
 * Who is allowed to access admin endpoints.
 * Preferred: set ADMIN_EMAILS in Netlify env to
 * "admin1@email.com,admin2@email.com"
 * Fallback: hardcode your own so you don't get locked out.
 */
export const ADMIN_EMAILS = (
  process.env.ADMIN_EMAILS || "kkk1@gmail.com"
)
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// safety check (visible in Netlify logs if misconfigured)
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    "Missing Supabase env vars. " +
    "SUPABASE_URL:", !!SUPABASE_URL,
    "SERVICE_ROLE:", !!SERVICE_ROLE
  );
}

/**
 * Create a full-access Supabase client using the service role key.
 * We explicitly disable persisting any session on the server.
 */
export function getAdminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE in env."
    );
  }

  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
}

/**
 * Safely parse JSON from the Lambda body.
 */
export function parseJSON(body) {
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    return {};
  }
}

/**
 * Pull Bearer token from Authorization header,
 * then ask Supabase who that token belongs to.
 * Returns { token, user }.
 */
export async function getUserFromAuth(event) {
  const authHeader =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    "";

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return { token: null, user: null };
  }

  const supa = getAdminClient();
  const { data, error } = await supa.auth.getUser(token);

  if (error) {
    console.warn("auth.getUser error:", error);
    return { token, user: null };
  }

  return {
    token,
    user: data?.user || null
  };
}
