// netlify/functions/_supabase.js
import { createClient } from "@supabase/supabase-js";

// --- read secrets from Netlify env ---
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE;

// ❗ put YOUR real admin emails here
// Only these people can open /admin dashboard
export const ADMIN_EMAILS = [
  "kkk1@gmail.com",
  // add more if needed
];

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    "[_supabase] Missing Supabase env. " +
    "SUPABASE_URL ok? " + !!SUPABASE_URL +
    " SERVICE_ROLE ok? " + !!SERVICE_ROLE
  );
}

// service-role client = full DB access (server only)
export function getAdminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error("SUPABASE_URL or SERVICE_ROLE missing");
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
}

// safe JSON parse
export function parseJSON(body) {
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    return {};
  }
}

// pull current supabase user by Bearer token
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
    console.warn("[_supabase] auth.getUser error:", error);
    return { token, user: null };
  }

  return { token, user: data?.user || null };
}

// tiny helper
export function isAllowedAdmin(user) {
  if (!user || !user.email) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase());
}
