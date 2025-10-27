import cors from "./cors.js";
import { sbAdmin, json, parseBody } from "./_supabase.js";
import { randomUUID } from "node:crypto";

export const handler = cors(async (event) => {
  const supabase = sbAdmin();
  const { answers, top3, guest_id } = parseBody(event);
  const gid = guest_id || randomUUID();

  const { error } = await supabase.from("results").insert({
    user_id: null,
    guest_id: gid,
    answers: answers || {},
    top3: top3 || []
  });

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, guest_id: gid });
});
