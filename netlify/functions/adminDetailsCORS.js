// netlify/functions/adminDetailsCORS.js
const { cors } = require("./cors");
const {
  getAdminClient,
  parseJSON,
  getUserFromAuth,
} = require("./_supabase");

const ADMIN_EMAILS = []; // lock down later if you want

module.exports = cors(async (event) => {
  // auth
  const { user } = await getUserFromAuth(event);
  if (!user) {
    return {
      statusCode: 401,
      body: { error: "Unauthorized (no token)" },
    };
  }
  if (ADMIN_EMAILS.length && !ADMIN_EMAILS.includes(user.email)) {
    return {
      statusCode: 403,
      body: { error: "Forbidden (not admin)" },
    };
  }

  const supa = getAdminClient();
  const body = parseJSON(event.body || "{}");
  const email = (body.email || "").trim().toLowerCase();

  if (!email) {
    return {
      statusCode: 400,
      body: { error: "email required" },
    };
  }

  // 1) Find profile by email
  const { data: profRows, error: profErr } = await supa
    .from("profiles")
    .select(
      "user_id, email, name, nickname, full_name, gender, dob, country, state, created_at, updated_at, is_guest"
    )
    .eq("email", email)
    .limit(1);

  if (profErr) {
    console.error("adminDetailsCORS profile error:", profErr);
    return {
      statusCode: 500,
      body: { error: "DB error loading profile" },
    };
  }
  const profile = profRows && profRows[0];
  if (!profile) {
    return {
      statusCode: 404,
      body: { error: "Profile not found" },
    };
  }

  // 2) Grab user's most recent result
  const { data: resRows, error: resErr } = await supa
    .from("results")
    .select("id, created_at, top3, answers")
    .eq("user_id", profile.user_id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (resErr) {
    console.error("adminDetailsCORS results error:", resErr);
    return {
      statusCode: 500,
      body: { error: "DB error loading results" },
    };
  }

  const latestResult = resRows && resRows[0];
  const picks = latestResult?.top3 || [];
  const answers = latestResult?.answers || {};

  const meta = {
    type: profile.is_guest ? "Guest" : "User",
    user_id: profile.user_id || null,
    created_at: latestResult?.created_at || profile.created_at || null,
    top3_count: Array.isArray(picks) ? picks.length : 0,
  };

  return {
    statusCode: 200,
    body: {
      profile,
      meta,
      picks,
      answers,
    },
  };
});
