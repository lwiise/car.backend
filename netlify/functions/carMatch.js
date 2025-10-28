// netlify/functions/carMatch.js
const cors = require("./cors");
const { parseJSON } = require("./_supabase");
const OpenAI = require("openai");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function handler(event) {
  const body = parseJSON(event.body);
  const answers = body?.answers || {};
  const nowSalt = new Date().toISOString(); // reduce any caching

  // Allow ?mock=1 for emergency fallback
  const isMock = (event.queryStringParameters || {}).mock === "1";

  async function callOpenAI() {
    const client = new OpenAI({ apiKey: OPENAI_API_KEY });
    const sys = `You are a car-matching assistant. 
Return ONLY valid JSON array of 3 items: 
[{brand, model, reason, image?}].
Keep reasons 12-25 words. If unsure, make reasonable picks from widely available models.`;
    const user = `User answers (salt ${nowSalt}): ${JSON.stringify(answers)}`;

    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user }
      ],
      response_format: { type: "json_object", schema: { type: "object", properties: { picks: { type: "array" } } } }
    });

    // try to parse { picks: [...] }
    const content = res.choices?.[0]?.message?.content || "";
    let parsed;
    try { parsed = JSON.parse(content); } catch { parsed = null; }
    const picks = Array.isArray(parsed?.picks) ? parsed.picks : [];

    if (picks.length >= 3) return picks.slice(0,3);

    // last resort: try to extract an array directly
    try {
      const m = content.match(/\[[\s\S]*\]$/);
      if (m) {
        const arr = JSON.parse(m[0]);
        if (Array.isArray(arr) && arr.length) return arr.slice(0,3);
      }
    } catch {}
    throw new Error("could_not_parse_openai");
  }

  function fallback() {
    return [
      { brand: "Toyota", model: "Camry", reason: "Balanced reliability, cost, and space for daily and family needs." },
      { brand: "Honda", model: "Civic", reason: "Efficient, easy to park, and strong value for city and highway use." },
      { brand: "Mazda", model: "CX-5", reason: "Comfortable ride with upscale feel and confident handling." },
    ];
  }

  try {
    const picks = (isMock || !OPENAI_API_KEY) ? fallback() : await callOpenAI();
    return { statusCode: 200, body: JSON.stringify(picks) };
  } catch (e) {
    console.warn("carMatch error:", e?.message || e);
    // Keep the app flowing
    return { statusCode: 200, body: JSON.stringify(fallback()) };
  }
}

exports.handler = cors(handler);
