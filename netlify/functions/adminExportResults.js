import cors from "./cors.js";
import { sbAdmin } from "./_supabase.js";

export const handler = cors(async () => {
  const supabase = sbAdmin();
  const { data, error } = await supabase
    .from("results")
    .select("created_at, user_id, guest_id, top3, answers")
    .order("created_at", { ascending: false });

  if (error) return { statusCode: 500, body: { error: error.message } };

  const rows = data || [];
  const head = ["created_at","user_id","guest_id","top3_json","answers_json"];
  const csv = [head.join(",")].concat(rows.map(r => {
    const top3 = JSON.stringify(r.top3 || []);
    const ans = JSON.stringify(r.answers || {});
    return [r.created_at, r.user_id||"", r.guest_id||"", JSON.stringify(top3), JSON.stringify(ans)].join(",");
  })).join("\n");

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="results.csv"'
    },
    body: csv
  };
});
