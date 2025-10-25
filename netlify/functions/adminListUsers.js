// netlify/functions/adminListUsers.js
const { withCors } = require("./cors");
const { getAdminClient } = require("./_supabase");

exports.handler = withCors(async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // Optional: check admin header is present
  const adminEmail = event.headers["x-admin-email"] || event.headers["X-Admin-Email"] || "";
  if (!adminEmail) {
    // If you want this strict, return 401. Otherwise, just log.
    // return { statusCode: 401, body: JSON.stringify({ error: "X-Admin-Email required" }) };
    console.warn("[adminListUsers] Missing X-Admin-Email");
  }

  const qsp = event.queryStringParameters || {};
  const limit = Math.min(parseInt(qsp.limit || "100", 10), 500);
  const offset = Math.max(parseInt(qsp.offset || "0", 10), 0);
  const has = qsp.has; // '1' only users with results, '0' only without, undefined = all

  const sb = getAdminClient();

  // Load profiles
  const { data: profiles, error: profErr } = await sb
    .from("profiles")
    .select("id,email,name,nickname,country,state,gender,dob,created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (profErr) {
    console.error("[adminListUsers] profiles error", profErr);
    return { statusCode: 500, body: JSON.stringify({ error: "ADMIN_USERS_PROFILES" }) };
  }

  const ids = profiles.map((p) => p.id);
  let latestByUser = {};
  if (ids.length) {
    // Fetch latest results for these users
    const { data: resRows, error: resErr } = await sb
      .from("results")
      .select("id,user_id,created_at,top3")
      .in("user_id", ids)
      .order("created_at", { ascending: false });

    if (resErr) {
      console.error("[adminListUsers] results error", resErr);
      return { statusCode: 500, body: JSON.stringify({ error: "ADMIN_USERS_RESULTS" }) };
    }

    for (const r of resRows || []) {
      if (!latestByUser[r.user_id]) latestByUser[r.user_id] = r;
    }
  }

  let items = profiles.map((p) => ({
    id: p.id,
    email: p.email,
    name: p.name,
    nickname: p.nickname,
    country: p.country,
    state: p.state,
    gender: p.gender,
    dob: p.dob,
    created_at: p.created_at,
    latest_result: latestByUser[p.id] || null,
  }));

  if (has === "1") items = items.filter((i) => i.latest_result && Array.isArray(i.latest_result.top3) && i.latest_result.top3.length);
  if (has === "0") items = items.filter((i) => !i.latest_result || !Array.isArray(i.latest_result.top3) || !i.latest_result.top3.length);

  return { statusCode: 200, body: JSON.stringify({ items }) };
});
