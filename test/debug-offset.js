const path = require("path");
const V = require(path.join(__dirname, "..", "js", "engine.js"));

const srcW = 1737, H = 1, N = 10;
const plan = V.planCanvas(srcW, H, N, { mode: "native" });
console.log("plan:", JSON.stringify(plan));

// flat case
const flat = new Uint8Array(srcW).fill(90);
console.log("flat best:", V.bestOffset(flat, srcW, H, plan), "center:", plan.cropX);

// lone edge at 349
const g = new Uint8Array(srcW);
g[349] = 255;
for (let d = -8; d <= 8; d++) {
  const x0 = plan.cropX + d;
  let score = 0;
  for (let i = 1; i < N; i++) score += V.seamCost(g, srcW, H, x0 + i * plan.sw);
  console.log("offset", x0, "score", score.toFixed(1));
}
console.log("best:", V.bestOffset(g, srcW, H, plan));
