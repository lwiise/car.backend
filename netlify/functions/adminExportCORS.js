// netlify/functions/adminExportCORS.js
import cors from "./cors.js";
import {
  getAdminClient,
  parseJSON,
  getUserFromAuth,
  isAllowedAdmin
} from "./_supabase.js";

function grabSummary(row) {
  return (
    row.top_summary ??
    row.top3 ??
    row.top_3 ??
    row.summary ??
    ""
  );
}

function shapeRow(resultRow, profileMap) {
  const {
    id,
    created_at,
    user_id,
    first_pick
  } = resultRow || {};

  const prof = user_id ? profileMap[user_id] : null;

  const finalEmail = prof?.email || "—";
  const finalName  = prof?.name || prof?.nickname || "—";

  return {
    id,
    created_at,
    name: finalName,
    email: finalEmail,
    first_pick: first_pick || "—",
    top_summary: grabSummary(resultRow) || "—",
    type: user_id ? "User" : "Guest"
  };
}

export const handler = cors(async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "method_not_allowed" })
    };
  }

  const { user } = await getUserFromAuth(event);
  if (!isAllowedAdmin(user)) {
    return {
      statusCode: 403,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "forbidden" })
    };
  }

  const {
    search = "",
    type = "all"
  } = parseJSON(event.body);

  const supa = getAdminClient();

  // grab all rows (filtered by type)
  let listReq = supa
    .from("quiz_results")
    .select("*")
    .order("created_at", { ascending: false });

  if (type === "guest") {
    listReq = listReq.is("user_id", null);
  } else if (type === "user") {
    listReq = listReq.not("user_id", "is", null);
  }

  const { data: resultRows, error: listErr } = await listReq;
  if (listErr) {
    console.error("[adminExportCORS] listErr:", listErr);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "db_list_failed",
        detail: listErr.message
      })
    };
  }

  // profile map
  const userIds = Array.from(
    new Set(
      resultRows
        .map(r => r.user_id)
        .filter(Boolean)
    )
  );

  let profileMap = {};
  if (userIds.length > 0) {
    const { data: profRows, error: profErr } = await supa
      .from("profiles")
      .select("id,email,name,nickname")
      .in("id", userIds);

    if (!profErr && Array.isArray(profRows)) {
      profileMap = Object.fromEntries(
        profRows.map(p => [p.id, p])
      );
    }
  }

  // shape
  let shaped = resultRows.map(r => shapeRow(r, profileMap));

  // in-memory search
  const q = search.trim().toLowerCase();
  if (q) {
    shaped = shaped.filter(row => {
      const hay =
        (row.name || "") + " " +
        (row.email || "") + " " +
        (row.first_pick || "") + " " +
        (row.top_summary || "");
      return hay.toLowerCase().includes(q);
    });
  }

  // CSV build
  const header = [
    "id",
    "created_at",
    "name",
    "email",
    "first_pick",
    "top_summary",
    "type"
  ];

  const escVal = (v = "") => {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return `"${s.replace(/"/g,'""')}"`;
    }
    return s;
  };

  const csvLines = [
    header.join(","),
    ...shaped.map(row => [
      escVal(row.id),
      escVal(row.created_at),
      escVal(row.name),
      escVal(row.email),
      escVal(row.first_pick),
      escVal(row.top_summary),
      escVal(row.type),
    ].join(","))
  ].join("\n");

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=users.csv"
    },
    body: csvLines
  };
});
