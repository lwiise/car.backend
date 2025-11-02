// netlify/functions/adminDetailsCORS.js
import {
  getAdminClient,
  parseBody,
  getRequester,
  ADMIN_EMAILS,
  jsonResponse,
  forbidden,
  handleOptions,
} from "./_supabaseAdmin.js";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return handleOptions();
  }

  const { user } = await getRequester(event);
  const adminEmail = (user?.email || "").toLowerCase();
  if (!user || !ADMIN_EMAILS.map(e => e.toLowerCase()).includes(adminEmail)) {
    return forbidden();
  }

  const { email = "", type = "user" } = parseBody(event.body || "{}");

  const supa = getAdminClient();

  // 1. pull profile by email
  const { data: prof, error: profErr } = await supa
    .from("profiles")
    .select(
      "id,email,name,nickname,dob,gender,country,state,updated_at"
    )
    .eq("email", email)
    .maybeSingle();

  if (profErr) {
    console.warn("profile fetch err:", profErr);
  }

  // default safe placeholders
  let latestResult = null;
  let authUserRow  = null;

  if (prof && prof.id) {
    // 2. latest quiz attempt for this user
    const { data: resRow, error: resErr } = await supa
      .from("results")
      .select("id,user_id,created_at,answers,top3")
      .eq("user_id", prof.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (resErr) {
      console.warn("results fetch err:", resErr);
    } else {
      latestResult = resRow || null;
    }

    // 3. basic auth.users info (created_at)
    const { data: authRow, error: authErr } = await supa
      .from("auth.users")
      .select("id,email,created_at")
      .eq("id", prof.id)
      .maybeSingle();

    if (authErr) {
      console.warn("auth.users fetch err:", authErr);
    } else {
      authUserRow = authRow || null;
    }
  }

  // build "picks" array from latestResult.top3
  let picks = [];
  if (latestResult && Array.isArray(latestResult.top3)) {
    picks = latestResult.top3.map((p) => ({
      brand: p.brand || "",
      model: p.model || "",
      reason: p.reason || "",
    }));
  }

  // quiz answers
  const answers = latestResult?.answers || {};

  // profile block for the modal
  const profileOut = {
    email:     prof?.email || email || "—",
    name:      prof?.name || "—",
    nickname:  prof?.nickname || "—",
    gender:    prof?.gender || "—",
    dob:       prof?.dob || null,
    country:   prof?.country || "—",
    state:     prof?.state || "—",
    created_at: authUserRow?.created_at || latestResult?.created_at || null,
    updated_at: prof?.updated_at || null,
  };

  // meta block
  const metaOut = {
    type:        prof ? "User" : (type === "guest" ? "Guest" : "User"),
    top3_count:  Array.isArray(picks) ? picks.length : 0,
    user_id:     prof?.id || null,
    created_at:  latestResult?.created_at || authUserRow?.created_at || null,
  };

  return jsonResponse(200, {
    profile: profileOut,
    meta: metaOut,
    picks,
    answers,
  });
};
