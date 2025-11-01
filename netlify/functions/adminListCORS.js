// netlify/functions/adminListCORS.js
import cors, { json } from "./cors.js";
import {
  getAdminClient,
  getUserFromAuth,
  parseJSON,
  ADMIN_EMAILS
} from "./_supabaseAdmin.js";

export const handler = cors(async function (event, context) {
  // 1. auth / allowlist
  const { user } = await getUserFromAuth(event);

  if (!user) {
    return json(401, { error: "unauthorized" });
  }
  if (!ADMIN_EMAILS.includes(user.email)) {
    return json(403, { error: "forbidden" });
  }

  // 2. read request body
  const body = parseJSON(event.body);

  const page = Number(body.page || 1);
  const pageSize = Number(body.pageSize || 20);
  const type = body.type || null; // "user" | "guest" | null
  const search = (body.search || "").toLowerCase().trim();
  // body.resultsOnly is ignored for now but kept for compat

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supa = getAdminClient();

  // 3. pull recent quiz results
  let query = supa
    .from("results")
    .select("id, created_at, user_id, top3, answers", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  // filter by type if requested
  if (type === "user") {
    query = query.not("user_id", "is", null);
  } else if (type === "guest") {
    query = query.is("user_id", null);
  }

  const { data: rows, error } = await query;

  if (error) {
    console.error("adminListCORS results error:", error);
    return json(500, {
      error: "db_error",
      detail: String(error.message || error)
    });
  }

  // 4. fetch matching profiles in batch
  const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
  let profilesById = {};

  if (userIds.length) {
    const { data: profs, error: pErr } = await supa
      .from("profiles")
      .select(
        "user_id, full_name, first_name, nickname, name, email, country, state, gender, dob, created_at, updated_at"
      )
      .in("user_id", userIds);

    if (pErr) {
      console.warn("adminListCORS profile error:", pErr);
    } else {
      profilesById = Object.fromEntries(
        (profs || []).map(p => [p.user_id, p])
      );
    }
  }

  // 5. shape data for frontend rows
  const items = rows.map(r => {
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

    return {
      name: displayName,
      nickname: prof.nickname || null,
      full_name: prof.full_name || null,
      user_name: displayName,

      email: prof.email || null,
      user_email: prof.email || null,

      created_at: r.created_at,
      updated_at: prof.updated_at || r.created_at,

      top3,
      first_pick: firstPick,
      type: r.user_id ? "User" : "Guest"
    };
  });

  // 6. apply search (server-side filter for "min 2 chars")
  let filtered = items;
  if (search && search.length >= 2) {
    filtered = items.filter(it => {
      const haystack = [
        it.name,
        it.email,
        it.first_pick,
        ...(Array.isArray(it.top3)
          ? it.top3.map(
              c =>
                `${c.brand || ""} ${c.model || ""} ${c.reason || ""}`
            )
          : [])
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }

  const hasMore = rows.length === pageSize;

  return json(200, {
    items: filtered,
    hasMore
  });
});
