import { supabaseAdmin, getAccessToken } from "./_supabase.js";

const CORS_ORIGIN = "https://YOUR-WEBFLOW-ORIGIN";
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Methods": "OPTIONS, GET",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "{}" };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const token = getAccessToken(event);
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: "No token" }) };

    const supabase = supabaseAdmin(token);
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: "Invalid token" }) };
    }
    const uid = userData.user.id;

    const { data, error } = await supabase
      .from("quiz_results")
      .select("top3_json, answers_json, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return { statusCode: 200, headers, body: JSON.stringify(data || null) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(e) }) };
  }
}
