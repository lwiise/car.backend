// ESM Netlify function
import cors from "./cors.js";

// ------------------ helpers ------------------
function parseJSONSafe(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function extractJSONArray(text) {
  // 1) try whole string
  const asObj = parseJSONSafe(text);
  if (Array.isArray(asObj)) return asObj;
  if (asObj && typeof asObj === "object") {
    const firstArr = Object.values(asObj).find(v => Array.isArray(v));
    if (firstArr) return firstArr;
  }
  // 2) try last bracketed array in content
  const m = text?.match(/\[[\s\S]*\]$/);
  if (m) {
    const arr = parseJSONSafe(m[0]);
    if (Array.isArray(arr)) return arr;
  }
  return null;
}

// very light normalization to feed the model a clean summary
function normalizeAnswers(a = {}) {
  const out = { ...a };
  // flatten checkboxes if Webflow sent CSV in strings
  ["q6_features","q9_brands"].forEach(k => {
    if (typeof out[k] === "string" && out[k].includes(",")) {
      out[k] = out[k].split(",").map(s => s.trim()).filter(Boolean);
    }
  });
  return out;
}

// dynamic fallback that uses answers (NOT a fixed list)
function dynamicFallback(answers = {}) {
  const wantFuel = String(answers.q3_fuel || "").toLowerCase();
  const body = String(answers.q1_bodyType || "").toLowerCase();
  const budgetText = String(answers.q2_budget || "");
  const nums = (budgetText.match(/\d+/g) || []).map(n => parseInt(n,10));
  const maxBudget = nums.length ? Math.max(...nums) * 1000 : Infinity;

  // small candidate pools to vary by fuel/body/budget
  const banks = {
    evSedan: [
      { brand:"Tesla", model:"Model 3" },
      { brand:"Hyundai", model:"Ioniq 6" },
      { brand:"Polestar", model:"2" }
    ],
    evSUV: [
      { brand:"Tesla", model:"Model Y" },
      { brand:"Hyundai", model:"Ioniq 5" },
      { brand:"Kia", model:"EV6" },
      { brand:"Ford", model:"Mustang Mach-E" }
    ],
    hybridSUV: [
      { brand:"Toyota", model:"RAV4 Hybrid" },
      { brand:"Honda", model:"CR-V Hybrid" },
      { brand:"Kia", model:"Sportage Hybrid" }
    ],
    gasSedan: [
      { brand:"Toyota", model:"Camry" },
      { brand:"Honda", model:"Accord" },
      { brand:"Hyundai", model:"Sonata" }
    ],
    truck: [
      { brand:"Ford", model:"F-150" },
      { brand:"Toyota", model:"Tundra" },
      { brand:"RAM", model:"1500" }
    ]
  };

  let pool = [];
  if (wantFuel.includes("electric")) {
    pool = body.includes("suv") || body.includes("cross") ? banks.evSUV : banks.evSedan;
  } else if (wantFuel.includes("hybrid")) {
    pool = body.includes("suv") ? banks.hybridSUV : banks.gasSedan;
  } else if (body.includes("truck") || body.includes("pickup")) {
    pool = banks.truck;
  } else {
    pool = banks.gasSedan;
  }

  // pick top 3 (heuristic: cheaper first if budget capped)
  const picks = pool
    .map((c, i) => ({ ...c, priceHint: [22000,28000,32000,38000,42000,47000,52000][i] || 35000 }))
    .sort((a,b) => {
      const aa = a.priceHint || 999999, bb = b.priceHint || 999999;
      const aIn = aa <= maxBudget ? 0 : 1;
      const bIn = bb <= maxBudget ? 0 : 1;
      return aIn - bIn || aa - bb;
    })
    .slice(0,3)
    .map(c => ({
      brand: c.brand,
      model: c.model,
      reason: "Good fit based on your fuel/body/budget preferences."
    }));

  // Always return 3
  while (picks.length < 3) picks.push({ brand:"Toyota", model:"Corolla", reason:"Reliable baseline recommendation." });
  return picks.slice(0,3);
}

// ------------------ OpenAI call ------------------
async function callOpenAI(answers) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  const system = `
You are a car-matching assistant.
Return EXACTLY a JSON array of 3 objects: [{"brand":"…","model":"…","reason":"…"}].
Rules:
- Use well-known production cars (no concept or non-existent trims).
- Tailor picks to the user's preferences (body, fuel, budget, usage, features, range).
- "reason" must be 10–20 words, friendly, concrete (budget/range/charging/space/etc). No extra commentary.
- No markdown, no prose, no keys other than brand/model/reason.
`;

  const userContent = `
User preferences (raw):
${JSON.stringify(normalizeAnswers(answers), null, 2)}

Constraints:
- Output MUST be pure JSON array (no wrapper object, no extra text).
- If budget provided, prefer models at or under that range.
- If EV+range/charge needed, respect those constraints.
`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",     // your requested model
      temperature: 0.6,         // some variety but still grounded
      messages: [
        { role: "system", content: system.trim() },
        { role: "user", content: userContent.trim() }
      ]
    })
  });

  if (!res.ok) {
    const t = await res.text().catch(()=> "");
    throw new Error(`OpenAI HTTP ${res.status} ${t}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  const arr = extractJSONArray(content);
  if (!arr || arr.length < 3) throw new Error("Model did not return a valid array of 3 items");

  // sanitize to exact shape + trim reason
  const top3 = arr.slice(0,3).map(x => ({
    brand: String(x?.brand || "").trim(),
    model: String(x?.model || "").trim(),
    reason: String(x?.reason || "").trim().slice(0, 240)
  }));

  // guard against empties
  if (top3.some(x => !x.brand || !x.model)) {
    throw new Error("Model returned empty brand/model");
  }

  return top3;
}

// ------------------ Handler ------------------
export const handler = cors(async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: { "Content-Type":"text/plain" }, body: "Method Not Allowed" };
    }

    // Allow quick manual testing with ?mock=1
    if (event.queryStringParameters?.mock === "1") {
      return {
        statusCode: 200,
        headers: { "Content-Type":"application/json", "x-source": "mock" },
        body: JSON.stringify([
          { brand: "Tesla", model: "Model 3", reason: "Quiet, fast-charge EV that fits many budgets and commutes." },
          { brand: "Toyota", model: "RAV4 Hybrid", reason: "Efficient family SUV with space and great reliability." },
          { brand: "Kia", model: "EV6", reason: "Modern EV with very fast charging and long range." },
        ])
      };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const answers = body.answers || {};

    // 1) Try OpenAI
    try {
      const picks = await callOpenAI(answers);
      return {
        statusCode: 200,
        headers: { "Content-Type":"application/json", "x-source": "openai" },
        body: JSON.stringify(picks)
      };
    } catch (e) {
      console.error("OpenAI path failed:", e?.message || e);
      // 2) Dynamic fallback (varies with answers)
      const picks = dynamicFallback(answers);
      return {
        statusCode: 200,
        headers: { "Content-Type":"application/json", "x-source": "fallback" },
        body: JSON.stringify(picks)
      };
    }

  } catch (err) {
    console.error("carMatch fatal:", err);
    return { statusCode: 500, headers: { "Content-Type":"text/plain" }, body: "Internal Server Error" };
  }
});
