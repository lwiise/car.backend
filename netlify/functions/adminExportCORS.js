// netlify/functions/adminExportCORS.js
const { cors } = require("./cors");
const {
  getAdminClient,
  getUserFromAuth,
  parseJSON,
} = require("./_supabase");

const ADMIN_EMAILS = []; // tighten later

function toCSV(rows) {
  if (!rows || !rows.length) return "email,name,created_at,first_pick,top3\n";

  const esc = (val) => {
    if (val == null) return "";
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  const header = ["email", "name", "created_at", "first_pick", "top3"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        esc(r.email),
        esc(r.name),
        esc(r.created_at),
        esc(r.first_pick),
        esc(r.top3_summary),
      ].join(",")
    ),
  ];
  return lines.join("\n");
}

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

  // pull (for example) last 200 results
  const { data: resultsRows, error: resErr } = await supa
    .from("results")
    .select("id, created_at, top3, user_id, user_email")
    .order("created_at", { ascending: false })
    .limit(200);

  if (resErr) {
    console.error("adminExportCORS results error:", resErr);
    return {
      statusCode: 500,
      body: { error: "DB error loading results" },
    };
  }

  // join profiles for nicer name/email
  const userIds = [
    ...new Set(
      (resultsRows || [])
        .map((r) => r.user_id)
        .filter(Boolean)
    ),
  ];
  let profilesById = {};
  if (userIds.length) {
    const { data: profRows } = await supa
      .from("profiles")
      .select("user_id, email, name, nickname, full_name, user_name")
      .in("user_id", userIds);
    if (Array.isArray(profRows)) {
      for (const p of profRows) profilesById[p.user_id] = p;
    }
  }

  const flatRows = (resultsRows || []).map((row) => {
    const prof = profilesById[row.user_id] || {};
    const displayName =
      prof.name ||
      prof.nickname ||
      prof.full_name ||
      prof.user_name ||
      row.user_email ||
      prof.email ||
      "—";

    const emailVal = prof.email || row.user_email || "—";

    const firstPickObj = Array.isArray(row.top3)
      ? row.top3[0]
      : null;
    const firstPickText = firstPickObj
      ? `${firstPickObj.brand || ""} ${firstPickObj.model || ""}`.trim()
      : "";

    const topSummary = Array.isArray(row.top3)
      ? row.top3
          .slice(0, 3)
          .map(
            (c) =>
              `${c.brand || ""} ${c.model || ""}`.trim()
          )
          .filter(Boolean)
          .join(" / ")
      : "";

    return {
      email: emailVal,
      name: displayName,
      created_at: row.created_at,
      first_pick: firstPickText,
      top3_summary: topSummary,
    };
  });

  const csv = toCSV(flatRows);

  // return CSV. our cors() wrapper will merge headers,
  // but we override Content-Type + Content-Disposition here.
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="users.csv"',
    },
    body: csv,
  };
});
