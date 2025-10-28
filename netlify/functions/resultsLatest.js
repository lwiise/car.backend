// netlify/functions/resultsLatest.js
const cors = require("./cors");
const { getAdminClient, getUserFromAuth } = require("./_supabase");

async function handler(event) {
  const { token, user } = await getUserFromAuth(event);
  if (!token || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: "NO_SESSION" }) };
  }

  const supa = getAdminClient();
  const { data, error } = await supa
    .from("results")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("resultsLatest error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "DB_QUERY_FAILED" }) };
  }

  return { statusCode: 200, body: JSON.stringify({ item: data?.[0] || null }) };
}

exports.handler = cors(handler);
