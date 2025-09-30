// netlify/functions/carMatch.js

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*"; // set to your Webflow domain in Netlify env for production

export async function handler(event, context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  try {
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { error: "Invalid JSON body" }, corsHeaders);
    }

    const answers = body.answers ?? null;
    if (!answers || (typeof answers !== "object" && !Array.isArray(answers))) {
      return json(400, { error: "Missing or invalid `answers`" }, corsHeaders);
    }

    const prompt = `
You are a car recommendation engine.
The user answered a quiz with: ${JSON.stringify(answers, null, 2)}.

Your task:
- Suggest exactly 3 cars.
- For each car, return: brand, model, and reason (1 short sentence).
- Return ONLY valid JSON as an array. Example:
[
  {"brand":"Tesla","model":"Model 3","reason":"Affordable entry-level electric car"},
  {"brand":"BMW","model":"X5","reason":"Luxury SUV with family space"},
  {"brand":"Toyota","model":"Corolla","reason":"Reliable and economical"}
]
`.trim();

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "o4-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 500
      })
    });

    if (!resp.ok) {
      const details = await safeText(resp);
      return json(502, { error: "Upstream model error", details }, corsHeaders);
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\[.*\]/s);
      parsed = match ? JSON.parse(match[0]) : [];
    }

    parsed = Array.isArray(parsed) ? parsed.filter(isValidCar).slice(0, 3) : [];

    if (parsed.length !== 3) {
      parsed = [
        { brand: "Tesla", model: "Model 3", reason: "Fallback: electric and modern" },
        { brand: "BMW", model: "X5", reason: "Fallback: luxury family SUV" },
        { brand: "Toyota", model: "Corolla", reason: "Fallback: affordable and reliable" }
      ];
    }

    return json(200, parsed, corsHeaders);
  } catch (error) {
    console.error("Function error:", error);
    return json(500, { error: error.message || "Server error" }, corsHeaders);
  }
}

function isValidCar(x) {
  return x && typeof x === "object"
    && typeof x.brand === "string" && x.brand.trim()
    && typeof x.model === "string" && x.model.trim()
    && typeof x.reason === "string" && x.reason.trim();
}

function json(statusCode, payload, headers) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload)
  };
}

async function safeText(res) {
  try { return await res.text(); } catch { return ""; }
}
