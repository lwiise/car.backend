// netlify/functions/_supabaseAdmin.js
import { createClient } from "@supabase/supabase-js";

// --- ENV / CONFIG -------------------------------------------------

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE;

// who is allowed to view admin dashboard
// keep your real admin email(s) here:
export const ADMIN_EMAILS = [
  "kkk1@gmail.com",
];

// CORS: allow your site to call these functions from the browser
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
export const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing Supabase env vars. Check SUPABASE_URL / SERVICE_ROLE.");
}

// create high-privilege client (service_role -> bypass RLS, can read auth.users)
export function getAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
}

// tiny helper so we don't repeat JSON response boilerplate
export function jsonResponse(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
    body: JSON.stringify(bodyObj ?? null),
  };
}

// parse request body safely
export function parseBody(body) {
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    return {};
  }
}

// read Authorization header and resolve the Supabase user
export async function getRequester(event) {
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

// shortcut for forbidden
export function forbidden() {
  return jsonResponse(403, { error: "forbidden" });
}

// shortcut for OPTIONS preflight
export function handleOptions() {
  return { statusCode: 200, headers: corsHeaders, body: "" };
}
