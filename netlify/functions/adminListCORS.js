// netlify/functions/adminListCORS.js
import {
  getAdminClient,
  parseJSON,
  requireAdmin,
  jsonResponse,
  preflightResponse
} from "./_supabaseAdmin.js";

export const handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse();
  }

  // admin gate
  const auth = await requireAdmin(event);
  if (!auth.ok) {
    return jsonResponse(auth.statusCode, auth.payload);
  }

  // read filters from frontend
  const body = parseJSON(event.body);
  const page      = Number(body.page)      || 1;
  const pageSize  = Number(body.pageSize)  || 20;
  const searchRaw = (body.search || "").trim().toLowerCase();
  const type      = (body.type || "user").toLowerCase(); // "user" | "guest" | "all"

  const supa = getAdminClient();

  // ---------- BRANCH 1: GUESTS ----------
  if (type === "guest") {
    // pull recent guest_results
    const { data: gRows, error: gErr } = await supa
      .from("guest_results")
      .select("id, created_at, top3, answers")
      .order("created_at", { ascending: false })
      .limit(5000);

    if (gErr) {
      console.error("guest_results query error", gErr);
      return jsonResponse(500, {
        error: "db_list_failed",
        detail: gErr.message || String(gErr)
      });
    }

    // map them into same table shape the dashboard expects
    // (user, email, date, #1 PICK, TOP-3, DETAILS button)
    // we'll fake "email" as "guest-<id>" so the Details modal can request it
    let guests = (gRows || []).map(r => {
      const top3 = Array.isArray(r.top3) ? r.top3 : [];

      // first pick
      const first = top3[0] || {};
      const first_pick = [first.brand || "", first.model || ""]
        .join(" ")
        .trim() || "—";

      // compressed summary
      const top_summary =
        top3
          .slice(0, 3)
          .map(car =>
            `${car.brand || ""} ${car.model || ""}`.trim()
          )
          .filter(Boolean)
          .join(" • ") || "—";

      return {
        id: `guest-${r.id}`,          // we’ll use this in Details
        email: `guest-${r.id}`,       // shows up in the table
        name: "Guest",
        created_at: r.created_at,
        first_pick,
        top_summary,
        top3,
        type: "Guest"
      };
    });

    // search filter (first_pick, top_summary, etc.)
    if (searchRaw) {
      guests = guests.filter(it => {
        const haystack = [
          it.email || "",
          it.name || "",
          it.first_pick || "",
          it.top_summary || "",
          JSON.stringify(it.top3 || [])
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(searchRaw);
      });
    }

    // sort newest first
    guests.sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    // pagination
    const offset   = (page - 1) * pageSize;
    const slice    = guests.slice(offset, offset + pageSize);
    const hasMore  = offset + pageSize < guests.length;

    return jsonResponse(200, {
      items: slice,
      hasMore
    });
  }

  // ---------- BRANCH 2: USERS (default / "all") ----------
  // Strategy:
  // - pull latest result per user_id from results
  // - join with profiles
  const { data: resRows, error: resErr } = await supa
    .from("results")
    .select("user_id, created_at, top3, answers")
    .not("user_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (resErr) {
    console.error("results query error", resErr);
    return jsonResponse(500, {
      error: "db_list_failed",
      detail: resErr.message || String(resErr)
    });
  }

  // dedupe each user by newest
  const latestMap = {};
  for (const row of resRows || []) {
    if (!row.user_id) continue;
    if (!latestMap[row.user_id]) {
      latestMap[row.user_id] = row;
    }
  }

  let latestArr = Object.entries(latestMap).map(([user_id, r]) => ({
    user_id,
    created_at: r.created_at,
    top3: Array.isArray(r.top3) ? r.top3 : [],
    answers: r.answers || {}
  }));

  const allIds = latestArr.map(r => r.user_id);
  let profMap = {};
  if (allIds.length) {
    const { data: profRows, error: profErr } = await supa
      .from("profiles")
      .select("id,email,name,nickname,updated_at,country,state,gender,dob")
      .in("id", allIds);

    if (profErr) {
      console.error("profiles query error", profErr);
      return jsonResponse(500, {
        error: "db_list_failed",
        detail: profErr.message || String(profErr)
      });
    }
    for (const p of profRows || []) {
      profMap[p.id] = p;
    }
  }

  latestArr = latestArr.map(r => {
    const prof = profMap[r.user_id] || {};
    const top3 = r.top3 || [];

    const first = top3[0] || {};
    const first_pick = [first.brand || "", first.model || ""]
      .join(" ")
      .trim() || "—";

    const top_summary =
      top3
        .slice(0, 3)
        .map(car =>
          `${car.brand || ""} ${car.model || ""}`.trim()
        )
        .filter(Boolean)
        .join(" • ") || "—";

    return {
      id: r.user_id,
      email: prof.email || null,
      name: prof.name || prof.nickname || null,
      created_at: r.created_at,
      first_pick,
      top_summary,
      top3,
      type: "User"
    };
  });

  // search
  let filtered = latestArr;
  if (searchRaw) {
    filtered = latestArr.filter(it => {
      const haystack = [
        it.email || "",
        it.name || "",
        it.first_pick || "",
        it.top_summary || "",
        JSON.stringify(it.top3 || [])
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(searchRaw);
    });
  }

  // newest first
  filtered.sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );

  const offset  = (page - 1) * pageSize;
  const slice   = filtered.slice(offset, offset + pageSize);
  const hasMore = offset + pageSize < filtered.length;

  return jsonResponse(200, {
    items: slice,
    hasMore
  });
};
