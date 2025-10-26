// netlify/functions/resultsSave.js
const { withCors } = require("./cors");
const { sbAdmin, parseBody, getUserFromToken } = require("./_supabase");

exports.handler = withCors(async (event) => {
  const supabase = sbAdmin();
  const user = await getUserFromToken(supabase, event);
  const { answers, top3 } = parseBody(event);

  const { error } = await supabase.from("results").insert({
    user_id: user.id,
    guest_id: null,
    answers: answers || {},
    top3: top3 || []
  });
  if (error) return { statusCode: 500, body: { error: error.message } };

  return { statusCode: 200, body: { ok: true } };
});
