// netlify/functions/adminListCORS.js
import cors, { json } from "./cors.js";
import {
  getAdminClient,
  parseJSON,
  getUserFromAuth,
  isAllowedAdmin
} from "./_supabase.js";

function shapeRow(resultRow, profileMap) {
  const {
    id,
    created_at,
    user_id,
    email: guestEmail,
    name: guestName,
    top3
  } = resultRow || {};

  const prof = user_id ? profileMap[user_id] : null;

  const finalEmail = prof?.email || guestEmail || "—";
  const finalName  = prof?.name  || prof?.nickname || guestName || "—";

  let first_pick = "—";
  if (Array.isArray(top3) && top3.length > 0) {
    const p = top3[0];
    first_pick = `${p.brand || ""} ${p.model || ""}`.trim() || "—";
  }

  let top_summary = "—";
  if (Array.isArray(top3) && top3.length > 0) {
    top_summary = top3
      .slice(0,3)
      .map(p => `${p.brand||""} ${p.model||""}`.trim())
      .filter(Boolean)
      .join(" • ") || "—";
  }

  const type = user_id ? "User" : "Guest";

  return {
    id,
    created_at,
    email: finalEmail,
    name: finalName,
    first_pick,
    top_summary,
    top3,
    type
  };
}

export const handler = cors(async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  // auth check
  const { user } = await getUserFromAuth(event);
  if (!isAllowedAdmin(user)) {
    return json(403, { error: "forbidden" });
  }

  // read body
  const {
    page = 1,
    pageSize = 20,
    search = "",
    type = "user",           // "user", "guest", or null/"all"
    resultsOnly = true       // we keep this param just in case frontend sends it
  } = parseJSON(event.body);

  const supa = getAdminClient();

  // build base filter on quiz_results
  // - user_id IS NULL  => guests
  // - user_id NOT NULL => users
  // - no filter        => all
  const filters = [];
  if (type === "guest") {
    filters.push("user_id.is.null");          // PostgREST syntax
  } else if (type === "user") {
    filters.push("user_id.not.is.null");
  }

  // basic ilike search on email, name, and also any car text in top3[].brand/model/reason
  // NOTE: Supabase .or() expects "col.ilike.*query*,col2.ilike.*query*"
  // We'll just match name/email for now because it's reliable.
  const doSearch = (search || "").trim();
  const querySearch = doSearch !== "" ? doSearch : null;

  // pagination math
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  // 1. pull rows from quiz_results
  // We select columns we actually use.
  let listReq = supa
    .from("quiz_results")
    .select("id,created_at,user_id,email,name,top3")
    .order("created_at", { ascending: false })
    .range(from, to);

  // apply filters
  for (const f of filters) {
    // translate our filter strings into supabase-js calls
    if (f === "user_id.is.null") {
      listReq = listReq.is("user_id", null);
    } else if (f === "user_id.not.is.null") {
      listReq = listReq.not("user_id", "is", null);
    }
  }

  if (querySearch) {
    // we try to match either stored guest email/name OR future profile email/name.
    listReq = listReq.or(
      `email.ilike.%${querySearch}%,name.ilike.%${querySearch}%`
    );
  }

  const { data: resultRows, error: listErr } = await listReq;
  if (listErr) {
    console.error("[adminListCORS] listErr:", listErr);
    return json(500, { error: "db_list_failed", detail: listErr.message });
  }

  // collect distinct user_ids so we can enrich with profiles
  const userIds = Array.from(
    new Set(
      resultRows
        .map(r => r.user_id)
        .filter(v => !!v)
    )
  );

  let profileMap = {};
  if (userIds.length > 0) {
    const { data: profRows, error: profErr } = await supa
      .from("profiles")
      .select(
        "id,email,name,nickname,gender,dob,country,state,created_at,updated_at"
      )
      .in("id", userIds);

    if (profErr) {
      console.warn("[adminListCORS] profErr:", profErr);
    } else {
      profileMap = Object.fromEntries(
        profRows.map(p => [p.id, p])
      );
    }
  }

  // final shaped rows for frontend table
  const shaped = resultRows.map(r => shapeRow(r, profileMap));

  // "hasMore": true if we filled the full pageSize
  const hasMore = resultRows.length === pageSize;

  return json(200, {
    items: shaped,
    hasMore
  });
});
