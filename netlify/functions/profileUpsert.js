import { supabaseAdmin, getAccessToken } from "./_supabase.js";

const CORS_ORIGIN = "https://YOUR-WEBFLOW-ORIGIN"; // e.g. https://your-site.webflow.io
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": CORS_ORIGIN,      // 👈 set this to your Webflow origin (or "*" to test)
  "Access-Control-Allow-Methods": "OPTIONS, POST",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

export async function handler(event) {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "{}" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const token = getAccessToken(event);
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: "No token" }) };

    const { name, nickname, dob, gender, country, state, email } =
      JSON.parse(event.body || "{}");

    const supabase = supabaseAdmin(token);

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: "Invalid token" }) };
    }
    const uid = userData.user.id;

    const { error: upErr } = await supabase
      .from("users")
      .upsert({ id: uid, email, name, nickname, dob, gender, country, state }, { onConflict: "id" });

    if (upErr) throw upErr;

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(e) }) };
  }
}
