// netlify/functions/adminListCORS.js
import {
  getAdminClient,
  parseBody,
  getRequester,
  ADMIN_EMAILS,
  corsHeaders,
  jsonResponse,
  forbidden,
  handleOptions,
} from "./_supabaseAdmin.js";

export const handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return handleOptions();
  }

  // auth: only allow whitelisted admin emails
  const { user } = await getRequester(event);
  const adminEmail = (user?.email || "").toLowerCase();
  if (!user || !ADMIN_EMAILS.map(e => e.toLowerCase()).includes(adminEmail)) {
    return forbidden();
  }

  const {
    page = 1,
    pageSize = 20,
    search = "",
    type = null,          // "user" | "guest" | null
    resultsOnly = true,   // we keep it but don't really need it
  } = parseBody(event.body);

  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  const supa = getAdminClient();

  // base query: latest quiz attempts
  let q = supa
    .from("results")
    .select("id,user_id,top3,created_at")
    .order("created_at", { ascending: false })
    .range(from, to);

  // filter: Users vs Guests
  if (type === "user") {
    // user_id IS NOT NULL
    q = q.not("user_id", "is", null);
  } else if (type === "guest") {
    // user_id IS NULL
    q = q.is("user_id", null);
  }

  const { data: resRows, error } = await q;
  if (error) {
    console.error("adminListCORS results error:", error);
    return jsonResponse(500, {
      error: "db_list_failed",
      detail: error.message,
    });
  }

  // collect user_ids so we can look up their profile/email
  const userIds = [
    ...new Set(
      (resRows || [])
        .filter(r => r.user_id)
        .map(r => r.user_id)
    ),
  ];

  // fetch profiles in one go
  let profilesById = {};
  if (userIds.length > 0) {
    const { data: profRows, error: profErr } = await supa
      .from("profiles")
      .select("id,email,name,nickname")
      .in("id", userIds);

    if (profErr) {
      console.warn("profiles fetch error:", profErr);
    } else {
      for (const p of profRows || []) {
        profilesById[p.id] = p;
      }
    }
  }

  // Build final rows for the table
  let items = (resRows || []).map((row) => {
    const prof = row.user_id ? profilesById[row.user_id] || null : null;

    // derive #1 pick and summary from the JSON top3
    let firstPick = "—";
    let summary = "—";
    if (Array.isArray(row.top3) && row.top3.length) {
      const first = row.top3[0];
      if (first) {
        firstPick = `${first.brand || ""} ${first.model || ""}`.trim() || "—";
      }
      const listBits = row.top3
        .slice(0, 3)
        .map(p => `${p.brand || ""} ${p.model || ""}`.trim())
        .filter(Boolean);
      if (listBits.length) {
        summary = listBits.join(" • ");
      }
    }

    return {
      id: row.id,
      created_at: row.created_at,
      email: prof?.email || "—",
      name: prof?.nickname || prof?.name || "—",
      first_pick: firstPick,
      top_summary: summary,
      type: row.user_id ? "User" : "Guest",
    };
  });

  // search filter (client sends query when >=2 chars)
  if (search && search.length >= 2) {
    const ql = search.toLowerCase();
    items = items.filter((it) => {
      return (
        (it.email && it.email.toLowerCase().includes(ql)) ||
        (it.name && it.name.toLowerCase().includes(ql)) ||
        (it.first_pick && it.first_pick.toLowerCase().includes(ql)) ||
        (it.top_summary && it.top_summary.toLowerCase().includes(ql))
      );
    });
  }

  const hasMore = (resRows || []).length === pageSize;

  return jsonResponse(200, {
    items,
    hasMore,
  });
};
