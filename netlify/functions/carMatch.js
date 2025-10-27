// Make sure your package.json has: { "type": "module" }
import cors from "./cors.js";

function mockPicks(answers = {}) {
  // Keep this simple so the client can always get a response during testing
  return [
    { brand: "Toyota", model: "Camry", reason: "Reliable, comfortable daily driver." },
    { brand: "Honda", model: "CR-V", reason: "Space + efficiency for families." },
    { brand: "Tesla", model: "Model 3", reason: "Quiet, electric, great tech." },
  ];
}

export const handler = cors(async (event) => {
  try {
    // Only allow POST (client sends POST)
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: {"Content-Type":"text/plain"}, body: "Method Not Allowed" };
    }

    const qs = event.queryStringParameters || {};
    const body = event.body ? JSON.parse(event.body) : {};
    const answers = body.answers || {};

    // If client calls with ?mock=1 (fallback in your Webflow code),
    // return a deterministic mock so UX keeps working even if upstream is down.
    if (qs.mock) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mockPicks(answers)),
      };
    }

    // TODO: replace this with your real matching logic when ready.
    // For now, we just return the same mock to prove end-to-end works.
    const picks = mockPicks(answers);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(picks),
    };
  } catch (err) {
    console.error("carMatch error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/plain" },
      body: "Internal Server Error",
    };
  }
});
