// netlify/functions/carMatch.js

// Optional: lock down the allowed origin via env var on Netlify (recommended).
// In Netlify → Site settings → Environment variables, set ALLOWED_ORIGIN to your Webflow domain,
// e.g. "https://your-site.webflow.io" or "https://cars.yourdomain.com".
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

export async function handler(event, context) {
  // --- 1) CORS headers + preflight
  const corsHeaders = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (event.httpMethod === "OPTIONS") {
    // Preflight: no body, just headers
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  try {
    // --- 2) Parse input safely
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid JSON body" })
      };
    }

    const answers = body.answers ?? null;
    if (!answers || (typeof answers !== "object" && !Array.isArray(answers))) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing or invalid `answers`" })
      };
    }

    // --- 3) Build your original prompt (unchanged in spirit)
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

    // --- 4) Call OpenAI (same model you used)
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "o4-mini",              // keep your model
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 500
      })
    });

    if (!resp.ok) {
      const errTxt = await safeText(resp);
      return {
        statusCode: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Upstream model error", details: errTxt })
      };
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content || "";

    // --- 5) Parse AI output as JSON (with your fallback approach)
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\[.*\]/s);
      parsed = match ? JSON.parse(match[0]) : [];
    }

    // Normalize to exactly 3
    if (!Array.isArray(parsed)) parsed = [];
    parsed = parsed.filter(isValidCar).slice(0, 3);

    // Fallback if needed (matches your original idea)
    if (parsed.length !== 3) {
      parsed = [
        { brand: "Tesla", model: "Model 3", reason: "Fallback: electric and modern" },
        { brand: "BMW", model: "X5", reason: "Fallback: luxury family SUV" },
        { brand: "Toyota", model: "Corolla", reason: "Fallback: affordable and reliable" }
      ];
    }

    // --- 6) Success response with CORS
    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(parsed)
    };

  } catch (error) {
    console.error("Function error:", error);
    // --- 7) Error response with CORS
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message || "Server error" })
    };
  }
}

// Helpers
function isValidCar(x) {
  return x && typeof x === "object"
    && typeof x.brand === "string" && x.brand.trim()
    && typeof x.model === "string" && x.model.trim()
    && typeof x.reason === "string" && x.reason.trim();
}

async function safeText(res) {
  try { return await res.text(); } catch { return ""; }
}

