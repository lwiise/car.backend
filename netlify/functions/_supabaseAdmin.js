// netlify/functions/_supabaseAdmin.js
import { createClient } from "@supabase/supabase-js";

// env
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE;

export const ALLOWED_ORIGIN =
  process.env.ALLOWED_ORIGIN || "*";

export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

// create a full-access Supabase client (service_role bypasses RLS)
export function getAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
}

// tiny safe JSON parser
export function parseJSON(str) {
  try {
    return str ? JSON.parse(str) : {};
  } catch {
    return {};
  }
}

// pull "Authorization: Bearer <jwt>" from request and ask Supabase who that is
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
    console.warn("getUserFromAuth error:", error);
    return { token, user: null };
  }

  return { token, user: data?.user || null };
}

// check that caller is logged in AND allowed as admin
export async function requireAdmin(event) {
  const { token, user } = await getUserFromAuth(event);

  if (!user) {
    // not even logged in
    return {
      ok: false,
      statusCode: 401,
      payload: { error: "unauthorized" },
      token,
      user: null
    };
  }

  const emailLc = (user.email || "").toLowerCase();
  if (!ADMIN_EMAILS.includes(emailLc)) {
    // logged in but not an admin email
    return {
      ok: false,
      statusCode: 403,
      payload: { error: "forbidden" },
      token,
      user
    };
  }

  return { ok: true, token, user };
}

// CORS headers (same everywhere so frontend can POST from your admin page)
function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

// normal JSON response
export function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(data ?? null)
  };
}

// OPTIONS preflight
export function preflightResponse() {
  return {
    statusCode: 200,
    headers: corsHeaders(),
    body: ""
  };
}
