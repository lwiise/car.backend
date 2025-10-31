// netlify/functions/carMatchCORS.js
import cors, { json } from "./cors.js";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// ---------- CONFIG ----------
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE; // service role or anon with insert access
const openaiApiKey  = process.env.OPENAI_API_KEY;

// fallback cars if AI or DB explodes
function buildMockPicks() {
  return [
    {
      brand: "Mercedes-Benz",
      model: "C-Class",
      reason: "Comfortable daily luxury with balanced cost.",
      image: "https://images.unsplash.com/photo-1503376780353-7e3c06bb6a3a?auto=format&fit=crop&w=800&q=80"
    },
    {
      brand: "BMW",
      model: "3 Series",
      reason: "Sporty feel but still practical and reliable.",
      image: "https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=800&q=80"
    },
    {
      brand: "Audi",
      model: "A4",
      reason: "Tech-forward interior, clean look, safe for long trips.",
      image: "https://images.unsplash.com/photo-1619767886558-efdcf5ca5c12?auto=format&fit=crop&w=800&q=80"
    }
  ];
}

// helper: build the system/user prompt for the AI
function buildPromptFromAnswers(answers) {
  // You can shape this however you like.
  // We're giving the model clear instructions so it returns ONLY JSON.
  return `
User preferences:
${JSON.stringify(answers, null, 2)}

You are a car buying assistant.
Pick EXACTLY 3 cars that match this user in a realistic EU market / global market (used or new is okay based on budget).
Return ONLY valid JSON. No prose, no comments.

JSON FORMAT (array of length 3):
[
  {
    "brand": "string",
    "model": "string",
    "reason": "short human explanation why this matches them",
    "image": "https://image-url-or-empty-string"
  },
  ...
]

Rules:
- "reason" must be 1-2 short sentences, no more.
- If budget is low, pick realistic cheaper cars.
- If user mentions family / kids / space, prefer SUVs/minivans etc.
- If user mentions sporty / weekend drive, add something fun.
- If they mention fuel type or seats, respect it.
- The "image" should be a general stock photo URL of that model if known, or "".
ONLY output the JSON array.
  `.trim();
}

// call OpenAI and try to get the 3-car JSON array
async function getAiPicks(answers) {
  if (!openaiApiKey) {
    console.warn("[carMatchCORS] No OPENAI_API_KEY, using mock.");
    return buildMockPicks();
  }

  const client = new OpenAI({ apiKey: openaiApiKey });

  // We'll use responses.create with a JSON-ish style. If your OpenAI plan
  // is using a model like "gpt-4o-mini" or "gpt-4.1-mini", swap below.
  // We'll ask for a strict JSON array.
  const prompt = buildPromptFromAnswers(answers);

  const completion = await client.responses.create({
    model: "gpt-4o-mini", // pick a model you have access to
    input: prompt,
  });

  // The SDK returns structured content. We'll try to extract text.
  const rawText =
    completion?.output?.[0]?.content?.[0]?.text ||
    completion?.data?.[0]?.content?.[0]?.text ||
    completion?.output_text ||
    "";

  if (!rawText) {
    console.warn("[carMatchCORS] OpenAI empty text, fallback to mock.");
    return buildMockPicks();
  }

  let picks = null;

  // try parse full body
  try {
    picks = JSON.parse(rawText);
  } catch (_) {
    // try to pull last [...] block
    const m = rawText.match(/\[[\s\S]*\]$/);
    if (m) {
      try { picks = JSON.parse(m[0]); } catch (err2) {
        console.warn("[carMatchCORS] JSON parse error even after match", err2);
      }
    }
  }

  if (!Array.isArray(picks) || picks.length < 1) {
    console.warn("[carMatchCORS] picks invalid, fallback mock");
    return buildMockPicks();
  }

  // normalize structure: make sure each car has brand/model/reason/image
  const cleaned = picks.slice(0,3).map((car, idx) => ({
    brand:  String(car.brand  ?? `Car ${idx+1}`),
    model:  String(car.model  ?? ""),
    reason: String(car.reason ?? "No reason provided."),
    image:  String(car.image  ?? "")
  }));

  return cleaned;
}

// save result row into Supabase "results" table
async function saveResultToSupabase({ userId, userEmail, answers, top3 }) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn("[carMatchCORS] Missing Supabase env, skip save.");
    return { inserted: false, error: "no_supabase_env" };
  }

  const supa = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
  });

  // shape must match your table columns
  const payload = {
    user_id: userId || null,
    user_email: userEmail || null,
    answers,
    top3
  };

  const { data, error } = await supa
    .from("results")
    .insert(payload)
    .select("id, created_at")
    .single();

  if (error) {
    console.warn("[carMatchCORS] Supabase insert error:", error);
    return { inserted: false, error: error.message };
  }

  return { inserted: true, row: data };
}

// ---------------- handler ----------------
export const handler = cors(async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  // Parse request body
  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    body = {};
  }

  const answers = body.answers || {};
  const mockForced =
    event.queryStringParameters &&
    event.queryStringParameters.mock === "1";

  // read optional auth headers (the dashboard passes these)
  const userId    = event.headers?.["x-user-id"]    || "";
  const userEmail = event.headers?.["x-user-email"] || "";

  // If ?mock=1 explicitly requested, skip AI and DB
  if (mockForced) {
    const picks = buildMockPicks();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(picks)
    };
  }

  // 1. Ask AI for picks
  let picks;
  try {
    picks = await getAiPicks(answers);
  } catch (err) {
    console.error("[carMatchCORS] AI error:", err);
    picks = buildMockPicks();
  }

  // 2. Save to Supabase (non-blocking style, but we'll still await so history works fast)
  try {
    await saveResultToSupabase({
      userId,
      userEmail,
      answers,
      top3: picks
    });
  } catch (err) {
    console.warn("[carMatchCORS] saveResultToSupabase failed:", err);
  }

  // 3. Send picks back to frontend
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(picks)
  };
});
