// netlify/functions/adminStatsCORS.js
import cors, { json } from "./cors.js";
import {
  getAdminClient,
  getUserFromAuth,
  parseJSON,
  ADMIN_EMAILS
} from "./_supabaseAdmin.js";

export const handler = cors(async function (event, context) {
  const { user } = await getUserFromAuth(event);
  if (!user) return json(401, { error: "unauthorized" });
  if (!ADMIN_EMAILS.includes(user.email)) {
    return json(403, { error: "forbidden" });
  }

  const body = parseJSON(event.body);
  const lastDays = Number(body.lastDays || 7);
  const type = body.type || null;

  const supa = getAdminClient();

  // --- total count ---
  let totalQ = supa
    .from("results")
    .select("id, user_id, created_at", { count: "exact", head: true });

  if (type === "user") totalQ = totalQ.not("user_id", "is", null);
  if (type === "guest") totalQ = totalQ.is("user_id", null);

  const { count: totalCount, error: totalErr } = await totalQ;
  if (totalErr) console.error("adminStatsCORS totalErr:", totalErr);

  // --- new in last X days ---
  const sinceISO = new Date(
    Date.now() - lastDays * 24 * 60 * 60 * 1000
  ).toISOString();

  let newQ = supa
    .from("results")
    .select("id, user_id, created_at", { count: "exact", head: true })
    .gte("created_at", sinceISO);

  if (type === "user") newQ = newQ.not("user_id", "is", null);
  if (type === "guest") newQ = newQ.is("user_id", null);

  const { count: newCount, error: newErr } = await newQ;
  if (newErr) console.error("adminStatsCORS newErr:", newErr);

  return json(200, {
    total: totalErr ? null : totalCount ?? null,
    new: newErr ? null : newCount ?? null
  });
});
