export async function handler(event, context) {
  const body = JSON.parse(event.body);
  const answers = body.answers;

  // Example dummy data for now
  const cars = [
    { name: "Tesla Model 3", reason: "Great for electric car lovers" },
    { name: "BMW X5", reason: "Luxury and family-friendly" },
    { name: "Toyota Corolla", reason: "Affordable and reliable" },
  ];

  return {
    statusCode: 200,
    body: JSON.stringify({ matches: cars })
  };
}
