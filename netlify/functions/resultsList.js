// netlify/functions/resultsList.js
const cors = require("./cors");
const { getAdminClient, getUserFromAuth } = require("./_supabase");

async function handler(event) {
  const { token, user } = await getUserFromAuth(event);
  if (!token || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: "NO_SESSION" }) };
  }

  const qs = event.queryStringParameters || {};
  const limit = Math.min(parseInt(qs.limit || "10", 10), 50);
  const offset = Math.max(parseInt(qs.offset || "0", 10), 0);

  const supa = getAdminClient();
  const { data, error } = await supa
    .from("results")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("resultsList error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "DB_QUERY_FAILED" }) };
  }
  return { statusCode: 200, body: JSON.stringify({ items: data || [] }) };
}

exports.handler = cors(handler);
