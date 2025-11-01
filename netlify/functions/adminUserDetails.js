// netlify/functions/adminUserDetails.js
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

  // request body
  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch {}
  const targetEmail = (body.email || "").trim().toLowerCase();

  if (!targetEmail) {
    return json(400, { error: "missing_email" });
  }

  // 1. find profile by email
  const { data: profRows, error: profErr } = await supabase
    .from("profiles")
    .select("*")
    .ilike("email", targetEmail) // case-insensitive
    .limit(1);

  if (profErr) {
    console.error("profile lookup err:", profErr);
    return json(500, { error: "db_error", detail: profErr.message });
  }

  const profile = profRows && profRows[0] ? profRows[0] : null;
  if (!profile) {
    // If somehow we have no profile, just return empty shell.
    return json(200, {
      profile: { email: targetEmail },
      meta: { type: "Guest", user_id: null, top3_count: 0 },
      picks: [],
      answers: {}
    });
  }

  // 2. get ALL results for this user_id, newest first
  const { data: resRows, error: resErr } = await supabase
    .from("results")
    .select("id, created_at, top3, answers, user_id")
    .eq("user_id", profile.user_id)
    .order("created_at", { ascending: false });

  if (resErr) {
    console.error("results lookup err:", resErr);
    return json(500, { error: "db_error", detail: resErr.message });
  }

  const latest = resRows && resRows[0] ? resRows[0] : null;

  const picks   = latest?.top3    || [];
  const answers = latest?.answers || {};
  const createdAt = latest?.created_at || profile.created_at || null;

  return json(200, {
    profile: {
      user_id: profile.user_id,
      email: profile.email,
      name: profile.name || "",
      nickname: profile.nickname || "",
      gender: profile.gender || "",
      dob: profile.dob || null,
      country: profile.country || "",
      state: profile.state || "",
      created_at: profile.created_at,
      updated_at: profile.updated_at
    },
    meta: {
      type: "User",
      user_id: profile.user_id,
      created_at: createdAt,
      top3_count: resRows ? resRows.length : 0
    },
    picks,
    answers
  });
});
