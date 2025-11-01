// netlify/functions/adminListCORS.js
import cors, { json } from "./cors.js";
import {
  getAdminClient,
  getUserFromAuth,
  parseJSON,
  isAllowedAdmin,
} from "./_supabase.js";

/**
 * Body the frontend sends:
 * {
 *   page,
 *   pageSize,
 *   search,
 *   type,          // "user" | "guest" | null
 *   resultsOnly    // boolean
 * }
 *
 * Frontend expects:
 * {
 *   items: [ { id, created_at, email, name, first_pick, top_summary, top3, type }, ... ],
 *   hasMore: true/false
 * }
 */
async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // 1. auth check
  const { user } = await getUserFromAuth(event);
  if (!user || !isAllowedAdmin(user.email)) {
    return json(401, { error: "unauthorized" });
  }

  // 2. parse body
  const body = parseJSON(event.body);
  const page      = Number(body.page ?? 1);
  const pageSize  = Number(body.pageSize ?? 20);
  const search    = (body.search || "").trim();
  const type      = body.type || null; // "user" | "guest" | null
  const resultsOnly = !!body.resultsOnly;

  // 3. get supabase service client
  const supa = getAdminClient();

  // 4. build pagination range
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  // 5. RUN YOUR REAL QUERY HERE
  //
  // This should basically do what your old code did:
  //  - pull latest quiz submissions / users
  //  - filter by `search` if provided (email, name, car, etc.)
  //  - filter by `type` ("user" vs "guest") if provided
  //  - order by created_at DESC
  //  - limit by [from, to]
  //
  // Then map rows into:
  // {
  //   id,
  //   created_at,
  //   email,
  //   name,
  //   first_pick,
  //   top_summary,     // string like "Car1 • Car2 • Car3"
  //   top3,            // array of { brand, model, reason }
  //   type: "User" | "Guest"
  // }
  //
  // EXAMPLE SHAPE (replace with your real query):
  //
  // const { data: rows, error } = await supa
  //   .from("YOUR_VIEW_OR_TABLE")
  //   .select("*")
  //   .ilike("searchable_text_col", `%${search}%`)         // only if search provided
  //   .eq("user_type_col", type)                           // only if type provided
  //   .order("created_at", { ascending: false })
  //   .range(from, to);
  //
  // if (error) throw error;
  //
  // const items = rows.map(r => ({
  //   id: r.id,
  //   created_at: r.created_at,
  //   email: r.email,
  //   name: r.name,
  //   first_pick: r.first_pick,
  //   top_summary: r.top_summary,
  //   top3: r.top3,
  //   type: r.type // "User" | "Guest"
  // }));
  //
  // const hasMore = rows.length === pageSize;
  //
  // return json(200, { items, hasMore });

  // ---------- PLACEHOLDER ----------
  // remove this block once you paste your real query logic
  const items = [];
  const hasMore = false;
  return json(200, { items, hasMore });
}

export const handler = cors(handler);
