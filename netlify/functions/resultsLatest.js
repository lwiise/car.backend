import { supabaseAdmin, getAccessToken } from "./_supabase.js";

export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  try {
    const token = getAccessToken(event);
    if (!token) return { statusCode: 401, body: "No token" };

    const supabase = supabaseAdmin(token);
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return { statusCode: 401, body: "Invalid token" };
    const uid = userData.user.id;

    const { data, error } = await supabase
      .from("quiz_results")
      .select("top3_json, answers_json, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return { statusCode: 200, body: JSON.stringify(data || null) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
}

