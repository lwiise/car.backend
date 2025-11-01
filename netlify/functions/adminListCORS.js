// netlify/functions/adminListCORS.js
import cors, { json } from "./cors.js";
import {
  getAdminClient,
  parseJSON,
  getUserFromAuth,
  isAllowedAdmin
} from "./_supabase.js";

// choose the top summary safely no matter how it's named
function grabSummary(row) {
  return (
    row.top_summary ??
    row.top3 ??
    row.top_3 ??
    row.summary ??
    ""
  );
}

// turn DB rows into what the frontend expects
function shapeRow(resultRow, profileMap) {
  const {
    id,
    created_at,
    user_id,
    first_pick
  } = resultRow || {};

  const prof = user_id ? profileMap[user_id] : null;

  const finalEmail = prof?.email || "—";
  const finalName  = prof?.name || prof?.nickname || "—";

  return {
    id,
    created_at,
    email: finalEmail,
    name: finalName,
    first_pick: first_pick || "—",
    top_summary: grabSummary(resultRow) || "—",
    type: user_id ? "User" : "Guest"
  };
}

export const handler = cors(async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  // 1. auth / admin gate
  const { user } = await getUserFromAuth(event);
  if (!isAllowedAdmin(user)) {
    return json(403, { error: "forbidden" });
  }

  // 2. read filters from body
  const {
    page = 1,
    pageSize = 20,
    search = "",
    type = "all",        // "all" | "user" | "guest"
    resultsOnly = true   // kept for compatibility
  } = parseJSON(event.body);

  const supa = getAdminClient();

  // pagination calc
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  const wantsSearch = (search || "").trim().length > 0;
  const MAX_FETCH   = 1000;
  const rangeFrom   = wantsSearch ? 0 : from;
  const rangeTo     = wantsSearch ? (MAX_FETCH - 1) : to;

  // base query:
  // NOTE: select("*") so we don't break on unknown columns
  let listReq = supa
    .from("quiz_results")
    .select("*")
    .order("created_at", { ascending: false })
    .range(rangeFrom, rangeTo);

  if (type === "guest") {
    listReq = listReq.is("user_id", null);
  } else if (type === "user") {
    listReq = listReq.not("user_id", "is", null);
  }
  // "all" → no filter

  const { data: resultRows, error: listErr } = await listReq;
  if (listErr) {
    console.error("[adminListCORS] listErr:", listErr);
    return json(500, {
      error: "db_list_failed",
      detail: listErr.message
    });
  }

  // build map user_id -> profile row
  const allUserIds = Array.from(
    new Set(
      resultRows
        .map(r => r.user_id)
        .filter(Boolean)
    )
  );

  let profileMap = {};
  if (allUserIds.length > 0) {
    const { data: profRows, error: profErr } = await supa
      .from("profiles")
      .select("id,email,name,nickname")
      .in("id", allUserIds);

    if (!profErr && Array.isArray(profRows)) {
      profileMap = Object.fromEntries(
        profRows.map(p => [p.id, p])
      );
    } else if (profErr) {
      console.warn("[adminListCORS] profErr:", profErr);
    }
  }

  // shape for frontend
  let shaped = resultRows.map(r => shapeRow(r, profileMap));

  // simple in-memory search
  if (wantsSearch) {
    const q = search.trim().toLowerCase();
    shaped = shaped.filter(row => {
      const hay =
        (row.name || "") + " " +
        (row.email || "") + " " +
        (row.first_pick || "") + " " +
        (row.top_summary || "");
      return hay.toLowerCase().includes(q);
    });
  }

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
