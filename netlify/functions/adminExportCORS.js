// netlify/functions/adminExportCORS.js
import cors from "./cors.js";
import {
  getAdminClient,
  parseJSON,
  getUserFromAuth,
  isAllowedAdmin
} from "./_supabase.js";

function shapeRow(resultRow, profileMap) {
  const {
    id,
    created_at,
    user_id,
    email: guestEmail,
    name: guestName,
    top3
  } = resultRow || {};

  const prof = user_id ? profileMap[user_id] : null;

  const finalEmail = prof?.email || guestEmail || "—";
  const finalName  = prof?.name  || prof?.nickname || guestName || "—";

  let first_pick = "—";
  if (Array.isArray(top3) && top3.length > 0) {
    const p = top3[0];
    first_pick = `${p.brand || ""} ${p.model || ""}`.trim() || "—";
  }

  let top_summary = "—";
  if (Array.isArray(top3) && top3.length > 0) {
    top_summary = top3
      .slice(0,3)
      .map(p => `${p.brand||""} ${p.model||""}`.trim())
      .filter(Boolean)
      .join(" • ") || "—";
  }

  const type = user_id ? "User" : "Guest";

  return {
    id,
    created_at,
    email: finalEmail,
    name: finalName,
    first_pick,
    top_summary,
    type
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

  // auth
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
    type = "user",
    resultsOnly = true
  } = parseJSON(event.body);

  const supa = getAdminClient();

  // build filter same as in list
  let listReq = supa
    .from("quiz_results")
    .select("id,created_at,user_id,email,name,top3")
    .order("created_at", { ascending: false });

  if (type === "guest") {
    listReq = listReq.is("user_id", null);
  } else if (type === "user") {
    listReq = listReq.not("user_id", "is", null);
  }

  const querySearch = (search || "").trim();
  if (querySearch) {
    listReq = listReq.or(
      `email.ilike.%${querySearch}%,name.ilike.%${querySearch}%`
    );
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

  // gather profile info
  const userIds = Array.from(
    new Set(
      resultRows
        .map(r => r.user_id)
        .filter(v => !!v)
    )
  );

  let profileMap = {};
  if (userIds.length > 0) {
    const { data: profRows, error: profErr } = await supa
      .from("profiles")
      .select("id,email,name,nickname")
      .in("id", userIds);

    if (profErr) {
      console.warn("[adminExportCORS] profErr:", profErr);
    } else {
      profileMap = Object.fromEntries(
        profRows.map(p => [p.id, p])
      );
    }
  }

  const shaped = resultRows.map(r => shapeRow(r, profileMap));

  // build CSV
  const header = [
    "id",
    "created_at",
    "name",
    "email",
    "first_pick",
    "top_summary",
    "type"
  ];

  const csvLines = [
    header.join(","),
    ...shaped.map(row => {
      // escape commas/quotes
      const escVal = (v="") => {
        const s = String(v ?? "");
        if (s.includes('"') || s.includes(",") || s.includes("\n")) {
          return `"${s.replace(/"/g,'""')}"`;
        }
        return s;
      };

      return [
        escVal(row.id),
        escVal(row.created_at),
        escVal(row.name),
        escVal(row.email),
        escVal(row.first_pick),
        escVal(row.top_summary),
        escVal(row.type)
      ].join(",");
    })
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
