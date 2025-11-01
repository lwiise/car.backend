// netlify/functions/adminStatsCORS.js
import cors, { json } from "./cors.js";
import { getAdminClient, parseJSON } from "./_supabase.js";

export default cors(async (event) => {
  const supa = getAdminClient();
  const body = parseJSON(event.body || "{}");

  const lastDays = Number(body.lastDays) || 7;
  const type     = body.type || null; // "user", "guest", or null

  // figure out the timestamp cutoff
  const since = new Date();
  since.setDate(since.getDate() - lastDays);
  const sinceISO = since.toISOString();

  // helper to apply guest/user filter on a query builder
  function applyFilter(qb) {
    if (type === "user") {
      return qb.not("user_id", "is", null);   // only signed-in results
    } else if (type === "guest") {
      return qb.is("user_id", null);          // only anonymous results
    }
    return qb;                                // all
  }

  // total count
  let totalQ = applyFilter(
    supa
      .from("results")
      .select("id", { count: "exact", head: true })
  );
  const { count: totalCount, error: totalErr } = await totalQ;
  if (totalErr) console.warn("adminStatsCORS totalErr", totalErr);

  // new in last X days
  let newQ = applyFilter(
    supa
      .from("results")
      .select("id, created_at", { count: "exact", head: true })
      .gte("created_at", sinceISO)
  );
  const { count: newCount, error: newErr } = await newQ;
  if (newErr) console.warn("adminStatsCORS newErr", newErr);

  return json(200, {
    total: totalCount || 0,
    new:   newCount   || 0,
  });
});
