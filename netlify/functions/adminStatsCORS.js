// netlify/functions/adminStatsCORS.js
import cors from "./cors.js";
import {
  getAdminClient,
  getUserFromAuth,
  ADMIN_EMAILS,
  parseJSON
} from "./_supabaseAdmin.js";

export default cors(async (event) => {
  // --- auth check ---
  const { user } = await getUserFromAuth(event);
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "forbidden" })
    };
  }

  const body = parseJSON(event.body);
  const lastDays   = Number(body.lastDays) || 7;
  const typeFilter = body.type || null; // "user" | "guest" | null

  const supa = getAdminClient();

  // cutoff timestamp for "new"
  const now = Date.now();
  const cutoffISO = new Date(now - lastDays * 24 * 60 * 60 * 1000).toISOString();

  // grab a chunk of quiz_results (we just take a lot; you can tune .limit)
  // We only select email + created_at for speed.
  const { data: quizRows, error: quizErr } = await supa
    .from("quiz_results")
    .select("email, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (quizErr) {
    console.error("quiz_results stats query failed:", quizErr);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "db_stats_failed",
        detail: quizErr.message || quizErr
      })
    };
  }

  // collect distinct emails overall
  const allEmails = [...new Set(
    quizRows
      .map(r => r.email)
      .filter(Boolean)
  )];

  // collect distinct emails in "lastDays"
  const recentEmails = [...new Set(
    quizRows
      .filter(r => r.created_at && r.created_at >= cutoffISO)
      .map(r => r.email)
      .filter(Boolean)
  )];

  // check which of those emails have profiles
  let profilesByEmail = {};
  if (allEmails.length) {
    const { data: profRows, error: profErr } = await supa
      .from("profiles")
      .select("email")
      .in("email", allEmails);

    if (profErr) {
      console.warn("profiles stats query error:", profErr);
    } else if (Array.isArray(profRows)) {
      profilesByEmail = Object.fromEntries(
        profRows.map(p => [p.email, true])
      );
    }
  }

  // classify function
  function kindOf(email) {
    return profilesByEmail[email] ? "User" : "Guest";
  }

  function countDistinctFiltered(emailList, whichType) {
    // emailList is an array of unique emails already
    return emailList.filter(e => {
      const k = kindOf(e);
      if (whichType === "user")  return k === "User";
      if (whichType === "guest") return k === "Guest";
      return true; // all
    }).length;
  }

  const totalCount = countDistinctFiltered(allEmails,   typeFilter);
  const newCount   = countDistinctFiltered(recentEmails, typeFilter);

  return {
    statusCode: 200,
    body: JSON.stringify({
      total: totalCount,
      new:   newCount
    })
  };
});
