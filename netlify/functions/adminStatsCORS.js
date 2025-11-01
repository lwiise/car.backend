// netlify/functions/adminStatsCORS.js
import cors, { json } from "./cors.js";
import {
  getAdminClient,
  parseJSON,
  getUserFromAuth,
  isAllowedAdmin
} from "./_supabase.js";

export const handler = cors(async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const { user } = await getUserFromAuth(event);
  if (!isAllowedAdmin(user)) {
    return json(403, { error: "forbidden" });
  }

  const {
    lastDays = 7,
    type = "user" // "user" | "guest" | "all"
  } = parseJSON(event.body);

  const supa = getAdminClient();

  // We'll fetch quiz_results rows, then compute stats in JS.
  // Why JS? Because we need distinct user_id counts for "users".

  // date cutoff
  const cutoff = new Date(Date.now() - lastDays * 24*60*60*1000).toISOString();

  // base query
  let baseReq = supa
    .from("quiz_results")
    .select("id,created_at,user_id");

  // filter by type
  if (type === "guest") {
    baseReq = baseReq.is("user_id", null);
  } else if (type === "user") {
    baseReq = baseReq.not("user_id", "is", null);
  }

  const { data: allRows, error: allErr } = await baseReq;
  if (allErr) {
    console.error("[adminStatsCORS] allErr:", allErr);
    return json(500, { error: "db_failed", detail: allErr.message });
  }

  // split logic
  if (type === "guest") {
    // guests are quiz_results with user_id NULL
    const totalGuests = allRows.length;

    const newGuests = allRows.filter(r => {
      return r.created_at && r.created_at >= cutoff;
    }).length;

    return json(200, {
      total: totalGuests,
      new: newGuests
    });
  }

  // user or all => consider signed users only (user_id not null)
  // we don't want to count same user twice
  const signedRows = allRows.filter(r => !!r.user_id);

  const totalUserIds = new Set(signedRows.map(r => r.user_id));
  const totalUsersCount = totalUserIds.size;

  const newUserIds = new Set(
    signedRows
      .filter(r => r.created_at && r.created_at >= cutoff)
      .map(r => r.user_id)
  );
  const newUsersCount = newUserIds.size;

  return json(200, {
    total: totalUsersCount,
    new: newUsersCount
  });
});
