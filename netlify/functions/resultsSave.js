// netlify/functions/resultsSave.js
const { withCors } = require("./cors");
const { getAdminClient } = require("./_supabase");

exports.handler = withCors(async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const auth = event.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return { statusCode: 401, body: JSON.stringify({ error: "UNAUTHORIZED" }) };
  }

  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch {}

  const answers = body.answers || {};
  const top3 = Array.isArray(body.top3) ? body.top3 : [];

  // Validate JWT and get user id via Supabase RPC (service role can decode)
  const sb = getAdminClient();

  // Use auth.getUser for token (works with service role client)
  const token = auth.replace(/^Bearer\s+/i, "");
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    return { statusCode: 401, body: JSON.stringify({ error: "INVALID_SESSION" }) };
  }
  const userId = userData.user.id;

  const { error: insErr } = await sb
    .from("results")
    .insert([{ user_id: userId, answers, top3 }]);

  if (insErr) {
    console.error("[resultsSave] insert error", insErr);
    return { statusCode: 500, body: JSON.stringify({ error: "DB", detail: insErr.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
});
