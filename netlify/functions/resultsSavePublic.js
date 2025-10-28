// netlify/functions/resultsSavePublic.js
const cors = require("./cors");
const { getAdminClient, getUserFromAuth, parseJSON } = require("./_supabase");

async function handler(event) {
  const { token, user } = await getUserFromAuth(event);
  if (!token || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: "NO_SESSION" }) };
  }

  const body = parseJSON(event.body);
  const answers = body?.answers || {};
  const top3 = Array.isArray(body?.top3) ? body.top3.slice(0,3) : [];

  if (!top3.length) {
    return { statusCode: 400, body: JSON.stringify({ error: "MISSING_TOP3" }) };
  }

  const supa = getAdminClient();
  const insert = {
    user_id: user.id,
    email: user.email || null,
    answers,
    top3,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supa.from("results").insert(insert).select("id").single();
  if (error) {
    console.error("results insert error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "DB_INSERT_FAILED" }) };
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true, id: data.id }) };
}

exports.handler = cors(handler);
