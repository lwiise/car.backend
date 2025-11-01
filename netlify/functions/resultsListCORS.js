// netlify/functions/resultsListCORS.js
import cors, { json } from "./cors.js";
import { supaAdmin } from "./supabaseClient.js";
import { getUserIdFromAuthHeader } from "./authUtils.js";

export const handler = cors(async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "method_not_allowed" });
  }

  // which user is asking?
  // we try Authorization header first.
  let userId = getUserIdFromAuthHeader(event.headers || {});

  // Fallback: allow ?uid=... for debugging if token missing,
  // but in prod the Authorization header should cover it.
  if (!userId) {
    const params = new URLSearchParams(event.queryStringParameters || {});
    userId = params.get("uid") || null;
  }

  if (!userId) {
    return json(401, { error: "no_auth", detail: "no user id" });
  }

  const params = new URLSearchParams(event.queryStringParameters || {});
  const limit  = Math.min(parseInt(params.get("limit")  || "10", 10), 50);
  const offset = parseInt(params.get("offset") || "0", 10);

  // fetch newest first
  const { data, error } = await supaAdmin
    .from("results")
    .select("id, created_at, top3, answers")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("resultsList select error:", error);
    return json(500, {
      error: "db_fetch_failed",
      detail: error.message || String(error)
    });
  }

  return json(200, {
    items: data || []
  });
});
