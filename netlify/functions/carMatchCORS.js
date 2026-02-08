// netlify/functions/carMatchCORS.js
import cors, { json } from "./cors.js";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// ---------- CONFIG ----------
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE; // service role or anon with insert access
const openaiApiKey  = process.env.OPENAI_API_KEY;
const OPENAI_MODEL  = process.env.OPENAI_MODEL || "gpt-4o-mini";
const IMAGE_PROXY_BASE =
  process.env.IMAGE_PROXY_URL ||
  "https://carbackendd.netlify.app/.netlify/functions/carImageProxy";

const CAR_CATALOG = [
  { brand: "Toyota", model: "Corolla", type: "sedan", fuel: "gas", budget: "low", origin: "japan", tags: ["city", "reliable"] },
  { brand: "Honda", model: "Civic", type: "sedan", fuel: "gas", budget: "low", origin: "japan", tags: ["city", "reliable"] },
  { brand: "Hyundai", model: "Elantra", type: "sedan", fuel: "gas", budget: "low", origin: "korea", tags: ["city", "budget"] },
  { brand: "Volkswagen", model: "Golf", type: "hatch", fuel: "gas", budget: "mid", origin: "germany", tags: ["city", "compact"] },
  { brand: "Mazda", model: "CX-5", type: "suv", fuel: "gas", budget: "mid", origin: "japan", tags: ["family"] },
  { brand: "Toyota", model: "RAV4 Hybrid", type: "suv", fuel: "hybrid", budget: "mid", origin: "japan", tags: ["family"] },
  { brand: "Nissan", model: "Leaf", type: "hatch", fuel: "electric", budget: "low", origin: "japan", tags: ["city", "ev"] },
  { brand: "Tesla", model: "Model 3", type: "sedan", fuel: "electric", budget: "mid", origin: "usa", tags: ["tech", "ev"] },
  { brand: "Tesla", model: "Model Y", type: "suv", fuel: "electric", budget: "high", origin: "usa", tags: ["family", "ev"] },
  { brand: "BYD", model: "Atto 3", type: "suv", fuel: "electric", budget: "mid", origin: "china", tags: ["family", "ev"] },
  { brand: "Geely", model: "Coolray", type: "suv", fuel: "gas", budget: "mid", origin: "china", tags: ["city"] },
  { brand: "Chery", model: "Tiggo 7", type: "suv", fuel: "gas", budget: "mid", origin: "china", tags: ["family"] },
  { brand: "MG", model: "4", type: "hatch", fuel: "electric", budget: "mid", origin: "china", tags: ["city", "ev"] },
  { brand: "BMW", model: "3 Series", type: "sedan", fuel: "gas", budget: "high", origin: "germany", tags: ["sport", "luxury"] },
  { brand: "Mercedes-Benz", model: "C-Class", type: "sedan", fuel: "gas", budget: "high", origin: "germany", tags: ["luxury", "comfort"] },
  { brand: "Audi", model: "A4", type: "sedan", fuel: "gas", budget: "high", origin: "germany", tags: ["luxury", "tech"] },
  { brand: "Lexus", model: "RX", type: "suv", fuel: "hybrid", budget: "high", origin: "japan", tags: ["luxury", "family"] },
  { brand: "Volvo", model: "XC60", type: "suv", fuel: "hybrid", budget: "high", origin: "sweden", tags: ["safe", "family"] }
];

function imageProxyFor(brand, model) {
  const qs = new URLSearchParams({
    brand: String(brand || ""),
    model: String(model || "")
  });
  return `${IMAGE_PROXY_BASE}?${qs.toString()}`;
}

function normalizeAnswersText(answers) {
  if (Array.isArray(answers)) {
    return answers.map((a) => `${a?.question || ""} ${a?.answer || ""}`).join(" ").toLowerCase();
  }
  return JSON.stringify(answers || {}).toLowerCase();
}

function detectMonthlyBudget(text) {
  const matches = [...text.matchAll(/(\d{2,4})[^\\n]{0,10}month/g)];
  if (!matches.length) return null;
  const nums = matches
    .map((m) => parseInt(m[1], 10))
    .filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function detectBudgetTier(text) {
  const monthly = detectMonthlyBudget(text);
  if (monthly !== null) {
    if (monthly <= 600) return "low";
    if (monthly <= 1000) return "mid";
    return "high";
  }
  if (/(cheap|budget|low|affordable|economy)/.test(text)) return "low";
  if (/(luxury|premium|performance|expensive)/.test(text)) return "high";
  return "mid";
}

function buildMockPicks(answers) {
  const text = normalizeAnswersText(answers);
  const wants = {
    electric: /(electric|ev|battery)/.test(text),
    hybrid: /(hybrid)/.test(text),
    gas: /(gas|petrol)/.test(text),
    suv: /(suv|crossover|family|kids|space|spacious)/.test(text),
    truck: /(truck|pickup|towing)/.test(text),
    hatch: /(hatch|compact|city)/.test(text),
    sedan: /(sedan|saloon|comfort|quiet|luxury)/.test(text),
    sport: /(sport|performance|fast)/.test(text),
    city: /(city|suburb|urban|commute)/.test(text),
    china: /(china|chinese)/.test(text),
    japan: /(japan|japanese)/.test(text),
    korea: /(korea|korean)/.test(text),
    germany: /(german|germany)/.test(text)
  };

  const budgetTier = detectBudgetTier(text);

  function scoreCar(car) {
    let score = 0;
    if (wants.electric && car.fuel === "electric") score += 4;
    if (wants.hybrid && car.fuel === "hybrid") score += 3;
    if (wants.gas && car.fuel === "gas") score += 2;
    if (wants.suv && car.type === "suv") score += 3;
    if (wants.truck && car.type === "truck") score += 3;
    if (wants.hatch && car.type === "hatch") score += 2;
    if (wants.sedan && car.type === "sedan") score += 2;
    if (wants.sport && car.tags?.includes("sport")) score += 2;
    if (wants.city && car.tags?.includes("city")) score += 1;
    if (budgetTier && car.budget === budgetTier) score += 2;
    if (wants.china && car.origin === "china") score += 4;
    if (wants.japan && car.origin === "japan") score += 3;
    if (wants.korea && car.origin === "korea") score += 3;
    if (wants.germany && car.origin === "germany") score += 3;
    return score;
  }

  const filterIfEnough = (list, predicate) => {
    const filtered = list.filter(predicate);
    return filtered.length >= 3 ? filtered : list;
  };

  const originFilters = [];
  if (wants.china) originFilters.push("china");
  if (wants.japan) originFilters.push("japan");
  if (wants.korea) originFilters.push("korea");
  if (wants.germany) originFilters.push("germany");

  const fuelFilters = [];
  if (wants.electric) fuelFilters.push("electric");
  if (wants.hybrid) fuelFilters.push("hybrid");
  if (wants.gas) fuelFilters.push("gas");

  const typeFilters = [];
  if (wants.suv) typeFilters.push("suv");
  if (wants.hatch) typeFilters.push("hatch");
  if (wants.sedan) typeFilters.push("sedan");
  if (wants.truck) typeFilters.push("truck");

  let candidates = CAR_CATALOG.slice();
  if (originFilters.length) {
    candidates = filterIfEnough(candidates, (c) => originFilters.includes(c.origin));
  }
  if (fuelFilters.length) {
    candidates = filterIfEnough(candidates, (c) => fuelFilters.includes(c.fuel));
  }
  if (typeFilters.length) {
    candidates = filterIfEnough(candidates, (c) => typeFilters.includes(c.type));
  }

  const ranked = candidates
    .map((car) => ({ car, score: scoreCar(car) }))
    .sort((a, b) => b.score - a.score);

  const picks = [];
  const used = new Set();
  for (const item of ranked) {
    if (picks.length >= 3) break;
    const key = `${item.car.brand}:${item.car.model}`;
    if (used.has(key)) continue;
    picks.push(item.car);
    used.add(key);
  }

  while (picks.length < 3) {
    const extra = CAR_CATALOG[picks.length % CAR_CATALOG.length];
    picks.push(extra);
  }

  return picks.slice(0, 3).map((car) => ({
    brand: car.brand,
    model: car.model,
    reason: car.type === "suv"
      ? "Good space and comfort for daily driving and passengers."
      : car.fuel === "electric"
        ? "Efficient electric option that fits your usage."
        : "Balanced daily driver that fits your preferences.",
    image: imageProxyFor(car.brand, car.model)
  }));
}

// helper: build the system/user prompt for the AI
function buildPromptFromAnswers(answers) {
  const pretty =
    Array.isArray(answers)
      ? answers.map((a) => `- ${a?.question || "Preference"}: ${a?.answer || ""}`).join("\n")
      : JSON.stringify(answers, null, 2);

  // You can shape this however you like.
  // We're giving the model clear instructions so it returns ONLY JSON.
  return `
User preferences:
${pretty}

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
    return buildMockPicks(answers);
  }

  const client = new OpenAI({ apiKey: openaiApiKey });

  // We'll use responses.create with a JSON-ish style. If your OpenAI plan
  // is using a model like "gpt-4o-mini" or "gpt-4.1-mini", swap below.
  // We'll ask for a strict JSON array.
  const prompt = buildPromptFromAnswers(answers);

  const completion = await client.responses.create({
    model: OPENAI_MODEL, // pick a model you have access to
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
    return buildMockPicks(answers);
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
    return buildMockPicks(answers);
  }

  // normalize structure: make sure each car has brand/model/reason/image
  const cleaned = picks.slice(0,3).map((car, idx) => ({
    brand:  String(car.brand  ?? `Car ${idx+1}`),
    model:  String(car.model  ?? ""),
    reason: String(car.reason ?? "No reason provided."),
    image:  String(car.image  ?? "")
  }));

  return cleaned.map((car) => ({
    ...car,
    image: car.image && String(car.image).trim()
      ? car.image
      : imageProxyFor(car.brand, car.model)
  }));
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
    const picks = buildMockPicks(answers);
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
    picks = buildMockPicks(answers);
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
