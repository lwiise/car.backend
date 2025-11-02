// netlify/functions/adminStatsCORS.js
import {
  getAdminClient,
  parseBody,
  getRequester,
  ADMIN_EMAILS,
  jsonResponse,
  forbidden,
  handleOptions,
} from "./_supabaseAdmin.js";

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return handleOptions();
  }

  const { user } = await getRequester(event);
  const adminEmail = (user?.email || "").toLowerCase();
  if (!user || !ADMIN_EMAILS.map(e => e.toLowerCase()).includes(adminEmail)) {
    return forbidden();
  }

  const {
    lastDays = 7,  // number of days window for "new"
    type = null,   // "user" | "guest" | null
  } = parseBody(event.body);

  const supa = getAdminClient();

  // build helper to count with optional filters
  async function countSince(sinceIso = null) {
    let q = supa
      .from("results")
      .select("*", { count: "exact", head: true }); // data won't return, just count

    if (type === "user") {
      q = q.not("user_id", "is", null);   // user_id IS NOT NULL
    } else if (type === "guest") {
      q = q.is("user_id", null);          // user_id IS NULL
    }

    if (sinceIso) {
      q = q.gte("created_at", sinceIso);
    }

    const { count, error } = await q;
    if (error) {
      console.warn("stats count error:", error);
      return 0;
    }
    return count || 0;
  }

  // now = Date.now(), subtract lastDays days
  const now = Date.now();
  const ms = lastDays * 24 * 60 * 60 * 1000;
  const sinceIso = new Date(now - ms).toISOString();

  const totalCount = await countSince(null);
  const newCount   = await countSince(sinceIso);

  return jsonResponse(200, {
    total: totalCount,
    new: newCount,
  });
};
