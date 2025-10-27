// ESM Netlify function – AI-only recommender (no external search APIs)
import cors from "./cors.js";

const MOCK = [
  { brand: "Tesla", model: "Model 3", reason: "Popular EV with quick charging and low running costs." },
  { brand: "Toyota", model: "RAV4 Hybrid", reason: "Efficient, reliable family SUV with good space." },
  { brand: "Kia", model: "EV6", reason: "Modern EV with long range and fast charging." }
];

function safeParseArray(text) {
  try { const j = JSON.parse(text); if (Array.isArray(j)) return j; } catch {}
  const m = text?.match(/\[[\s\S]*\]$/);
  if (m) { try { const j = JSON.parse(m[0]); if (Array.isArray(j)) return j; } catch {} }
  return null;
}

async function callOpenAI(answers) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini"; // set to "gpt-4o" if you want

  const system = `
You are a car-matching assistant. Use your general knowledge (do NOT browse).
Return EXACTLY a JSON array of 3 objects: [{"brand":"…","model":"…","reason":"…"}].
- Pick well-known, currently sold or widely available cars.
- Tailor to the user's fuel, body, budget, range, usage, features.
- Keep "reason" 10–20 words, friendly and concrete.
- No extra text, no wrapping object, no markdown.
`;

  const userContent = [
    {
      type: "text",
      text:
`User answers (use these preferences):
${JSON.stringify(answers, null, 2)}

Produce ONLY the JSON array of three car picks as specified.`
    }
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent }
      ],
      // Strong JSON guard (newer OpenAI format). Falls back to regex if needed.
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "Top3Cars",
          schema: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["brand", "model", "reason"],
              properties: {
                brand: { type: "string" },
                model: { type: "string" },
                reason: { type: "string" }
              }
            }
          },
          strict: true
        }
      }
    })
  });

  if (!res.ok) {
    const t = await res.text().catch(()=> "");
    throw new Error(`OpenAI HTTP ${res.status} ${t}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  let arr = safeParseArray(content);

  // If the model returned an object with embedded array, try to pull it out:
  if (!arr) {
    try {
      const obj = JSON.parse(content);
      const firstArray = Object.values(obj).find(v => Array.isArray(v));
      if (firstArray) arr = firstArray;
    } catch {}
  }
  if (!arr || arr.length !== 3) throw new Error("Could not parse 3-item array from model output");

  // Final cleanup
  return arr.map(x => ({
    brand: String(x.brand || "").slice(0, 80),
    model: String(x.model || "").slice(0, 120),
    reason: String(x.reason || "").slice(0, 240)
  }));
}

export const handler = cors(async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: { "Content-Type": "text/plain" }, body: "Method Not Allowed" };
    }

    // Keep your existing mock param for quick checks
    if (event.queryStringParameters?.mock === "1") {
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(MOCK) };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const answers = body.answers || {};

    try {
      const picks = await callOpenAI(answers);
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(picks) };
    } catch (err) {
      console.error("AI error:", err?.message || err);
      // Graceful fallback so the UI still works
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(MOCK) };
    }
  } catch (e) {
    console.error("carMatch fatal:", e);
    return { statusCode: 500, headers: { "Content-Type": "text/plain" }, body: "Internal Server Error" };
  }
});
