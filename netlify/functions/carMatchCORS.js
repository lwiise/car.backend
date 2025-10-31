// netlify/functions/carMatchCORS.js
import cors, { json } from "./cors.js";

// quick mock generator so UI has something to render
function buildMockPicks() {
  return [
    {
      brand: "Mercedes-Benz",
      model: "C-Class",
      reason: "Comfortable daily luxury with balanced cost.",
      image: "https://images.unsplash.com/photo-1503376780353-7e3c06bb6a3a?auto=format&fit=crop&w=800&q=80"
    },
    {
      brand: "BMW",
      model: "3 Series",
      reason: "Sporty feel but still practical and reliable.",
      image: "https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=800&q=80"
    },
    {
      brand: "Audi",
      model: "A4",
      reason: "Tech-forward interior, clean look, safe for long trips.",
      image: "https://images.unsplash.com/photo-1619767886558-efdcf5ca5c12?auto=format&fit=crop&w=800&q=80"
    }
  ];
}

export const handler = cors(async (event) => {
  // We accept POST with { answers: {...} }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    body = {};
  }

  const answers = body.answers || {};
  const mockRequested =
    (event.queryStringParameters && event.queryStringParameters.mock === "1");

  // Here is where REAL logic would go:
  // - use answers to build AI prompt
  // - call OpenAI / DB / whatever
  //
  // For now we will *always* just return mock picks.
  // This guarantees your frontend will get a 200 with an array.
  const picks = buildMockPicks();

  // We give you the exact format your frontend expects: array of cars
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(picks)
  };
});
