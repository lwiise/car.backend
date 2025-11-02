// netlify/functions/adminListCORS.js
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

  // --- read request body from frontend ---
  const body = parseJSON(event.body);
  const page       = Number(body.page)      || 1;
  const pageSize   = Number(body.pageSize)  || 20;
  const searchTerm = (body.search || "").trim().toLowerCase();
  const typeFilter = body.type || null; // "user" | "guest" | null
  // body.resultsOnly is ignored on purpose now

  const supa = getAdminClient();

  // --- pull latest quiz results from DB ---
  // We just grab newest quiz_results rows. We don't assume any columns except:
  //   email, created_at, top3 (array of cars) or results (fallback), answers
  const start = (page - 1) * pageSize;
  const end   = start + pageSize - 1;

  const { data: quizRows, error: quizErr } = await supa
    .from("quiz_results")
    .select("*")
    .order("created_at", { ascending: false })
    .range(start, end);

  if (quizErr) {
    console.error("quiz_results query failed:", quizErr);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "db_list_failed",
        detail: quizErr.message || quizErr
      })
    };
  }

  // collect distinct emails
  const emails = [...new Set(
    (quizRows || [])
      .map(r => r.email)
      .filter(Boolean)
  )];

  // fetch matching profiles for those emails
  let profilesByEmail = {};
  if (emails.length) {
    const { data: profRows, error: profErr } = await supa
      .from("profiles")
      .select("*")
      .in("email", emails);

    if (profErr) {
      console.warn("profiles query error:", profErr);
    } else if (Array.isArray(profRows)) {
      profilesByEmail = Object.fromEntries(
        profRows.map(p => [p.email, p])
      );
    }
  }

  // build response rows for the table
  // we will also dedupe by email so you only see the newest row per person
  const seenEmails = new Set();
  const items = [];

  for (const row of quizRows) {
    const email = row.email || "";
    if (!email) continue; // no email? skip row

    if (seenEmails.has(email)) {
      // already pushed a newer row for this email
      continue;
    }
    seenEmails.add(email);

    const profile = profilesByEmail[email] || null;

    // figure out top-3 car picks
    // in some DBs you called it "top3", in older drafts maybe "results"
    const top3raw = Array.isArray(row.top3)
      ? row.top3
      : (Array.isArray(row.results) ? row.results : []);

    const firstPickObj = top3raw && top3raw[0] ? top3raw[0] : null;
    const first_pick = firstPickObj
      ? `${firstPickObj.brand || ""} ${firstPickObj.model || ""}`.trim()
      : "";

    const top_summary = top3raw && top3raw.length
      ? top3raw
          .map(c =>
            `${c.brand || ""} ${c.model || ""}`.trim()
          )
          .filter(Boolean)
          .join(" • ")
      : "";

    // classify: User if we have a profile, Guest if not
    const kind = profile ? "User" : "Guest";

    // we respect filter "user" / "guest"
    if (typeFilter === "user"  && kind !== "User")  continue;
    if (typeFilter === "guest" && kind !== "Guest") continue;

    items.push({
      id: row.id,
      created_at: row.created_at,
      email,
      name: profile?.name || profile?.nickname || "",
      first_pick,
      top_summary,
      top3: top3raw || [],
      type: kind
    });
  }

  // basic search filter (min 2 chars on frontend, but we'll be safe anyway)
  if (searchTerm && searchTerm.length >= 2) {
    const term = searchTerm;
    const filtered = items.filter(it => {
      const hay =
        `${it.email} ${it.name} ${it.first_pick} ${it.top_summary}`
          .toLowerCase();
      return hay.includes(term);
    });
    return {
      statusCode: 200,
      body: JSON.stringify({
        items: filtered,
        hasMore: quizRows.length === pageSize
      })
    };
  }

  // normal return
  return {
    statusCode: 200,
    body: JSON.stringify({
      items,
      hasMore: quizRows.length === pageSize
    })
  };
});
