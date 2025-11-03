// netlify/functions/car-chat.js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // same key you already use for the quiz
});

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        ...HEADERS,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

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
Ask about budget, main usage (city, family, long trips, off-road), fuel type,
transmission, and brand preferences. Suggest 1–3 cars and explain briefly why
each one fits. If you don't know exact models/prices, stay general and DO NOT
invent fake models.
        `.trim(),
      },
      ...history,
      { role: "user", content: message },
    ];

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini", // ✅ same family you use in the quiz
      messages,
      temperature: 0.6,
    });

    const reply =
      response.choices?.[0]?.message?.content ||
      "Sorry, something went wrong on the AI side.";

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
}
