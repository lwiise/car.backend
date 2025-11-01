// netlify/functions/adminDetailsCORS.js
import cors, { json } from "./cors.js";
import {
  getAdminClient,
  parseJSON,
  getUserFromAuth,
} from "./_supabase.js";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "kkk1@gmail.com")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export default cors(async function handler(event) {
  // 1. auth
  const { user } = await getUserFromAuth(event);
  const emailLower = user?.email?.toLowerCase() || "";
  if (!user || !ADMIN_EMAILS.includes(emailLower)) {
    return json(401, { error: "unauthorized" });
  }

  // 2. body from frontend
  const body = parseJSON(event.body);
  const email = (body.email || "").trim();

  // If it's a pure anonymous guest w/ no stored email,
  // we can't really load profile details.
  if (!email || email === "—") {
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

  // 3. the most recent few quiz results for this email
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
    console.error(
      "adminDetailsCORS quiz_results error:",
      resErr
    );
    return json(500, {
      error: "db_error",
      detail: String(resErr.message || resErr),
    });
  }

  const mostRecent = resultsData?.[0] || null;
  const isSignedUp = resultsData?.some((r) => !r.is_guest);

  // picks block (top3 of most recent attempt)
  const picks = Array.isArray(mostRecent?.top3)
    ? mostRecent.top3.slice(0, 3).map((p) => ({
        brand: p.brand || "",
        model: p.model || "",
        reason: p.reason || "",
      }))
    : [];

  // answers from most recent attempt
  const answers = mostRecent?.answers || {};

  // 4. try to load full profile details from `profiles` table (optional)
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
      .maybeSingle(); // supabase-js v2 supports maybeSingle()

    if (!profErr) {
      profileRow = profData || null;
    } else {
      console.warn(
        "profiles lookup error:",
        profErr.message || profErr
      );
    }
  } catch (err) {
    // If there's no "profiles" table or the call fails, we just skip it.
    console.warn(
      "profiles table not found / cannot fetch:",
      err
    );
  }

  // final "profile" object we will send to the frontend
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
    user_id:
      mostRecent?.user_id ||
      mostRecent?.id ||
      null,
  };

  // meta block for the "Metadata" section in modal
  const metaObj = {
    type: isSignedUp ? "User" : "Guest",
    top3_count: picks.length || 0,
    user_id:
      profileObj.user_id ||
      profileObj.id ||
      mostRecent?.user_id ||
      "—",
    created_at: mostRecent?.created_at || null,
  };

  return json(200, {
    profile: profileObj,
    meta: metaObj,
    picks,
    answers,
  });
});
