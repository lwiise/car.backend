// netlify/functions/resultsSavePublic.js
const { withCors } = require("./cors");
const { sbAdmin, parseBody } = require("./_supabase");
const { randomUUID } = require("crypto");

exports.handler = withCors(async (event) => {
  const supabase = sbAdmin();
  const { answers, top3, guest_id } = parseBody(event);
  const gid = guest_id || randomUUID();

  const { error } = await supabase.from("results").insert({
    user_id: null,
    guest_id: gid,
    answers: answers || {},
    top3: top3 || []
  });
  if (error) return { statusCode: 500, body: { error: error.message } };

  return { statusCode: 200, body: { ok: true, guest_id: gid } };
});
