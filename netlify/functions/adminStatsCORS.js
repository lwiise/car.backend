// netlify/functions/adminStatsCORS.js
const { cors } = require("./cors");
const {
  getAdminClient,
  parseJSON,
  getUserFromAuth,
} = require("./_supabase");

const ADMIN_EMAILS = []; // same story as above

module.exports = cors(async (event) => {
  // --- auth check ---
  const { user } = await getUserFromAuth(event);
  if (!user) {
    return {
      statusCode: 401,
      body: { error: "Unauthorized (no token)" },
    };
  }
  if (ADMIN_EMAILS.length && !ADMIN_EMAILS.includes(user.email)) {
    return {
      statusCode: 403,
      body: { error: "Forbidden (not admin)" },
    };
  }

  const supa = getAdminClient();
  const body = parseJSON(event.body || "{}");
  const lastDays = Number(body.lastDays || 7);

  const sinceISO = new Date(
    Date.now() - lastDays * 24 * 60 * 60 * 1000
  ).toISOString();

  // total = count of rows in `results`
  const {
    count: totalCount,
    error: totalErr,
  } = await supa
    .from("results")
    .select("id", { count: "exact", head: true });

  // new in last X days
  const {
    count: newCount,
    error: newErr,
  } = await supa
    .from("results")
    .select("id", { count: "exact", head: true })
    .gte("created_at", sinceISO);

  if (totalErr) {
    console.warn("adminStatsCORS totalErr:", totalErr);
  }
  if (newErr) {
    console.warn("adminStatsCORS newErr:", newErr);
  }

  return {
    statusCode: 200,
    body: {
      total: totalErr ? 0 : totalCount || 0,
      new: newErr ? 0 : newCount || 0,
    },
  };
});
