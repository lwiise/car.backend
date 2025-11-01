// netlify/functions/resultsListCORS.js
const { cors } = require("./cors");
const {
  getAdminClient,
  getUserFromAuth,
} = require("./_supabase");

module.exports = cors(async (event) => {
  const { user, token } = await getUserFromAuth(event);
  if (!user || !token) {
    return {
      statusCode: 401,
      body: { error: "Unauthorized" },
    };
  }

  const supa = getAdminClient();

  // read query params
  const qs = new URLSearchParams(event.queryStringParameters || {});
  const limit = Number(qs.get("limit") || 10);
  const offset = Number(qs.get("offset") || 0);

  // we allow uid in the URL but we DO NOT let you fetch a different uid
  const requestedUid = qs.get("uid") || "";
  const safeUid = requestedUid && requestedUid === user.id
    ? requestedUid
    : user.id;

  // grab that user's recent results
  const { data, error } = await supa
    .from("results")
    .select("id, created_at, top3, answers")
    .eq("user_id", safeUid)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("resultsListCORS error:", error);
    return {
      statusCode: 500,
      body: { error: "DB error loading results" },
    };
  }

  return {
    statusCode: 200,
    body: {
      items: Array.isArray(data) ? data : [],
    },
  };
});
