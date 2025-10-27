import cors from "./cors.js";
import { sbAdmin, json, parseBody, getUserFromToken } from "./_supabase.js";

export const handler = cors(async (event) => {
  const token = (event.headers?.authorization || event.headers?.Authorization || "").replace(/^Bearer\s+/i, "");
  const user = await getUserFromToken(token);
  if (!user) return json({ error: "UNAUTHORIZED" }, 401);

  const supabase = sbAdmin();
  const { answers, top3 } = parseBody(event);
  const { error } = await supabase.from("results").insert({
    user_id: user.id,
    guest_id: null,
    answers: answers || {},
    top3: top3 || []
  });

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
});
