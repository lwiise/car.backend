// netlify/functions/_supabase.js
import { createClient } from "@supabase/supabase-js";

/**
 * ENV SETUP
 * ----------
 * Netlify will inject these from your dashboard env vars.
 * We try a couple keys so it also works locally.
 */
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE;

/**
 * WHO IS ALLOWED TO SEE ADMIN DASHBOARD
 * ------------------------------------
 * put your real admin emails here.
 * these MUST match the email on the Supabase auth user that logs in.
 */
export const ADMIN_EMAILS = [
  "kkk1@gmail.com",
];

/**
 * safety log in case env is missing
 */
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    "❌ Missing Supabase env vars. " +
    "SUPABASE_URL:", !!SUPABASE_URL,
    "SERVICE_ROLE:", !!SERVICE_ROLE
  );
}

/**
 * getAdminClient()
 * ----------------
 * returns a SERVICE-ROLE Supabase client (full DB access).
 * we use it in Netlify functions ONLY, never expose this to the browser.
 */
export function getAdminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error("Missing SUPABASE_URL or SERVICE_ROLE env.");
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
}

/**
 * parseJSON()
 * -----------
 * safely parse event.body
 */
export function parseJSON(body) {
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    return {};
  }
}

/**
 * getUserFromAuth(event)
 * ----------------------
 * reads Authorization: Bearer <jwt>
 * then asks Supabase to resolve that JWT to a user
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
    user: data?.user || null,
  };
}

/**
 * isAllowedAdmin(email)
 * ---------------------
 * helper to check if the signed-in Supabase user
 * is allowed to view admin endpoints.
 */
export function isAllowedAdmin(email) {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email);
}
