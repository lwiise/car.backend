// netlify/functions/adminUserDetails.js
const { withCors } = require("./cors");
const { getAdminClient } = require("./_supabase");

exports.handler = withCors(async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const adminEmail = event.headers["x-admin-email"] || event.headers["X-Admin-Email"] || "";
  if (!adminEmail) console.warn("[adminUserDetails] Missing X-Admin-Email");

  const qsp = event.queryStringParameters || {};
  const userId = qsp.id ? String(qsp.id) : null;
  const email = qsp.email ? String(qsp.email).trim() : null;

  if (!userId && !email) {
    return { statusCode: 400, body: JSON.stringify({ error: "Provide id or email" }) };
  }

  const sb = getAdminClient();

  // Resolve profile
  let profile = null;
  if (userId) {
    const { data, error } = await sb
      .from("profiles")
      .select("id,email,name,nickname,gender,dob,country,state,created_at,updated_at")
      .eq("id", userId)
      .maybeSingle();
    if (error) return { statusCode: 500, body: JSON.stringify({ error: "DB_PROFILE", detail: error.message }) };
    profile = data || null;
  } else if (email) {
    const { data, error } = await sb
      .from("profiles")
      .select("id,email,name,nickname,gender,dob,country,state,created_at,updated_at")
      .eq("email", email)
      .limit(1)
      .maybeSingle();
    if (error) return { statusCode: 500, body: JSON.stringify({ error: "DB_PROFILE", detail: error.message }) };
    profile = data || null;
  }

  if (!profile) {
    return { statusCode: 404, body: JSON.stringify({ error: "PROFILE_NOT_FOUND" }) };
  }

  // Latest result for that user (include answers & top3)
  const { data: latest, error: rErr } = await sb
    .from("results")
    .select("id,created_at,top3,answers")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rErr) {
    return { statusCode: 500, body: JSON.stringify({ error: "DB_RESULTS", detail: rErr.message }) };
  }

  // Optionally: history (last 10)
  const { data: history, error: hErr } = await sb
    .from("results")
    .select("id,created_at,top3")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(10);
  if (hErr) console.warn("[adminUserDetails] history error:", hErr.message);

  return {
    statusCode: 200,
    body: JSON.stringify({
      profile,
      latest: latest || null,
      history: history || [],
    }),
  };
});
