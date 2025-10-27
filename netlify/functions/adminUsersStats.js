import cors from "./cors.js";
import { sbAdmin, json } from "./_supabase.js";

export const handler = cors(async (event) => {
  const supabase = sbAdmin();
  const lastDays = Number((event.queryStringParameters||{}).lastDays || 7);
  const since = new Date(Date.now() - lastDays*24*60*60*1000).toISOString();

  const [a,b,c] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", since),
    supabase.from("results").select("*", { count: "exact", head: true })
  ]);

  return json({ totalUsers: a.count || 0, newUsers: b.count || 0, totalResults: c.count || 0 });
});
