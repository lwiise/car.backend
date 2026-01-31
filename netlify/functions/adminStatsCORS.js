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
    return preflightResponse(event);
  }

  const auth = await requireAdmin(event);
  if (!auth.ok) {
    return jsonResponse(auth.statusCode, auth.payload, event);
  }

  const body     = parseJSON(event.body);
  const lastDays = Number(body.lastDays) || 7;
  const type     = (body.type || "user").toLowerCase();

  const supa = getAdminClient();

  // cutoff date for "new in last X days"
  const cutoffIso = new Date(
    Date.now() - lastDays * 24 * 60 * 60 * 1000
  ).toISOString();

  // -------- guests ----------
  if (type === "guest") {
    // total = count of guest_results rows
    const { count: totalCount, error: gCntErr } = await supa
      .from("guest_results")
      .select("id", { count: "exact", head: true });

    if (gCntErr) {
      console.error("guest_results count err", gCntErr);
      return jsonResponse(500, {
        error: "db_stats_failed",
        detail: gCntErr.message || String(gCntErr)
      }, event);
    }

    // new = rows in last X days
    const { data: recentGuests, error: gRecErr } = await supa
      .from("guest_results")
      .select("id,created_at")
      .gte("created_at", cutoffIso);

    if (gRecErr) {
      console.error("guest_results recent err", gRecErr);
      return jsonResponse(500, {
        error: "db_stats_failed",
        detail: gRecErr.message || String(gRecErr)
      }, event);
    }

    const newCount = (recentGuests || []).length;

    return jsonResponse(200, {
      total: typeof totalCount === "number" ? totalCount : 0,
      new: newCount
    }, event);
  }

  // -------- users ----------
  // total users = count of profiles
  const { count: totalCount, error: uCntErr } = await supa
    .from("profiles")
    .select("id", { count: "exact", head: true });

  if (uCntErr) {
    console.error("profiles count error", uCntErr);
    return jsonResponse(500, {
      error: "db_stats_failed",
      detail: uCntErr.message || String(uCntErr)
    }, event);
  }

  // new users (last X days) = distinct user_ids in results in that window
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
    }, event);
  }

  const uniqueNew = new Set();
  for (const r of recentRows || []) {
    if (r.user_id) uniqueNew.add(r.user_id);
  }

  return jsonResponse(200, {
    total: typeof totalCount === "number" ? totalCount : 0,
    new: uniqueNew.size
  }, event);
};
