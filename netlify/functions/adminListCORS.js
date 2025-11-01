// netlify/functions/adminListCORS.js
import cors, { json } from "./cors.js";
import {
  getAdminClient,
  parseJSON,
  getUserFromAuth,
} from "./_supabase.js";

/**
 * Allowed admin emails.
 * You can set ADMIN_EMAILS in Netlify env like:
 *   kkk1@gmail.com,otheradmin@domain.com
 * If it's not set, fallback keeps your current email so you don't get locked out.
 */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "kkk1@gmail.com")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/**
 * Take raw quiz rows and group them per email.
 * - If any row for that email is NOT a guest => treat the whole person as "User".
 * - Otherwise they stay "Guest".
 * - We collapse multiple quiz attempts into one snapshot.
 */
function buildSnapshots(rawRows) {
  const groups = {};

  for (const row of rawRows) {
    const emailKey =
      (row.email && row.email.toLowerCase()) ||
      `guest-${row.id}`;

    if (!groups[emailKey]) {
      groups[emailKey] = {
        all: [],
        latest: row, // newest first, we'll rely on order
        earliest_at: row.created_at,
        hasSignedUp: !row.is_guest,
      };
    }

    const g = groups[emailKey];
    g.all.push(row);

    // track earliest appearance time
    if (new Date(row.created_at) < new Date(g.earliest_at)) {
      g.earliest_at = row.created_at;
    }

    // if any entry is a real user, mark whole group as User
    if (!row.is_guest) {
      g.hasSignedUp = true;
    }
  }

  const snapshots = [];
  for (const key in groups) {
    const g = groups[key];
    const r = g.latest;

    const top3 = Array.isArray(r.top3) ? r.top3 : [];
    const firstPickObj = top3[0] || {};
    const firstPickText =
      (firstPickObj.brand || firstPickObj.model)
        ? `${firstPickObj.brand || ""} ${firstPickObj.model || ""}`.trim()
        : r.first_pick || "—";

    const topSummaryText =
      top3
        .slice(0, 3)
        .map(
          (p) =>
            `${p.brand || ""} ${p.model || ""}`.trim()
        )
        .filter(Boolean)
        .join(" • ") ||
      r.top_summary ||
      "—";

    snapshots.push({
      email: r.email || "—",
      name:
        r.name ||
        r.nickname ||
        r.full_name ||
        r.user_name ||
        r.email ||
        "—",
      created_at: r.created_at,
      first_pick: firstPickText || "—",
      top_summary: topSummaryText,
      top3,
      type: g.hasSignedUp ? "User" : "Guest",

      // extras used by stats/details logic
      all_rows: g.all,
      earliest_at: g.earliest_at,
      hasSignedUp: g.hasSignedUp,
      user_id: r.user_id || r.profile_id || r.uid || null,
    });
  }

  return snapshots;
}

/**
 * Apply type filter + search filter to the snapshots.
 */
function filterSnapshots(snapshots, { search, type }) {
  let out = snapshots.slice();

  // type filter
  if (type === "user") {
    out = out.filter((x) => x.type === "User");
  } else if (type === "guest") {
    out = out.filter((x) => x.type === "Guest");
  }

  // search filter (min 2 chars)
  if (search && search.trim().length >= 2) {
    const needle = search.trim().toLowerCase();
    out = out.filter((x) => {
      return (
        (x.email || "").toLowerCase().includes(needle) ||
        (x.name || "").toLowerCase().includes(needle) ||
        (x.first_pick || "")
          .toLowerCase()
          .includes(needle) ||
        (x.top_summary || "")
          .toLowerCase()
          .includes(needle)
      );
    });
  }

  return out;
}

export default cors(async function handler(event) {
  // 1. auth check
  const { user } = await getUserFromAuth(event);
  const emailLower = user?.email?.toLowerCase() || "";
  if (!user || !ADMIN_EMAILS.includes(emailLower)) {
    return json(401, { error: "unauthorized" });
  }

  // 2. read request body
  const body = parseJSON(event.body);
  const page = Number(body.page) || 1;
  const pageSize = Number(body.pageSize) || 20;
  const search = body.search || "";
  const type = body.type || null; // "user" | "guest" | null
  // body.resultsOnly can be ignored; UI only shows "results"

  const supa = getAdminClient();

  // 3. fetch quiz results
  //    Adjust table/column names if yours differ.
  const { data, error } = await supa
    .from("quiz_results")
    .select(`
      id,
      created_at,
      email,
      name,
      nickname,
      full_name,
      user_name,
      user_id,
      is_guest,
      top3,
      first_pick,
      top_summary,
      answers
    `)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("adminListCORS select error:", error);
    return json(500, {
      error: "db_error",
      detail: String(error.message || error),
    });
  }

  // 4. collapse rows per email
  const snapshots = buildSnapshots(data || []);

  // 5. filter by type + search
  const filtered = filterSnapshots(snapshots, { search, type });

  // 6. paginate in-memory
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const slice = filtered.slice(start, end);
  const hasMore = end < filtered.length;

  // 7. shape for frontend table
  return json(200, {
    items: slice.map((row) => ({
      email: row.email,
      name: row.name,
      created_at: row.created_at,
      first_pick: row.first_pick,
      top_summary: row.top_summary,
      top3: row.top3,
      type: row.type,
    })),
    hasMore,
  });
});
