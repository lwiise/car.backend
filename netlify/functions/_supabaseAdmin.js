// netlify/functions/_supabaseAdmin.js
import { createClient } from "@supabase/supabase-js";

// --------------- CONFIG -----------------

// Supabase project URL (example: https://xxxx.supabase.co)
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

// Service role key (full access, ONLY on server)
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE;

// optional allowlist for real lock-down (we're NOT enforcing this in the
// dashboard endpoints right now because it caused the infinite login loop)
export const ADMIN_EMAILS = [
  "kkk1@gmail.com"
];

// Safety check in logs (don't throw here because we still want the
// function to boot so you can see errors in Netlify logs instead of crash)
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("⚠ Missing Supabase env vars. SUPABASE_URL or SERVICE_ROLE is undefined.");
}

// --------------- HELPERS -----------------

// Get a server-side Supabase client that can read any row
export function getAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false }
  });
}

// Parse JSON request body safely
export function parseJSON(body) {
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    return {};
  }
}

// Pull the Supabase user from Authorization: Bearer <jwt>
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

  return { token, user: data?.user || null };
}
