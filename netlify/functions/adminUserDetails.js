import cors from "./cors.js";
import { sbAdmin, json } from "./_supabase.js";

export const handler = cors(async (event) => {
  const supabase = sbAdmin();
  const { user_id, email } = event.queryStringParameters || {};

  let profile = null;
  if (user_id) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user_id).single();
    profile = data || null;
  } else if (email) {
    const { data } = await supabase.from("profiles").select("*").eq("email", email).single();
    profile = data || null;
  }

  const { data: results } = await supabase
    .from("results")
    .select("id, created_at, top3, answers")
    .eq("user_id", profile?.id || "__none__")
    .order("created_at", { ascending: false })
    .limit(5);

  return json({ profile, results: results || [] });
});
