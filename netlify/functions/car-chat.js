// netlify/functions/car-chat.js

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*", // you can replace * with your domain later
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: HEADERS,
      body: "",
    };
  }

  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { message, history = [] } = JSON.parse(event.body || "{}");

    if (!message) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({ error: "Missing 'message' in body" }),
      };
    }

    const messages = [
      {
        role: "system",
        content: `
You are a friendly car advisor chatbot on a dealership website.
Ask about budget, main usage (city, family, long trips, off-road),
fuel type, transmission, and brand preferences.
Suggest 1–3 cars and briefly explain why each fits.
If you don't know exact models/prices, stay general and do NOT invent fake models.
        `.trim(),
      },
      ...history,
      { role: "user", content: message },
    ];

    // Call OpenAI (same key you already use for the quiz)
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.6,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      return {
        statusCode: 500,
        headers: HEADERS,
        body: JSON.stringify({
          error: "OpenAI error",
          details: errText,
        }),
      };
    }

    const data = await openaiRes.json();
    const reply =
      data.choices?.[0]?.message?.content ||
      "Sorry, I could not generate an answer.";

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    console.error("car-chat error:", err);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({
        error: "Server error",
        details: err.message,
      }),
    };
  }
};
