// netlify/functions/adminExportCORS.js
import cors from "./cors.js";
import {
  getAdminClient,
  getUserFromAuth,
  parseJSON,
  isAllowedAdmin,
} from "./_supabase.js";

/**
 * Body matches adminListCORS:
 * { search, type, resultsOnly }
 *
 * We respond with raw CSV text.
 * The front-end treats it as a Blob and downloads "users.csv".
 */
async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  // 1. auth
  const { user } = await getUserFromAuth(event);
  if (!user || !isAllowedAdmin(user.email)) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "unauthorized" }),
    };
  }

  // 2. body
  const body = parseJSON(event.body);
  const search      = (body.search || "").trim();
  const type        = body.type || null;
  const resultsOnly = !!body.resultsOnly;

  const supa = getAdminClient();

  // 3. YOUR REAL CSV LOGIC HERE
  //
  // You already had an export function.
  // Paste that logic here:
  //  - query Supabase for ALL rows (not paginated)
  //  - apply same filters (search/type/resultsOnly)
  //  - build CSV string with headers like:
  //      "email,name,created_at,first_pick,top3...\n"
  //    + rows...
  //
  // Return that string as body with "text/csv".
  //
  // Example skeleton:
  //
  // const { data: rows, error } = await supa
  //   .from("YOUR_VIEW_OR_TABLE")
  //   .select("*")
  //   .ilike("searchable_text_col", `%${search}%`)
  //   .eq("user_type_col", type) // if provided
  //   .order("created_at", { ascending: false });
  //
  // if (error) throw error;
  //
  // let csv = "email,name,created_at,first_pick,top3,type\n";
  // for (const r of rows) {
  //   const topSummary = Array.isArray(r.top3)
  //     ? r.top3.map(p=>`${p.brand||""} ${p.model||""}`.trim()).join(" | ")
  //     : "";
  //   csv += [
  //     r.email ?? "",
  //     r.name ?? "",
  //     r.created_at ?? "",
  //     r.first_pick ?? "",
  //     topSummary,
  //     r.type ?? ""
  //   ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(",") + "\n";
  // }

  // ---------- PLACEHOLDER ----------
  const csv = "email,name,created_at,first_pick,top3,type\n";

  return {
    statusCode: 200,
    headers: {
      // cors() wrapper will still inject Access-Control-Allow-*
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="users.csv"',
    },
    body: csv,
  };
}

export const handler = cors(handler);
