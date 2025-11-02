// netlify/functions/adminDetailsCORS.js
import {
  getAdminClient,
  parseJSON,
  requireAdmin,
  jsonResponse,
  preflightResponse
} from "./_supabaseAdmin.js";

function parseGuestId(str) {
  // "guest-42" -> 42
  const m = /^guest-(\d+)$/.exec(str || "");
  return m ? Number(m[1]) : null;
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse();
  }

  const auth = await requireAdmin(event);
  if (!auth.ok) {
    return jsonResponse(auth.statusCode, auth.payload);
  }

  const body  = parseJSON(event.body);
  const email = (body.email || "").trim();
  const type  = (body.type || "user").toLowerCase();

  if (!email) {
    return jsonResponse(400, {
      error: "bad_request",
      detail: "email required"
    });
  }

  const supa = getAdminClient();

  // ---------- GUEST branch ----------
  if (type === "guest") {
    // frontend will send email like "guest-123"
    const guestId = parseGuestId(email);
    if (!guestId) {
      return jsonResponse(400, {
        error: "bad_request",
        detail: "invalid guest id"
      });
    }

    const { data: gRow, error: gErr } = await supa
      .from("guest_results")
      .select("id,created_at,top3,answers")
      .eq("id", guestId)
      .single();

    if (gErr) {
      console.error("guest_details error", gErr);
      return jsonResponse(500, {
        error: "db_detail_failed",
        detail: gErr.message || String(gErr)
      });
    }

    const profile = {
      user_id: `guest-${gRow.id}`,
      email:   `guest-${gRow.id}`,
      name:    "Guest",
      nickname:"",
      gender:  "",
      dob:     null,
      country: "",
      state:   "",
      created_at: gRow.created_at,
      updated_at: gRow.created_at
    };

    const meta = {
      type: "Guest",
      user_id: `guest-${gRow.id}`,
      top3_count: Array.isArray(gRow.top3) ? gRow.top3.length : 0,
      results_count: 1
    };

    return jsonResponse(200, {
      profile,
      meta,
      picks: Array.isArray(gRow.top3) ? gRow.top3 : [],
      answers: gRow.answers || {}
    });
  }

  // ---------- USER branch ----------
  // find profile by email
  const { data: prof, error: profErr } = await supa
    .from("profiles")
    .select(
      "id,email,name,nickname,dob,gender,country,state,updated_at"
    )
    .eq("email", email)
    .maybeSingle();

  if (profErr) {
    console.error("profile fetch error", profErr);
    return jsonResponse(500, {
      error: "db_detail_failed",
      detail: profErr.message || String(profErr)
    });
  }

  if (!prof) {
    return jsonResponse(404, {
      error: "not_found",
      detail: "profile not found"
    });
  }

  // latest result for this user
  const { data: latestResArr, error: resErr } = await supa
    .from("results")
    .select("id,created_at,top3,answers")
    .eq("user_id", prof.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (resErr) {
    console.error("latest result error", resErr);
    return jsonResponse(500, {
      error: "db_detail_failed",
      detail: resErr.message || String(resErr)
    });
  }

  const latestRes = latestResArr?.[0] || null;

  // how many total results
  const { count: resCount, error: cntErr } = await supa
    .from("results")
    .select("id", { count: "exact", head: true })
    .eq("user_id", prof.id);

  if (cntErr) {
    console.error("results count error", cntErr);
  }

  const profileOut = {
    user_id: prof.id,
    email: prof.email || "",
    name: prof.name || "",
    nickname: prof.nickname || "",
    gender: prof.gender || "",
    dob: prof.dob || null,
    country: prof.country || "",
    state: prof.state || "",
    created_at: latestRes ? latestRes.created_at : null,
    updated_at: prof.updated_at || null
  };

  const meta = {
    type: "User",
    user_id: prof.id,
    top3_count: Array.isArray(latestRes?.top3)
      ? latestRes.top3.length
      : 0,
    results_count:
      typeof resCount === "number" ? resCount : null
  };

  return jsonResponse(200, {
    profile: profileOut,
    meta,
    picks: Array.isArray(latestRes?.top3) ? latestRes.top3 : [],
    answers: latestRes?.answers || {}
  });
};
