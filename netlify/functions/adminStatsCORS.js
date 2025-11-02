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
 * Frontend sends:
 * {
 *   lastDays: number,
 *   type: "user" | "guest" | null
 * }
 *
 * We respond:
 * {
 *   total: number,
 *   new: number
 * }
 *
 * We compute stats from Supabase Auth users.
 */
export async function handler(event) {
  const origin = event.headers?.origin || "*";

  // Preflight
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

  // ---- AUTH CHECK ----
  const { token, user } = await getUserFromAuth(event);
  if (!token || !user) {
    return send(401, { error: "unauthorized" }, origin);
  }

  // ---- INPUT ----
  const body = parseJSON(event.body);
  const lastDays = Number(body.lastDays) || 7;
  const typeReq  = body.type === "guest"
    ? "guest"
    : body.type === "user"
    ? "user"
    : null;

  // If asking for guests, we don't have guest storage wired yet.
  if (typeReq === "guest") {
    return send(
      200,
      { total: 0, new: 0 },
      origin
    );
  }

  // ---- LOAD USERS (BIG PAGE JUST TO COUNT) ----
  // We'll just pull up to 1000 accounts. That's more than enough right now.
  const supa = getAdminClient();
  const { data: listData, error: listErr } = await supa.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listErr) {
    console.error("adminStatsCORS listUsers error:", listErr);
    return send(
      500,
      { error: "auth_list_failed", detail: listErr.message || String(listErr) },
      origin
    );
  }

  const usersArr = listData?.users || [];
  const nowMs = Date.now();
  const cutoffMs = nowMs - lastDays * 24 * 60 * 60 * 1000;

  let totalCount = 0;
  let newCount = 0;

  for (const u of usersArr) {
    totalCount += 1;

    // pick a timestamp we can compare
    const tsStr = u.created_at || u.last_sign_in_at || null;
    if (tsStr) {
      const ts = Date.parse(tsStr);
      if (!Number.isNaN(ts) && ts >= cutoffMs) {
        newCount += 1;
      }
    }
  }

  return send(
    200,
    {
      total: totalCount,
      new: newCount,
    },
    origin
  );
}
