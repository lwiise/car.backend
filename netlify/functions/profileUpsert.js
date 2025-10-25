// netlify/functions/profileUpsert.js
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

  const { email, name, nickname, dob, gender, country, state } = body || {};
  if (!email) return { statusCode: 400, body: JSON.stringify({ error: "email required" }) };

  const token = auth.replace(/^Bearer\s+/i, "");
  const sb = getAdminClient();
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user?.id) {
    return { statusCode: 401, body: JSON.stringify({ error: "INVALID_SESSION" }) };
  }
  const userId = userData.user.id;

  const { error: upErr } = await sb
    .from("profiles")
    .upsert({
      id: userId,
      email,
      name: name || null,
      nickname: nickname || null,
      dob: dob || null,
      gender: gender || null,
      country: country || null,
      state: state || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

  if (upErr) {
    console.error("[profileUpsert] upsert error", upErr);
    return { statusCode: 500, body: JSON.stringify({ error: "DB", detail: upErr.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
});
