// netlify/functions/carMatch.js

// --- CORS helpers ---
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // (optionally restrict to your Webflow domain)
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

// Netlify (CommonJS) export
exports.handler = async (event) => {
  // ---- Preflight ----
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "ok" };
  }

  try {
    // ---- Read query/body ----
    const qs = event.queryStringParameters || {};
    const isMock = String(qs.mock || "") === "1";

    const body = event.body ? JSON.parse(event.body) : {};
    const answers = body.answers || {};

    // ---- Mock path (used by your frontend fallback) ----
    if (isMock) {
      const mock = [
        { brand: "Tesla",  model: "Model 3", reason: "Modern EV with great range" },
        { brand: "Toyota", model: "Corolla", reason: "Reliable and affordable" },
        { brand: "BMW",    model: "X3",      reason: "Premium compact SUV" }
      ];
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(mock) };
    }

    // ---- Live AI path ----
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    // Keep prompt simple and deterministic
    const prompt = `
You are a car recommendation engine.

User answers (JSON):
${JSON.stringify(answers, null, 2)}

Return EXACTLY 3 recommendations as pure JSON array (no prose),
where each item has: "brand", "model", "reason" (1 short sentence).
Example:
[
  {"brand":"Tesla","model":"Model 3","reason":"Affordable entry-level electric car"},
  {"brand":"BMW","model":"X5","reason":"Luxury SUV with family space"},
  {"brand":"Toyota","model":"Corolla","reason":"Reliable and economical"}
]
`.trim();

    // IMPORTANT: use a valid model name. The old "o4-mini" is invalid.
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // ✅ fixed model
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 500
      })
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text().catch(() => "");
      throw new Error(`OpenAI error ${openaiRes.status}: ${errText || "Unknown"}`);
    }

    const data = await openaiRes.json();
    const content = data?.choices?.[0]?.message?.content || "";

    // Robust JSON extraction (pure JSON or JSON-with-prose)
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\[[\s\S]*\]/);
      parsed = match ? JSON.parse(match[0]) : null;
    }

    // Validate shape: must be an array of exactly 3
    const okArray =
      Array.isArray(parsed) &&
      parsed.length === 3 &&
      parsed.every(
        x =>
          x &&
          typeof x.brand === "string" &&
          typeof x.model === "string" &&
          typeof x.reason === "string"
      );

    const result = okArray
      ? parsed
      : [
          { brand: "Tesla",  model: "Model 3", reason: "Fallback: electric and modern" },
          { brand: "BMW",    model: "X5",      reason: "Fallback: luxury family SUV" },
          { brand: "Toyota", model: "Corolla", reason: "Fallback: affordable and reliable" }
        ];

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(result) };
  } catch (err) {
    console.error("carMatch error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: String(err && err.message ? err.message : err) })
    };
  }
};
