// netlify/functions/carMatch.js
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // for production, set to your Webflow domains
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

export async function handler(event) {
  // Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "ok" };
  }

  try {
    const isMock = (event.queryStringParameters && event.queryStringParameters.mock) === "1";
    const body = event.body ? JSON.parse(event.body) : {};
    const answers = body.answers || {};

    // Quick mock path for reliability testing
    if (isMock) {
      const mock = [
        { brand: "Tesla", model: "Model 3", reason: "Modern EV with great range" },
        { brand: "Toyota", model: "Corolla", reason: "Reliable and affordable" },
        { brand: "BMW", model: "X3", reason: "Premium compact SUV" }
      ];
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(mock) };
    }

    // === LIVE AI CALL ===
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

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
    `;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "o4-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 500
      })
    });

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";

    let parsed;
    try { parsed = JSON.parse(text); }
    catch {
      const match = text.match(/\[[\s\S]*\]/);
      parsed = match ? JSON.parse(match[0]) : null;
    }

    if (!Array.isArray(parsed) || parsed.length !== 3) {
      parsed = [
        { brand: "Tesla", model: "Model 3", reason: "Fallback: electric and modern" },
        { brand: "BMW", model: "X5", reason: "Fallback: luxury family SUV" },
        { brand: "Toyota", model: "Corolla", reason: "Fallback: affordable and reliable" }
      ];
    }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(parsed) };
  } catch (err) {
    console.error("carMatch error:", err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: String(err.message || err) }) };
  }
}
