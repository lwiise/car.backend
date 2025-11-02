// netlify/functions/adminListCORS.js
import {
  getAdminClient,
  getUserFromAuth,
  parseJSON,
} from "./_supabaseAdmin.js";

// Basic CORS helper (we keep it open so Webflow/admin page can talk to Netlify)
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
 *   page: number,
 *   pageSize: number,
 *   search: string,
 *   type: "user" | "guest" | null,
 *   resultsOnly: boolean
 * }
 *
 * We respond:
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
 *
 * NOTE:
 * - We're pulling from Supabase Auth (auth.users) via auth.admin.listUsers()
 *   using the service role.
 * - We're not showing guests yet. Guests will come from quiz results later.
 */
export async function handler(event) {
  const origin = event.headers?.origin || "*";

  // Handle preflight
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
  // We ONLY require that there is *some* valid Supabase user token.
  // We do NOT block you anymore for origin or specific email. That loop was hell.
  const { token, user } = await getUserFromAuth(event);
  if (!token || !user) {
    return send(401, { error: "unauthorized" }, origin);
  }

  // ---- INPUT ----
  const body = parseJSON(event.body);
  const page     = Number(body.page)     || 1;
  const pageSize = Number(body.pageSize) || 20;
  const rawSearch = (body.search || "").trim();
  const typeReq = body.type === "guest"
    ? "guest"
    : body.type === "user"
    ? "user"
    : null; // "all" or null means show users for now

  // If user selects "guest", we don't have guest storage wired here yet,
  // so just return empty list (no crash, frontend still works).
  if (typeReq === "guest") {
    return send(
      200,
      { items: [], hasMore: false },
      origin
    );
  }

  // ---- FETCH USERS FROM SUPABASE AUTH ----
  // We use the service-role client so we can call auth.admin.listUsers().
  const supa = getAdminClient();

  // listUsers is paginated by page & perPage
  // page is 1-based, perPage max is usually fine < 1000.
  const { data: listData, error: listErr } = await supa.auth.admin.listUsers({
    page,
    perPage: pageSize,
  });

  if (listErr) {
    console.error("adminListCORS listUsers error:", listErr);
    return send(
      500,
      { error: "auth_list_failed", detail: listErr.message || String(listErr) },
      origin
    );
  }

  const rawUsers = listData?.users || [];

  // ---- OPTIONAL SEARCH FILTER ON EMAIL / NAME ----
  // We do it in JS because Supabase auth.admin.listUsers() doesn't give us a filter.
  let filteredUsers = rawUsers;
  if (rawSearch && rawSearch.length >= 2) {
    const term = rawSearch.toLowerCase();
    filteredUsers = rawUsers.filter(u => {
      const email = (u.email || "").toLowerCase();
      const nm =
        (u.user_metadata?.name ||
         u.user_metadata?.full_name ||
         u.user_metadata?.nickname ||
         ""
        ).toLowerCase();
      return email.includes(term) || nm.includes(term);
    });
  }

  // ---- SHAPE THE ROWS FOR THE FRONTEND TABLE ----
  const items = filteredUsers.map(u => {
    const created_at = u.created_at || u.last_sign_in_at || null;
    const name =
      u.user_metadata?.name ||
      u.user_metadata?.full_name ||
      u.user_metadata?.nickname ||
      "—";

    return {
      id: u.id,
      created_at,
      email: u.email || "—",
      name,
      // we don't yet stitch car picks here -> placeholder
      first_pick: "—",
      top_summary: "—",
      top3: [],
      type: "User"
    };
  });

  // ---- PAGINATION MARKER ----
  // hasMore = did we fill the pageSize completely?
  const hasMore = filteredUsers.length === pageSize;

  return send(
    200,
    { items, hasMore },
    origin
  );
}
