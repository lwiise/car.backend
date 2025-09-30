// netlify/functions/carMatch.js

// Allow one or more origins via env var ALLOWED_ORIGIN (comma-separated).
// For you we default to your Webflow domain if not set.
const ORIGINS = (process.env.ALLOWED_ORIGIN || "https://scopeonride.webflow.io")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

function corsHeaders(origin) {
  const allow = ORIGINS.includes(origin) ? origin : ORIGINS[0] || "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
  };
}

export async function handler(event) {
  const headers = corsHeaders(event.headers?.origin || "");

  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    // Parse
    let body;
    try { body = JSON.parse(event.body || "{}"); }
    catch { return json(400, { error: "Invalid JSON body" }, headers); }

    const answers = body.answers ?? null;
    if (!answers || (typeof answers !== "object" && !Array.isArray(answers))) {
      return json(400, { error: "Missing or invalid `answers`" }, headers);
    }

    // ---- MOCK MODE (works even without OPENAI_API_KEY) ----
    const url = new URL(event.rawUrl || `http://x${event.path}`);
    const mockRequested = url.searchParams.get("mock") === "1";
    const missingKey = !process.env.OPENAI_API_KEY || !process.env.OPENAI_API_KEY.trim();

    if (mockRequested || missingKey) {
      const picks = [
        { brand: "Tesla",  model: "Model 3", reason: "Electric sedan with great tech" },
        { brand: "Toyota", model: "RAV4",    reason: "Reliable compact SUV for families" },
        { brand: "BMW",    model: "X1",      reason: "Premium feel in a small SUV" }
      ];
      return json(200, picks, headers);
    }

    // ---- REAL OPENAI CALL ----
    const prompt = `
You are a car recommendation engine.
The user answered a quiz with: ${JSON.stringify(answers, null, 2)}.

Return exactly 3 items as pure JSON array like:
[
  {"brand":"Tesla","model":"Model 3","reason":"..."},
  {"brand":"Toyota","model":"RAV4","reason":"..."},
  {"brand":"BMW","model":"X1","reason":"..."}
]
`.trim();

    // Try preferred model then fallback if your account doesn’t have it
    const models = ["o4-mini", "gpt-4o-mini"];
    let data = null, lastErr = "";

    for (const model of models) {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          max_tokens: 500
        })
      });
      if (resp.ok) { data = await resp.json(); break; }
      lastErr = await safeText(resp);
    }

    if (!data) {
      return json(502, { error: "Upstream model error", details: lastErr }, headers);
    }

    const text = data?.choices?.[0]?.message?.content || "";
    let picks;
    try { picks = JSON.parse(text); }
    catch {
      const match = text.match(/\[.*\]/s);
      picks = match ? JSON.parse(match[0]) : [];
    }

    picks = Array.isArray(picks) ? picks.filter(isValidCar).slice(0, 3) : [];
    if (picks.length !== 3) {
      picks = [
        { brand: "Tesla", model: "Model 3", reason: "Fallback: electric and modern" },
        { brand: "Toyota", model: "Corolla", reason: "Fallback: reliable and economical" },
        { brand: "BMW", model: "X5", reason: "Fallback: luxury family SUV" }
      ];
    }

    return json(200, picks, headers);
  } catch (err) {
    console.error("Function error:", err);
    return json(500, { error: err.message || "Server error" }, headers);
  }
}

function isValidCar(x) {
  return x && typeof x === "object"
    && typeof x.brand === "string" && x.brand.trim()
    && typeof x.model === "string" && x.model.trim()
    && typeof x.reason === "string" && x.reason.trim();
}

function json(status, payload, headers) {
  return { statusCode: status, headers, body: JSON.stringify(payload) };
}

async function safeText(res) { try { return await res.text(); } catch { return ""; } }
