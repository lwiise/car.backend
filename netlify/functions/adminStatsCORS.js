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

  const cutoffISO = new Date(
    Date.now() - lastDays * 24*60*60*1000
  ).toISOString();

  // We'll pull quiz_results id, created_at, user_id and compute stats here
  let q = supa
    .from("quiz_results")
    .select("id,created_at,user_id");

  if (type === "guest") {
    q = q.is("user_id", null);
  } else if (type === "user") {
    q = q.not("user_id", "is", null);
  }

  const { data: rows, error } = await q;
  if (error) {
    console.error("[adminStatsCORS] error:", error);
    return json(500, {
      error: "db_failed",
      detail: error.message
    });
  }

  // guests: just count rows where user_id is null
  if (type === "guest") {
    const totalGuests = rows.length;
    const newGuests = rows.filter(r => (
      r.created_at && r.created_at >= cutoffISO
    )).length;

    return json(200, {
      total: totalGuests,
      new: newGuests
    });
  }

  // users or all: dedupe by user_id
  const signedRows = rows.filter(r => !!r.user_id);

  const totalUserIds = new Set(signedRows.map(r => r.user_id));
  const totalUsersCount = totalUserIds.size;

  const newUserIds = new Set(
    signedRows
      .filter(r => r.created_at && r.created_at >= cutoffISO)
      .map(r => r.user_id)
  );
  const newUsersCount = newUserIds.size;

  return json(200, {
    total: totalUsersCount,
    new: newUsersCount
  });
});
