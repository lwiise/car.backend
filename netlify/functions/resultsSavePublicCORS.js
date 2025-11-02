// netlify/functions/resultsSavePublicCORS.js
import {
  getAdminClient,
  parseJSON,
  jsonResponse,
  preflightResponse,
  ALLOWED_ORIGIN
} from "./_supabaseAdmin.js";

// This endpoint is PUBLIC. No auth.
// Frontend will call this right after the quiz ends.
// Body: { answers, top3 }

export const handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return preflightResponse();
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN
      },
      body: "Method not allowed"
    };
  }

  const body = parseJSON(event.body || "{}");
  const answers = body.answers || {};
  const top3 = Array.isArray(body.top3) ? body.top3 : [];

  const supa = getAdminClient();

  const { data, error } = await supa
    .from("guest_results")
    .insert({
      answers,
      top3
    })
    .select("id, created_at")
    .single();

  if (error) {
    console.error("guest insert error", error);
    return jsonResponse(500, {
      error: "guest_insert_failed",
      detail: error.message || String(error)
    });
  }

  // send back guest reference so frontend could (optionally) stash it
  // e.g. sessionStorage.setItem("guestId", data.id)
  return jsonResponse(200, {
    ok: true,
    guest_id: data.id,
    created_at: data.created_at
  });
};
