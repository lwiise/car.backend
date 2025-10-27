import cors from "./cors.js";
import { sbAdmin, json } from "./_supabase.js";

export const handler = cors(async (event) => {
  const supabase = sbAdmin();
  const { data, error } = await supabase
    .from("results")
    .select("id, created_at, user_id, guest_id, top3")
    .order("created_at", { ascending: false })
    .limit(3);
  if (error) return json({ error: error.message }, 500);
  return json({ rows: data || [] });
});
