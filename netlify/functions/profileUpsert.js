// netlify/functions/profileUpsert.js
const { withCors } = require("./cors");
const { sbAdmin, parseBody, getUserFromToken } = require("./_supabase");

exports.handler = withCors(async (event) => {
  const supabase = sbAdmin();
  const user = await getUserFromToken(supabase, event);
  const { email, name, nickname, dob, gender, country, state } = parseBody(event);

  const payload = {
    id: user.id,
    email: email || user.email,
    name: name || null,
    nickname: nickname || null,
    dob: dob || null,
    gender: gender || null,
    country: country || null,
    state: state || null,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
  if (error) return { statusCode: 500, body: { error: error.message } };

  return { statusCode: 200, body: { ok: true } };
});
