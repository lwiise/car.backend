// netlify/functions/adminListCORS.js
import cors, { json } from "./cors.js";
import {
  getAdminClient,
  parseJSON,
  getUserFromAuth,
  isAllowedAdmin
} from "./_supabase.js";

/**
 * Turn one quiz_results row + optional profile info
 * into what the frontend table expects.
 *
 * NOTE:
 * We are NOT using quiz_results.top3 or answers anymore,
 * because those columns don't exist in your DB (confirmed by 500).
 * We'll just send placeholders for first_pick and top_summary for now.
 */
function shapeRow(resultRow, profileMap) {
  const {
    id,
    created_at,
    user_id
  } = resultRow || {};

  const prof = user_id ? profileMap[user_id] : null;

  const finalEmail = prof?.email || "—";
  const finalName  = prof?.name || prof?.nickname || "—";

  // we can't read car picks yet (column doesn't exist),
  // so just placeholders for now:
  const first_pick  = "—";
  const top_summary = "—";

  const typeLabel   = user_id ? "User" : "Guest";

  return {
    id,
    created_at,
    email: finalEmail,
    name: finalName,
    first_pick,
    top_summary,
    top3: [],         // placeholder, keeps frontend happy
    type: typeLabel
  };
}

export const handler = cors(async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  // 1. auth check
  const { user } = await getUserFromAuth(event);
  if (!isAllowedAdmin(user)) {
    return json(403, { error: "forbidden" });
  }

  // 2. read request body
  const {
    page = 1,
    pageSize = 20,
    search = "",
    type = "user",           // "user" | "guest" | "all"
    resultsOnly = true       // kept for compatibility
  } = parseJSON(event.body);

  const supa = getAdminClient();

  const querySearch = (search || "").trim().toLowerCase();
  const wantsSearch = querySearch.length > 0;

  // pagination math
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  // if searching, grab up to 1000 rows and filter in JS
  const MAX_FETCH = 1000;
  const rangeFrom = wantsSearch ? 0 : from;
  const rangeTo   = wantsSearch ? (MAX_FETCH - 1) : to;

  // build base query ONLY with columns we know exist
  let listReq = supa
    .from("quiz_results")
    .select("id,created_at,user_id")
    .order("created_at", { ascending: false })
    .range(rangeFrom, rangeTo);

  // filter "Users" vs "Guests"
  if (type === "guest") {
    // guests: user_id IS NULL
    listReq = listReq.is("user_id", null);
  } else if (type === "user") {
    // signed users: user_id NOT NULL
    listReq = listReq.not("user_id", "is", null);
  }
  // "all" -> no extra filter

  const { data: resultRows, error: listErr } = await listReq;
  if (listErr) {
    console.error("[adminListCORS] listErr:", listErr);
    return json(500, {
      error: "db_list_failed",
      detail: listErr.message
    });
  }

  // pull all distinct user_ids we saw (signed users only)
  const userIds = Array.from(
    new Set(
      resultRows
        .map(r => r.user_id)
        .filter(Boolean)
    )
  );

  // build profile map for email/name
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

  // shape rows for frontend
  let shaped = resultRows.map(r => shapeRow(r, profileMap));

  // in-memory search: name/email/top_summary
  // (top_summary is "—" for now but we keep it for future)
  if (wantsSearch) {
    shaped = shaped.filter(row => {
      const hay =
        (row.name || "") + " " +
        (row.email || "") + " " +
        (row.top_summary || "");
      return hay.toLowerCase().includes(querySearch);
    });
  }

  // final page cut
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
