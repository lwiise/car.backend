// netlify/functions/resultsLatest.js
const { withCors } = require("./cors");
const { getAdminClient } = require("./_supabase");

exports.handler = withCors(async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const auth = event.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return { statusCode: 401, body: JSON.stringify({ error: "UNAUTHORIZED" }) };
  }

  const token = auth.replace(/^Bearer\s+/i, "");
  const sb = getAdminClient();
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    return { statusCode: 401, body: JSON.stringify({ error: "INVALID_SESSION" }) };
  }
  const userId = userData.user.id;

  const { data, error } = await sb
    .from("results")
    .select("id,created_at,top3")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[resultsLatest] error", error);
    return { statusCode: 500, body: JSON.stringify({ error: "DB" }) };
  }

  return { statusCode: 200, body: JSON.stringify({ top3_json: data?.top3 || [], created_at: data?.created_at || null }) };
});
