// netlify/functions/resultsSavePublicCORS.js
import cors, { json } from "./cors.js";

export const handler = cors(async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    body = {};
  }

  // Normally you would:
  // - verify Supabase auth
  // - insert { user_id, top3, answers } into "results" table
  // For now we just ack it.
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ok: true,
      saved: true,
      received: body || {}
    })
  };
});
