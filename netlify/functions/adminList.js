// netlify/functions/adminList.js
import cors, { json } from "./cors.js";
import { sbAdmin } from "./_supabase.js";

// --- paste helper from above here ---
const ALLOWED_ADMINS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

async function requireAdmin(supabase, event) {
  const authHeader = event.headers?.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok:false, statusCode:401, error:"Missing bearer token" };

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { ok:false, statusCode:401, error:"Unauthorized" };

  const email = (data.user.email || "").toLowerCase();
  if (ALLOWED_ADMINS.length && !ALLOWED_ADMINS.includes(email)) {
    return { ok:false, statusCode:403, error:"Forbidden" };
  }

  return { ok:true, user:data.user };
}
// --- end helper ---

export const handler = cors(async (event) => {
  const supabase = sbAdmin();

  // auth
  const auth = await requireAdmin(supabase, event);
  if (!auth.ok) {
    return json(auth.statusCode, { error: auth.error });
  }

  // read request body
  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch {}
  const page        = Number(body.page || 1);
  const pageSize    = Number(body.pageSize || 20);
  // we ignore search/type/resultsOnly for now to keep it simple/robust
  const from        = (page - 1) * pageSize;
  const to          = from + pageSize - 1;

  // Pull recent quiz results, newest first, joined with profile
  // NOTE: This assumes you set up FK: results.user_id -> profiles.user_id
  const { data, error } = await supabase
    .from("results")
    .select(`
      id,
      created_at,
      top3,
      answers,
      user_id,
      profile:profiles (
        user_id,
        email,
        name,
        nickname,
        country,
        state,
        created_at
      )
    `)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("adminList select error:", error);
    return json(500, { error: "db_error", detail: error.message });
  }

  // Map DB rows -> shape the dashboard expects
  const rows = (data || []).map(r => {
    const p = r.profile || {};
    return {
      id: r.id,
      created_at: r.created_at,
      top3: r.top3 || [],
      answers: r.answers || {},
      email: p.email || "",
      name: p.name || p.nickname || p.email || "",
      nickname: p.nickname || "",
      type: r.user_id ? "User" : "Guest"
    };
  });

  return json(200, rows);
});
