import { supabaseAdmin, getAccessToken } from "./_supabase.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  try {
    const token = getAccessToken(event);
    if (!token) return { statusCode: 401, body: "No token" };

    const { answers, top3 } = JSON.parse(event.body || "{}");

    const supabase = supabaseAdmin(token);
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return { statusCode: 401, body: "Invalid token" };
    const uid = userData.user.id;

    const { error: insErr } = await supabase
      .from("quiz_results")
      .insert({ user_id: uid, answers_json: answers, top3_json: top3 });

    if (insErr) throw insErr;

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
}

