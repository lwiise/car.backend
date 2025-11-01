// netlify/functions/adminDetailsCORS.js
import cors, { json } from "./cors.js";
import supaHelpers from "./_supabase.js";
const { getAdminClient, parseJSON, getUserFromAuth } = supaHelpers;

const ADMIN_EMAILS = ["kkk1@gmail.com"];

export default cors(async function handler(event) {
  // 1. auth
  const { user } = await getUserFromAuth(event);
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    return json(401, { error: "unauthorized" });
  }

  // 2. body
  const body = parseJSON(event.body);
  // frontend sends { email, type }
  const email = (body.email || "").trim();
  // const dtype = body.type || "user"; // could be useful if you ever want to branch

  if (!email || email === "—") {
    // Guest with literally no email saved -> we can't look them up.
    return json(200, {
      profile: {
        email: "—",
      },
      meta: {
        type: "Guest",
        user_id: "—",
        top3_count: 0,
      },
      picks: [],
      answers: {},
    });
  }

  const supa = getAdminClient();

  // 3. get the most recent quiz result(s) for this email
  const { data: resultsData, error: resErr } = await supa
    .from("quiz_results")
    .select(`
      id,
      created_at,
      updated_at,
      email,
      name,
      nickname,
      full_name,
      user_name,
      user_id,
      is_guest,
      country,
      state,
      gender,
      dob,
      top3,
      answers
    `)
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(5);

  if (resErr) {
    console.error("adminDetailsCORS quiz_results error:", resErr);
    return json(500, { error: "db_error", detail: String(resErr.message || resErr) });
  }

  const mostRecent = resultsData?.[0] || null;
  const isSignedUp = resultsData?.some(r => !r.is_guest);

  // build picks array for UI (use most recent result's top3)
  const picks = Array.isArray(mostRecent?.top3)
    ? mostRecent.top3.slice(0, 3).map(p => ({
        brand: p.brand || "",
        model: p.model || "",
        reason: p.reason || "",
      }))
    : [];

  // answers from the most recent quiz attempt
  const answers = mostRecent?.answers || {};

  // 4. try to load profile row (if you have "profiles" table)
  //    If you don't have this table, you can delete this whole section and
  //    just build `profileObj` from mostRecent.
  let profileRow = null;
  try {
    const { data: profData, error: profErr } = await supa
      .from("profiles")
      .select(`
        id,
        email,
        name,
        nickname,
        full_name,
        user_name,
        gender,
        dob,
        country,
        state,
        created_at,
        updated_at
      `)
      .eq("email", email)
      .limit(1)
      .maybeSingle(); // Netlify env might not support .single(), so we'll safe-check below

    if (!profErr) {
      profileRow = profData || null;
    } else {
      console.warn("profiles lookup error:", profErr.message || profErr);
    }
  } catch (err) {
    // swallow profile lookup issues so Details still works
    console.warn("profiles table not found / error:", err);
  }

  // final profile object for frontend
  const profileObj = profileRow || {
    email: mostRecent?.email || email,
    name:
      mostRecent?.name ||
      mostRecent?.nickname ||
      mostRecent?.full_name ||
      mostRecent?.user_name ||
      mostRecent?.email ||
      "—",
    nickname: mostRecent?.nickname || "—",
    gender: mostRecent?.gender || "—",
    dob: mostRecent?.dob || null,
    country: mostRecent?.country || "—",
    state: mostRecent?.state || "—",
    created_at: mostRecent?.created_at || null,
    updated_at: mostRecent?.updated_at || null,
    user_id: mostRecent?.user_id || mostRecent?.id || null,
  };

  // meta block for the UI "Metadata" card
  const metaObj = {
    type: isSignedUp ? "User" : "Guest",
    top3_count: picks.length || 0,
    user_id: profileObj.user_id || profileObj.id || mostRecent?.user_id || "—",
    created_at: mostRecent?.created_at || null,
  };

  return json(200, {
    profile: profileObj,
    meta: metaObj,
    picks,
    answers,
  });
});
