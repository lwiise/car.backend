// netlify/functions/adminDetailsCORS.js
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

  // 2. body
  const body  = parseJSON(event.body);
  const email = (body.email || "").trim();
  const type  = (body.type  || "user").toLowerCase(); // "user" | "guest"
  if (!email) {
    return json(400, { error: "missing email" });
  }

  const supa = getAdminClient();

  // 3. YOUR REAL LOGIC HERE
  //
  // You already had code that:
  //  - looks up the profile row (name, nickname, gender, dob, country, state, created_at, updated_at, etc.)
  //  - gathers quiz metadata (type, top3_count, user_id, created_at)
  //  - grabs the top-3 picks for that user/guest
  //  - grabs the full questionnaire answers
  //
  // do that same logic here and shape the final object exactly like below.

  // Example shape you must return:
  const profile = {
    // name, email, nickname, gender, dob, country, state,
    // created_at, updated_at, user_id...
  };

  const meta = {
    // type: "User" | "Guest",
    // top3_count,
    // user_id,
    // created_at,
  };

  const picks = [
    // { brand: "Tesla", model: "Model 3", reason: "great range" },
    // ...
  ];

  const answers = {
    // q1_bodyType: "...",
    // q2_budget: "...",
    // ...
  };

  // ---------- PLACEHOLDER RETURN ----------
  // replace these empty defaults with real data you build above
  return json(200, {
    profile: profile,
    meta: meta,
    picks: picks,
    answers: answers,
  });
}

export const handler = cors(handler);
