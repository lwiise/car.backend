
import { supabaseAdmin, getAccessToken } from "./_supabase.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  try {
    const token = getAccessToken(event);
    if (!token) return { statusCode: 401, body: "No token" };

    const { name, nickname, dob, gender, country, state, email } =
      JSON.parse(event.body || "{}");

    const supabase = supabaseAdmin(token);

    // Validate token → get auth user
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return { statusCode: 401, body: "Invalid token" };
    const uid = userData.user.id;

    // Upsert profile
    const { error: upErr } = await supabase
      .from("users")
      .upsert(
        { id: uid, email, name, nickname, dob, gender, country, state },
        { onConflict: "id" }
      );

    if (upErr) throw upErr;

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
}
