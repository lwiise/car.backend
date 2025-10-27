// netlify/functions/carMatch.js
// Pure OpenAI -> returns 3 picks [{brand, model, reason}]
const { withCors } = require("./cors");

// ---- utilities ----
function ok(body) {
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
function bad(code, msg) {
  return { statusCode: code, headers: { "Content-Type": "text/plain" }, body: String(msg || "") };
}
function samplePicks() {
  return [
    { brand: "Toyota", model: "Corolla Hybrid", reason: "Ultra-reliable, cheap to run, perfect daily." },
    { brand: "Hyundai", model: "Ioniq 5", reason: "Fast charging, roomy cabin, strong value." },
    { brand: "Mazda", model: "CX-5", reason: "Refined ride and great handling for families." }
  ];
}
function abortableFetch(url, opts = {}, ms = 12000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return fetch(url, { ...opts, signal: ac.signal }).finally(() => clearTimeout(t));
}

async function core(event) {
  const url = new URL(event.rawUrl || `https://${event.headers.host}${event.path}`);
  const method = event.httpMethod || event.requestContext?.http?.method || "GET";
  const wantMock = url.searchParams.get("mock") === "1";

  // GET ?mock=1 quick test path (no body needed)
  if (method === "GET" && wantMock) return ok(samplePicks());

  if (method !== "POST") return bad(405, "POST only");

  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch { return bad(400, "Invalid JSON body"); }
  const answers = payload.answers || {};

  // If key missing or explicit mock requested via POST -> serve sample
  if (!process.env.OPENAI_API_KEY || wantMock) return ok(samplePicks());

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const sys =
    "You are a car-matching assistant. Return ONLY JSON with an array 'picks' of exactly 3 items, each having 'brand', 'model', and 'reason' (1–2 sentences). Do not include markdown.";

  const body = {
    model,
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: sys },
      {
        role: "user",
        content:
          "User answers (JSON):\n" +
          JSON.stringify(answers, null, 2) +
          "\n\nReturn strictly: { \"picks\": [ {\"brand\":\"\",\"model\":\"\",\"reason\":\"\"}, ... ] }"
      }
    ]
  };

  let resp;
  try {
    resp = await abortableFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(body)
    }, 12000);
  } catch (e) {
    // Network/timeout -> safe fallback
    return ok(samplePicks());
  }

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    // If OpenAI rejects, still fallback to sample so UI never blocks
    return ok(samplePicks());
  }

  let data;
  try { data = await resp.json(); } catch { return ok(samplePicks()); }

  // Parse the model’s JSON content
  try {
    const raw = data.choices?.[0]?.message?.content || "{}";
    const obj = JSON.parse(raw);
    const picks = Array.isArray(obj?.picks) ? obj.picks.slice(0, 3) : samplePicks();
    return ok(picks);
  } catch {
    return ok(samplePicks());
  }
}

// Wrap with CORS (uses your existing cors.js)
exports.handler = withCors(core, { credentials: true });
