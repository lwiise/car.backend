export async function handler(event, context) {
  try {
    const body = JSON.parse(event.body);
    const answers = body.answers;

    // Build the prompt
    const prompt = `
You are a car recommendation engine.
The user answered a quiz with: ${JSON.stringify(answers, null, 2)}.

Your task:
- Suggest exactly 3 cars.
- For each car, return: brand, model, and reason (1 short sentence).
- Return ONLY valid JSON as an array. Example:
[
  {"brand":"Tesla","model":"Model 3","reason":"Affordable entry-level electric car"},
  {"brand":"BMW","model":"X5","reason":"Luxury SUV with family space"},
  {"brand":"Toyota","model":"Corolla","reason":"Reliable and economical"}
]
    `;

    // Call OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "o4-mini", // 👈 your purchased model
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 500
      })
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    // Try to parse AI output as JSON
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      // Try extracting JSON array if AI adds text
      const match = text.match(/\[.*\]/s);
      parsed = match ? JSON.parse(match[0]) : [];
    }

    // Fallback if parsing fails
    if (!Array.isArray(parsed) || parsed.length !== 3) {
      parsed = [
        { brand: "Tesla", model: "Model 3", reason: "Fallback: electric and modern" },
        { brand: "BMW", model: "X5", reason: "Fallback: luxury family SUV" },
        { brand: "Toyota", model: "Corolla", reason: "Fallback: affordable and reliable" }
      ];
    }

    return {
      statusCode: 200,
      body: JSON.stringify(parsed)
    };

  } catch (error) {
    console.error("Function error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}

