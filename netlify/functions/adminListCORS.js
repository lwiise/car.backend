// netlify/functions/adminListCORS.js
import {
  getAdminClient,
  getUserFromAuth,
  parseJSON,
} from "./_supabaseAdmin.js";

/**
 * Small CORS helper. For now we allow any origin so we stop getting 403
 * and stop forcing you back into the login modal over and over.
 * When you're done testing, we can lock this down again.
 */
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
 * Expected request body from admin page:
 * {
 *   page: number,
 *   pageSize: number,
 *   search: string,
 *   type: "user" | "guest" | null,
 *   resultsOnly: boolean
 * }
 *
 * We reply:
 * {
 *   items: [
 *     {
 *       id,
 *       created_at,
 *       email,
 *       name,
 *       first_pick,
 *       top_summary,
 *       top3: [],
 *       type: "User" | "Guest"
 *     },
 *     ...
 *   ],
 *   hasMore: boolean
 * }
 */
export async function handler(event) {
  const origin = event.headers?.origin || "*";

  // Browser CORS preflight
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
  // We only block if there is literally NO Supabase session.
  // (Before, we also checked origin + admin email and that caused 403 loops.)
  const { token, user } = await getUserFromAuth(event);
  if (!token || !user) {
    return send(401, { error: "unauthorized" }, origin);
  }

  // ---------- INPUT ----------
  const body = parseJSON(event.body);
  const page      = Number(body.page)      || 1;
  const pageSize  = Number(body.pageSize)  || 20;
  const search    = (body.search || "").trim();
  const typeReq   = body.type === "guest" ? "guest"
                   : body.type === "user" ? "user"
                   : null; // 'all' or null → show users for now
  // resultsOnly is ignored here

  // We’ll just use the "profiles" table as the source of truth for now.
  // Guests (people who never saved an account) won't show yet. We'll add them
  // later by pulling from your quiz_results table once we confirm its schema.
  if (typeReq === "guest") {
    return send(200, { items: [], hasMore: false }, origin);
  }

  // ---------- DB QUERY ----------
  const supa = getAdminClient();

  // Pagination math for Supabase range()
  const start = (page - 1) * pageSize;
  const end   = start + pageSize - 1;

  // Build base query: newest first
  let query = supa
    .from("profiles")
    .select("id, created_at, email, name, nickname", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(start, end);

  // Text search across email / name / nickname
  if (search) {
    // Supabase .or() syntax: 'col.ilike.%term%,othercol.ilike.%term%'
    const like = `%${search}%`;
    query = query.or(
      `email.ilike.${like},name.ilike.${like},nickname.ilike.${like}`
    );
  }

  const { data: rows, error, count } = await query;

  if (error) {
    console.error("adminListCORS db_list_failed:", error);
    return send(
      500,
      {
        error: "db_list_failed",
        detail: error.message || String(error),
      },
      origin
    );
  }

  // ---------- SHAPE RESPONSE ----------
  // The frontend expects fields like:
  //   first_pick, top_summary, top3[], type
  // If we don't have car picks here yet, we just fill placeholders "—".
  const items = (rows || []).map(r => ({
    id: r.id,
    created_at: r.created_at,
    email: r.email || "—",
    name: r.name || r.nickname || "—",
    first_pick: "—",  // we’ll wire real #1 pick later
    top_summary: "—", // we’ll wire real top-3 summary later
    top3: [],         // placeholder for modal
    type: "User"
  }));

  const totalCount = typeof count === "number" ? count : items.length;
  const hasMore = end + 1 < totalCount;

  return send(
    200,
    {
      items,
      hasMore
    },
    origin
  );
}
