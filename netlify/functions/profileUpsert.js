import cors from "./cors.js";
import { sbAdmin, json, parseBody, getUserFromToken } from "./_supabase.js";

export const handler = cors(async (event) => {
  const token = (event.headers?.authorization || event.headers?.Authorization || "").replace(/^Bearer\s+/i, "");
  const user = await getUserFromToken(token);
  if (!user) return json({ error: "UNAUTHORIZED" }, 401);

  const supabase = sbAdmin();
  const { email, name, nickname, dob, gender, country, state } = parseBody(event);

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    email: email || user.email,
    name: name || null,
    nickname: nickname || null,
    dob: dob || null,
    gender: gender || null,
    country: country || null,
    state: state || null
  }, { onConflict: "id" });

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
});
