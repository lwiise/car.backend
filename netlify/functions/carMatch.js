// netlify/functions/carMatch.js
const { withCors } = require("./cors");

function parseBody(event){ try { return JSON.parse(event.body || "{}"); } catch { return {}; } }

const CARS = [
  { brand: "Tesla", model: "Model 3", reason: "Quick, efficient, low running cost.", tag: "ev" },
  { brand: "Hyundai", model: "Ioniq 5", reason: "Spacious EV with fast charging.", tag: "ev" },
  { brand: "Toyota", model: "Camry", reason: "Reliable & comfortable daily driver.", tag: "sedan" },
  { brand: "Honda", model: "CR-V", reason: "Practical family SUV with great MPG.", tag: "suv" },
  { brand: "BMW", model: "3 Series", reason: "Sporty sedan with premium feel.", tag: "sport" },
  { brand: "Kia", model: "EV6", reason: "Sharp dynamics, long range EV.", tag: "ev" },
  { brand: "Toyota", model: "RAV4 Hybrid", reason: "Efficient SUV with plenty of cargo.", tag: "suv" }
];

function pickByAnswers(answers = {}) {
  const text = JSON.stringify(answers);
  const wantsEV = /ev|electric/i.test(text);
  const wantsSUV = /suv|space|family/i.test(text);
  const sporty   = /sport|performance/i.test(text);

  let pool = CARS.slice();
  if (wantsEV) pool = pool.filter(c => c.tag === "ev");
  else if (wantsSUV) pool = pool.filter(c => c.tag === "suv");
  else if (sporty) pool = pool.filter(c => c.tag === "sport" || c.tag === "sedan");

  if (pool.length < 3) pool = CARS.slice();
  return pool.slice(0, 3);
}

exports.handler = withCors(async (event) => {
  const { answers } = parseBody(event);
  return { statusCode: 200, body: pickByAnswers(answers || {}) };
});
