// netlify/functions/adminListCORS.js
const { cors } = require("./cors");
const {
  getAdminClient,
  parseJSON,
  getUserFromAuth,
} = require("./_supabase");

// OPTIONAL: lock access to specific admin emails
// leave empty to allow any logged-in user for now
const ADMIN_EMAILS = []; // e.g. ["louisanaskaroti@gmail.com"]

module.exports = cors(async (event) => {
  // --- auth check ---
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
  const body = parseJSON(event.body);

  const page = Number(body.page || 1);
  const pageSize = Number(body.pageSize || 20);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // We ignore search/type filters for now just to get you unblocked.
  // You can add them later (ilike, etc).
  const { data: resultsRows, error: resErr } = await supa
    .from("results")
    .select("id, created_at, top3, answers, user_id, user_email")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (resErr) {
    console.error("adminListCORS results error:", resErr);
    return {
      statusCode: 500,
      body: { error: "DB error loading results" },
    };
  }

  // collect unique user_ids to join profiles
  const userIds = [
    ...new Set(
      (resultsRows || [])
        .map((r) => r.user_id)
        .filter((id) => !!id)
    ),
  ];

  let profilesById = {};
  if (userIds.length) {
    const { data: profRows, error: profErr } = await supa
      .from("profiles")
      .select(
        "user_id, email, name, nickname, full_name, user_name, is_guest, created_at"
      )
      .in("user_id", userIds);

    if (!profErr && Array.isArray(profRows)) {
      for (const p of profRows) {
        profilesById[p.user_id] = p;
      }
    } else if (profErr) {
      console.warn("adminListCORS profiles join error:", profErr);
    }
  }

  // shape rows for frontend
  const items = (resultsRows || []).map((row) => {
    const prof = profilesById[row.user_id] || {};

    // figure out display name
    const displayName =
      prof.name ||
      prof.nickname ||
      prof.full_name ||
      prof.user_name ||
      row.user_email ||
      prof.email ||
      "—";

    // main email
    const emailVal =
      prof.email || row.user_email || "—";

    const firstPickObj = Array.isArray(row.top3)
      ? row.top3[0]
      : null;

    const firstPickText = firstPickObj
      ? `${firstPickObj.brand || ""} ${firstPickObj.model || ""}`.trim()
      : "—";

    const topSummary = Array.isArray(row.top3)
      ? row.top3
          .slice(0, 3)
          .map(
            (c) =>
              `${c.brand || ""} ${c.model || ""}`.trim()
          )
          .filter(Boolean)
          .join(" • ")
      : "—";

    return {
      id: row.id,
      created_at: row.created_at,
      email: emailVal,
      name: displayName,
      top3: row.top3 || [],
      first_pick: firstPickText,
      top_summary: topSummary,
      type: prof.is_guest ? "Guest" : "User",
    };
  });

  return {
    statusCode: 200,
    body: {
      items,
      hasMore: (resultsRows || []).length === pageSize,
    },
  };
});
