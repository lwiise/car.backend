import { supabaseAdmin, getAccessToken } from "./_supabase.js";

const CORS_ORIGIN = "https://YOUR-WEBFLOW-ORIGIN";
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Methods": "OPTIONS, POST",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "{}" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const token = getAccessToken(event);
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: "No token" }) };

    const { answers, top3 } = JSON.parse(event.body || "{}");

    const supabase = supabaseAdmin(token);
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: "Invalid token" }) };
    }
    const uid = userData.user.id;

    const { error: insErr } = await supabase
      .from("quiz_results")
      .insert({ user_id: uid, answers_json: answers, top3_json: top3 });

    if (insErr) throw insErr;

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(e) }) };
  }
}
