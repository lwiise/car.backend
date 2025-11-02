// netlify/functions/_supabaseAdmin.js
// ESM helper used by adminListCORS.js and adminStatsCORS.js

import { createClient } from "@supabase/supabase-js";

/**
 * Pull secrets from Netlify env.
 * We support both SUPABASE_SERVICE_ROLE_KEY and SUPABASE_SERVICE_ROLE,
 * because you had both in your environment block.
 */
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL || // fallback just in case
  "";

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  "";

/**
 * Admin emails allowed to access the dashboard.
 * IMPORTANT:
 * - Put your real admin email(s) here.
 * - This must match what you're logging in with in the dashboard.
 */
export const ADMIN_EMAILS = [
  "kkk1@gmail.com"
];

/**
 * Safety check so we don't silently call an undefined client.
 * (If you typo env vars in Netlify, you'll catch it fast.)
 */
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "[_supabaseAdmin] Missing SUPABASE_URL or SERVICE_ROLE_KEY env variables."
  );
}

/**
 * Return a full-access Supabase client using the service role key.
 * We create it on-demand instead of a shared singleton so that
 * (in theory) secrets aren't leaked into SSR logs accidentally, etc.
 */
export function getAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false
    }
  });
}

/**
 * Safe JSON parse for body coming from frontend.
 */
export function parseJSON(body) {
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    return {};
  }
}

/**
 * Extracts the Bearer token from request headers, then asks Supabase
 * who that user is.
 *
 * We use this to:
 * - confirm they're logged in
 * - get their email
 * - check if their email is in ADMIN_EMAILS
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

  // We don't call "auth" with service role directly, because service role
  // bypasses RLS but does NOT magically know which end-user this token is.
  //
  // HOWEVER: Supabase JS client DOES expose auth.getUser(token),
  // which will validate the JWT and return the user info.
  //
  const supa = getAdminClient();
  const { data, error } = await supa.auth.getUser(token);

  if (error) {
    console.warn("[getUserFromAuth] auth.getUser error:", error);
    return { token, user: null };
  }

  return {
    token,
    user: data?.user || null
  };
}
