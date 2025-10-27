import cors from "./cors.js";
import { sbAdmin, json } from "./_supabase.js";

export const handler = cors(async (event) => {
  const supabase = sbAdmin();
  const { page = 1, pageSize = 20 } = event.queryStringParameters || {};
  const from = (Number(page)-1) * Number(pageSize);
  const to = from + Number(pageSize) - 1;

  const { data: resRows, error } = await supabase
    .from("results")
    .select("id, created_at, user_id, guest_id, top3, answers")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) return json({ error: error.message }, 500);
  return json({ rows: resRows || [] });
});
