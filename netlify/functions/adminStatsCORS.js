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
    type = null  // null|"all"|"user"|"guest"
  } = parseJSON(event.body);

  const supa = getAdminClient();

  // helper to build base query with filters
  function baseFilter(q, mode) {
    if (mode === "guest") {
      return q.is("user_id", null);
    }
    if (mode === "user") {
      return q.not("user_id", "is", null);
    }
    // "all" or null -> no filter
    return q;
  }

  // total count
  {
    let totalQ = supa
      .from("quiz_results")
      .select("id", { count: "exact", head: true });

    totalQ = baseFilter(totalQ, type || "all");

    const { count: totalCount, error: totErr } = await totalQ;
    if (totErr) {
      console.error("[adminStatsCORS] totalErr:", totErr);
      return json(500, {
        error: "db_total_failed",
        detail: totErr.message
      });
    }

    // new count in the last X days
    const cutoff = new Date(Date.now() - lastDays * 24 * 60 * 60 * 1000)
      .toISOString();

    let newQ = supa
      .from("quiz_results")
      .select("id,created_at", { count:"exact", head:true })
      .gte("created_at", cutoff);

    newQ = baseFilter(newQ, type || "all");

    const { count: newCount, error: newErr } = await newQ;
    if (newErr) {
      console.error("[adminStatsCORS] newErr:", newErr);
      return json(500, {
        error: "db_new_failed",
        detail: newErr.message
      });
    }

    return json(200, {
      total: totalCount ?? 0,
      new: newCount ?? 0
    });
  }
});
