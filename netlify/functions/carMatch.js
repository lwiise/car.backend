import cors from './cors.js';
// netlify/functions/carMatch.js
const cors = require("./cors");
const { parseJSON } = require("./_supabase");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function fallback() {
  return [
    { brand: "Toyota", model: "Camry", reason: "Balanced reliability and cost for daily and family use." },
    { brand: "Honda", model: "Civic", reason: "Efficient, easy to park, and strong value in cities." },
    { brand: "Mazda", model: "CX-5", reason: "Comfortable ride with upscale feel and confident handling." }
  ];
}

async function handler(event) {
  const body = parseJSON(event.body);
  const answers = body?.answers || {};
  const qs = event.queryStringParameters || {};
  const wantMock = qs.mock === "1";

  async function callOpenAI() {
    if (!OPENAI_API_KEY) throw new Error("no_openai_key");
    let OpenAI;
    try { OpenAI = require("openai"); } catch { throw new Error("no_openai_pkg"); }

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });
    const sys = `You are a car-matching assistant.
Return ONLY JSON array of 3 items: [{brand, model, reason, image?}]. 
Reasons 12–25 words.`;
    const user = `User answers: ${JSON.stringify(answers)}`;

    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.6,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user }
      ]
    });

    const content = res.choices?.[0]?.message?.content || "";
    // try parse array directly
    try {
      const arr = JSON.parse(content);
      if (Array.isArray(arr) && arr.length) return arr.slice(0, 3);
    } catch {}

    // or scrape last JSON array
    const m = content.match(/\[[\s\S]*\]$/);
    if (m) {
      const arr = JSON.parse(m[0]);
      if (Array.isArray(arr) && arr.length) return arr.slice(0, 3);
    }
    throw new Error("bad_openai_format");
  }

  try {
    const picks = wantMock ? fallback() : await callOpenAI().catch(() => fallback());
    return { statusCode: 200, body: JSON.stringify(picks) };
  } catch (e) {
    console.warn("carMatch error:", e?.message || e);
    return { statusCode: 200, body: JSON.stringify(fallback()) };
  }
}

exports.handler = cors(handler);
