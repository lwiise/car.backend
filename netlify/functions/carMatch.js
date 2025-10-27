import cors from "./cors.js";
import { json } from "./_supabase.js";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export const handler = cors(async (event) => {
  const body = (() => { try { return JSON.parse(event.body || "{}"); } catch { return {}; } })();
  const answers = body.answers || {};

  if (String(event.queryStringParameters?.mock || "") === "1") {
    return json([
      { brand: "Geely", model: "Emgrand EV", reason: "Affordable EV with good range and space." },
      { brand: "BYD", model: "Han EV", reason: "Impressive range and features within budget." },
      { brand: "Changan", model: "Eado EV", reason: "Great value electric car for city use." }
    ]);
  }

  const sys = `You pick 3 currently-available car models that fit the user's constraints.
Return STRICT JSON array with exactly 3 objects: [{"brand":"..","model":"..","reason":".."}].
No commentary, only JSON.`;

  const user = "Answers: " + JSON.stringify(answers);

  try {
    const chat = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    const text = chat.choices?.[0]?.message?.content?.trim() || "[]";
    let data;
    try { data = JSON.parse(text); } catch {
      const m = text.match(/\[[\s\S]*\]/);
      data = m ? JSON.parse(m[0]) : [];
    }

    if (!Array.isArray(data) || data.length === 0) {
      return json([{ brand: "Toyota", model: "Corolla", reason: "Reliable default when uncertain." }], 200);
    }
    return json(data, 200);
  } catch (err) {
    return json({ error: String(err?.message || err) }, 500);
  }
});
