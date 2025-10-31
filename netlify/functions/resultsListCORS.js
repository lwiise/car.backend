// netlify/functions/resultsListCORS.js
import cors, { json } from "./cors.js";

export const handler = cors(async (event) => {
  // GET only for now
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method Not Allowed" });
  }

  // auth info we MAY receive
  const bearer = event.headers?.authorization || "";
  const uid    = event.headers?.["x-user-id"]    || "";
  const email  = event.headers?.["x-user-email"] || "";

  // pagination from query
  const qs = event.queryStringParameters || {};
  const limit  = parseInt(qs.limit  || "10", 10);
  const offset = parseInt(qs.offset || "0", 10);

  // MOCK single latest + maybe older
  const nowISO = new Date().toISOString();
  const mockTop3 = [
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

  const fakeAnswers = {
    budget: "20000-30000",
    fuel: "diesel",
    seats: "5",
    purpose: "daily + weekend trips",
    _meta: { demo: true }
  };

  // Pretend we have 1 record, id=1
  const items = [
    {
      id: 1,
      created_at: nowISO,
      top3: mockTop3,
      answers: fakeAnswers
    }
  ];

  // Just slice in case they ask offset>0
  const paged = items.slice(offset, offset + limit);

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: paged })
  };
});
