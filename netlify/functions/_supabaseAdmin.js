// netlify/functions/_supabaseAdmin.js
import { createClient } from "@supabase/supabase-js";

// pull secrets from Netlify env
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE;

// 🔐 WHO IS ALLOWED TO SEE ADMIN DATA
// put your real admin email(s) here:
export const ADMIN_EMAILS = [
  "kkk1@gmail.com"
];

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    "Missing Supabase env vars. SUPABASE_URL or SERVICE_ROLE is undefined."
  );
}

// create a full-access client using service_role
export function getAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false }
  });
}

// safely parse JSON body
export function parseJSON(body) {
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    return {};
  }
}

// read the Authorization: Bearer <jwt> header -> get Supabase user
export async function getUserFromAuth(event) {
  const auth =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    "";

  const token = auth.startsWith("Bearer ")
    ? auth.slice(7)
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

  return { token, user: data?.user || null };
}
