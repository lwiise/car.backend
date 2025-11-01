// netlify/functions/adminExportCORS.js
import cors, { json } from "./cors.js";
import {
  getAdminClient,
  getUserFromAuth,
  parseJSON,
  ADMIN_EMAILS
} from "./_supabaseAdmin.js";

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v).replace(/"/g, '""');
  if (s.search(/("|,|\n)/) >= 0) return `"${s}"`;
  return s;
}

export const handler = cors(async function (event, context) {
  const { user } = await getUserFromAuth(event);
  if (!user) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "text/plain" },
      body: "unauthorized"
    };
  }
  if (!ADMIN_EMAILS.includes(user.email)) {
    return {
      statusCode: 403,
      headers: { "Content-Type": "text/plain" },
      body: "forbidden"
    };
  }

  const body = parseJSON(event.body);
  const type = body.type || null;
  const search = (body.search || "").toLowerCase().trim();

  // we'll just dump the most recent ~200 rows
  const pageSize = 200;

  const supa = getAdminClient();

  let query = supa
    .from("results")
    .select("id, created_at, user_id, top3, answers")
    .order("created_at", { ascending: false })
    .range(0, pageSize - 1);

  if (type === "user") {
    query = query.not("user_id", "is", null);
  } else if (type === "guest") {
    query = query.is("user_id", null);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error("adminExportCORS:", error);
    return json(500, { error: "db_error" });
  }

  const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
  let profilesById = {};

  if (userIds.length) {
    const { data: profs } = await supa
      .from("profiles")
      .select(
        "user_id, full_name, first_name, nickname, name, email, country, state, gender, dob, created_at, updated_at"
      )
      .in("user_id", userIds);

    profilesById = Object.fromEntries(
      (profs || []).map(p => [p.user_id, p])
    );
  }

  // shape into flat CSV rows
  let items = rows.map(r => {
    const prof = profilesById[r.user_id] || {};

    const displayName =
      prof.full_name ||
      prof.first_name ||
      prof.nickname ||
      prof.name ||
      prof.email ||
      "";

    const top3 = Array.isArray(r.top3) ? r.top3 : [];
    const firstPick = top3[0]
      ? `${top3[0].brand || ""} ${top3[0].model || ""}`.trim()
      : "";
    const top3Flat = top3
      .map(c => `${c.brand || ""} ${c.model || ""}`.trim())
      .join(" | ");

    return {
      name: displayName,
      email: prof.email || "",
      created_at: r.created_at || "",
      first_pick: firstPick,
      top3: top3Flat,
      type: r.user_id ? "User" : "Guest"
    };
  });

  // server-side search filter for CSV export
  if (search && search.length >= 2) {
    items = items.filter(it => {
      const hay = `${it.name} ${it.email} ${it.first_pick} ${it.top3}`.toLowerCase();
      return hay.includes(search);
    });
  }

  // build CSV string
  const header = ["name", "email", "created_at", "#1_pick", "top3", "type"];
  const lines = [
    header.join(","),
    ...items.map(it =>
      [
        csvEscape(it.name),
        csvEscape(it.email),
        csvEscape(it.created_at),
        csvEscape(it.first_pick),
        csvEscape(it.top3),
        csvEscape(it.type)
      ].join(",")
    )
  ];
  const csv = lines.join("\n");

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="users.csv"'
    },
    body: csv
  };
});
