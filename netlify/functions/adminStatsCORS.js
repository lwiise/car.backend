// netlify/functions/adminStatsCORS.js
import {
  getAdminClient,
  parseJSON,
  requireAdmin,
  jsonResponse,
  preflightResponse
} from "./_supabaseAdmin.js";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse();
  }

  const auth = await requireAdmin(event);
  if (!auth.ok) {
    return jsonResponse(auth.statusCode, auth.payload);
  }

  const body = parseJSON(event.body);
  const lastDays = Number(body.lastDays) || 7;
  const type = (body.type || "user").toLowerCase();

  const supa = getAdminClient();

  // Guests tab → we currently don't store anonymous guest rows,
  // so just say 0.
  if (type === "guest") {
    return jsonResponse(200, { total: 0, new: 0 });
  }

  // total = #profiles
  const { count: totalCount, error: cntErr } = await supa
    .from("profiles")
    .select("id", { count: "exact", head: true });

  if (cntErr) {
    console.error("profiles count error", cntErr);
    return jsonResponse(500, {
      error: "db_stats_failed",
      detail: cntErr.message || String(cntErr)
    });
  }

  // new = distinct users who produced results in last X days
  const cutoffIso = new Date(
    Date.now() - lastDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: recentRows, error: recErr } = await supa
    .from("results")
    .select("user_id,created_at")
    .not("user_id", "is", null)
    .gte("created_at", cutoffIso);

  if (recErr) {
    console.error("recent results error", recErr);
    return jsonResponse(500, {
      error: "db_stats_failed",
      detail: recErr.message || String(recErr)
    });
  }

  const uniqueNew = new Set();
  for (const r of recentRows || []) {
    if (r.user_id) uniqueNew.add(r.user_id);
  }

  return jsonResponse(200, {
    total: typeof totalCount === "number" ? totalCount : 0,
    new: uniqueNew.size
  });
};
