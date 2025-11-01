// netlify/functions/adminStatsCORS.js
import cors, { json } from "./cors.js";
import {
  getAdminClient,
  getUserFromAuth,
  parseJSON,
  isAllowedAdmin,
} from "./_supabase.js";

async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  // 1. auth
  const { user } = await getUserFromAuth(event);
  if (!user || !isAllowedAdmin(user.email)) {
    return json(401, { error: "unauthorized" });
  }

  // 2. parse input
  const body = parseJSON(event.body);
  const lastDays = Number(body.lastDays ?? 7);
  const type     = body.type || null; // "user" | "guest" | null

  const supa = getAdminClient();

  // 3. YOUR REAL QUERY GOES HERE
  //
  // You probably already had logic like:
  //  - count total distinct users/guests
  //  - count how many were created in the last X days
  //    (NOW() - lastDays)
  //  - optionally filter by `type`
  //
  // Example pseudo:
  //
  // const sinceIso = new Date(Date.now() - lastDays*24*60*60*1000).toISOString();
  //
  // const { data: totalRows, error: errTotal } = await supa
  //   .from("YOUR_USER_INDEX")
  //   .select("id", { count: "exact", head: true })
  //   .eq("user_type_col", type); // only if type != null
  //
  // const { data: newRows, error: errNew } = await supa
  //   .from("YOUR_USER_INDEX")
  //   .select("id", { count: "exact", head: true })
  //   .gte("created_at", sinceIso)
  //   .eq("user_type_col", type); // only if type != null
  //
  // const total = totalRows?.length or errTotal?.count etc (depending how you wrote it)
  // const fresh = newRows?.length  or errNew?.count
  //
  // return json(200, { total, new: fresh });

  // ---------- PLACEHOLDER ----------
  // remove this once you paste your working supabase counting code
  return json(200, {
    total: 0,
    new: 0,
  });
}

export const handler = cors(handler);
