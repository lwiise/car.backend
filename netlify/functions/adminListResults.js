// netlify/functions/adminListResults.js
const { withCors } = require("./cors");
const { getAdminClient } = require("./_supabase");

exports.handler = withCors(async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const adminEmail = event.headers["x-admin-email"] || event.headers["X-Admin-Email"] || "";
  if (!adminEmail) console.warn("[adminListResults] Missing X-Admin-Email");

  const qsp = event.queryStringParameters || {};
  const limit = Math.min(parseInt(qsp.limit || "100", 10), 500);
  const offset = Math.max(parseInt(qsp.offset || "0", 10), 0);
  const only = (qsp.only || "").toLowerCase(); // 'users' | 'guests' | ''

  const sb = getAdminClient();

  let query = sb
    .from("results")
    .select("id,created_at,top3,answers,user_id,guest_id")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (only === "users") query = query.not("user_id", "is", null);
  if (only === "guests") query = query.is("user_id", null);

  const { data: results, error } = await query;
  if (error) {
    console.error("[adminListResults] results error", error);
    return { statusCode: 500, body: JSON.stringify({ error: "ADMIN_RESULTS" }) };
  }

  const userIds = [...new Set((results || []).map((r) => r.user_id).filter(Boolean))];
  let profiles = [];
  if (userIds.length) {
    const { data: profs, error: pErr } = await sb
      .from("profiles")
      .select("id,email,name,nickname,country,state,gender,dob")
      .in("id", userIds);
    if (pErr) {
      console.error("[adminListResults] profiles error", pErr);
    } else {
      profiles = profs || [];
    }
  }
  const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));

  const items = (results || []).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    top3: r.top3,
    answers: r.answers,
    user_id: r.user_id,
    guest_id: r.guest_id || null,
    profile: r.user_id ? byId[r.user_id] || null : null,
  }));

  return { statusCode: 200, body: JSON.stringify({ items }) };
});
