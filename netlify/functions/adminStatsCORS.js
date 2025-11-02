// netlify/functions/adminStatsCORS.js
import {
  getAdminClient,
  getUserFromAuth,
  parseJSON,
} from "./_supabaseAdmin.js";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function send(statusCode, bodyObj, origin) {
  return {
    statusCode,
    headers: corsHeaders(origin),
    body: JSON.stringify(bodyObj ?? {}),
  };
}

/**
 * Request body from the dashboard:
 * {
 *   lastDays: number,
 *   type: "user" | "guest" | null
 * }
 *
 * We return:
 * {
 *   total: number,
 *   new: number
 * }
 */
export async function handler(event) {
  const origin = event.headers?.origin || "*";

  // Handle browser preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return send(405, { error: "method_not_allowed" }, origin);
  }

  // ---------- AUTH ----------
  const { token, user } = await getUserFromAuth(event);
  if (!token || !user) {
    return send(401, { error: "unauthorized" }, origin);
  }

  // ---------- INPUT ----------
  const body = parseJSON(event.body);
  const lastDays = Number(body.lastDays) || 7;
  const typeReq  = body.type === "guest" ? "guest"
                 : body.type === "user" ? "user"
                 : null;

  // If they're specifically asking for guests, right now we don't have
  // a guest table wired in this safe version. Return 0/0 instead of 403.
  if (typeReq === "guest") {
    return send(
      200,
      { total: 0, new: 0 },
      origin
    );
  }

  // ---------- DB ----------
  const supa = getAdminClient();

  // Pull all profiles' created_at so we can count
  const { data: rows, error } = await supa
    .from("profiles")
    .select("created_at");

  if (error) {
    console.error("adminStatsCORS db_failed:", error);
    return send(
      500,
      {
        error: "db_stats_failed",
        detail: error.message || String(error),
      },
      origin
    );
  }

  const now = Date.now();
  const cutoffMs = now - lastDays * 24 * 60 * 60 * 1000;

  let totalCount = 0;
  let newCount   = 0;

  for (const r of rows || []) {
    totalCount += 1;
    const ts = Date.parse(r.created_at);
    if (!Number.isNaN(ts) && ts >= cutoffMs) {
      newCount += 1;
    }
  }

  return send(
    200,
    {
      total: totalCount,
      new: newCount
    },
    origin
  );
}
