// netlify/functions/car-chat.js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // set this in Netlify env vars
});

export async function handler(event) {
  // Allow only POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { message, history = [] } = JSON.parse(event.body || "{}");

    if (!message) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing 'message' in body" }),
      };
    }

    // Build messages array for the model
    const messages = [
      {
        role: "system",
        content: `
You are a friendly car advisor chatbot on a dealership website.
Your job is to help the user pick the best car for them.

Ask clear questions about:
- budget (in the local currency, but accept any)
- main usage (city, long trips, family, off-road, etc.)
- fuel preference (petrol, diesel, hybrid, electric)
- transmission (automatic/manual)
- new vs used, and brand preferences if any.

When you recommend cars:
- Suggest 1 to 3 cars maximum.
- For each car, briefly explain WHY it fits the user (2–3 lines).
- If you don't know a specific model/price, speak generally and say it's an example.
Do NOT invent fake car models.
      `.trim(),
      },
      // previous messages from the user & assistant
      ...history,
      { role: "user", content: message },
    ];

    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini", // or another model you prefer
      messages,
      temperature: 0.6,
    });

    const reply =
      response.choices?.[0]?.message?.content ||
      "Sorry, something went wrong. Try again.";

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        // CORS (adjust the origin to your domain if needed)
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    console.error("car-chat error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error", details: err.message }),
    };
  }
}
