// netlify/functions/resultsSavePublic.js
const { withCors } = require("./cors");
const { getAdminClient } = require("./_supabase");

exports.handler = withCors(async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch {}

  const answers = body.answers || {};
  const top3 = Array.isArray(body.top3) ? body.top3 : [];
  const guest_id = (body.guest_id || "").trim() || null;

  if (!guest_id) {
    return { statusCode: 400, body: JSON.stringify({ error: "guest_id required" }) };
  }

  const sb = getAdminClient();
  const { error: insErr } = await sb
    .from("results")
    .insert([{ user_id: null, guest_id, answers, top3 }]);

  if (insErr) {
    console.error("[resultsSavePublic] insert error", insErr);
    return { statusCode: 500, body: JSON.stringify({ error: "DB", detail: insErr.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
});
