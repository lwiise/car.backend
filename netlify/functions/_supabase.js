// netlify/functions/_supabase.js
import { createClient } from "@supabase/supabase-js";

// ----- env -----
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE;

// <- put the emails that are allowed to view the admin dashboard
export const ADMIN_EMAILS = [
  "kkk1@gmail.com"
];

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    "[_supabase] Missing SUPABASE_URL or SERVICE_ROLE env var"
  );
}

// full-access server client (service_role key)
export function getAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false }
  });
}

// safe body parse
export function parseJSON(body) {
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    return {};
  }
}

// pull the supabase user from Authorization: Bearer <jwt>
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
    console.warn("[_supabase] getUserFromAuth error:", error);
    return { token, user: null };
  }
  return { token, user: data?.user || null };
}

// check if this supabase user is allowed in admin
export function isAllowedAdmin(user) {
  if (!user) return false;
  const email = (user.email || "").toLowerCase();
  return ADMIN_EMAILS.some(x => x.toLowerCase() === email);
}
