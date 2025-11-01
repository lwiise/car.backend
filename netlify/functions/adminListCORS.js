// netlify/functions/adminListCORS.js
import cors, { json } from "./cors.js";
import {
  getAdminClient,
  parseJSON,
  getUserFromAuth,
  isAllowedAdmin
} from "./_supabase.js";

/**
 * Build the final row object sent to frontend.
 * We merge quiz_results row + profiles row (if user_id exists).
 */
function shapeRow(resultRow, profileMap) {
  const {
    id,
    created_at,
    user_id,
    top3
  } = resultRow || {};

  const prof = user_id ? profileMap[user_id] : null;

  const finalEmail = prof?.email || "—";
  const finalName  = prof?.name || prof?.nickname || "—";

  // first pick
  let first_pick = "—";
  if (Array.isArray(top3) && top3.length > 0) {
    const p = top3[0];
    first_pick = `${p.brand || ""} ${p.model || ""}`.trim() || "—";
  }

  // summary of top3
  let top_summary = "—";
  if (Array.isArray(top3) && top3.length > 0) {
    top_summary = top3
      .slice(0, 3)
      .map(p => `${p.brand || ""} ${p.model || ""}`.trim())
      .filter(Boolean)
      .join(" • ") || "—";
  }

  const typeLabel = user_id ? "User" : "Guest";

  return {
    id,
    created_at,
    email: finalEmail,
    name: finalName,
    first_pick,
    top_summary,
    top3,
    type: typeLabel
  };
}

export const handler = cors(async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  // 1. Auth check
  const { user } = await getUserFromAuth(event);
  if (!isAllowedAdmin(user)) {
    return json(403, { error: "forbidden" });
  }

  // 2. Read body from frontend
  const {
    page = 1,
    pageSize = 20,
    search = "",
    type = "user",           // "user", "guest", or "all"
    resultsOnly = true       // kept for compatibility with frontend
  } = parseJSON(event.body);

  const supa = getAdminClient();

  // We’ll support search in JS after we fetch,
  // so we don't rely on missing DB columns.
  const querySearch = (search || "").trim().toLowerCase();
  const wantsSearch = querySearch.length > 0;

  // pagination range
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  // if we are searching, grab a bigger window so we can filter in JS
  // (to avoid hitting columns that don't exist in SQL)
  const MAX_FETCH = 1000;
  const rangeFrom = wantsSearch ? 0 : from;
  const rangeTo   = wantsSearch ? (MAX_FETCH - 1) : to;

  // base query to quiz_results
  let listReq = supa
    .from("quiz_results")
    .select("id,created_at,user_id,top3")
    .order("created_at", { ascending: false })
    .range(rangeFrom, rangeTo);

  // filter type
  if (type === "guest") {
    // only guests: user_id IS NULL
    listReq = listReq.is("user_id", null);
  } else if (type === "user") {
    // only users: user_id NOT NULL
    listReq = listReq.not("user_id", "is", null);
  } // "all" = no extra filter

  const { data: resultRows, error: listErr } = await listReq;
  if (listErr) {
    console.error("[adminListCORS] listErr:", listErr);
    return json(500, {
      error: "db_list_failed",
      detail: listErr.message
    });
  }

  // build map of profile data so we can attach email/name to the rows
  const userIds = Array.from(
    new Set(
      resultRows
        .map(r => r.user_id)
        .filter(Boolean)
    )
  );

  let profileMap = {};
  if (userIds.length > 0) {
    const { data: profRows, error: profErr } = await supa
      .from("profiles")
      .select("id,email,name,nickname")
      .in("id", userIds);

    if (profErr) {
      console.warn("[adminListCORS] profErr:", profErr);
    } else {
      profileMap = Object.fromEntries(
        profRows.map(p => [p.id, p])
      );
    }
  }

  // shape rows
  let shaped = resultRows.map(r => shapeRow(r, profileMap));

  // apply search in JS (search by name/email/top_summary)
  if (wantsSearch) {
    shaped = shaped.filter(row => {
      const hay =
        (row.name || "") + " " +
        (row.email || "") + " " +
        (row.top_summary || "");
      return hay.toLowerCase().includes(querySearch);
    });
  }

  // after filtering, slice to requested page
  const paged = wantsSearch
    ? shaped.slice(from, from + pageSize)
    : shaped;

  const hasMore = wantsSearch
    ? shaped.length > (from + pageSize)
    : (resultRows.length === pageSize);

  return json(200, {
    items: paged,
    hasMore
  });
});
