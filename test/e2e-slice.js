/* E2E-2: full pipeline against the real Bittensor artwork.
   decode -> plan -> seam-aware offset -> slice -> reassemble == cropped source. */
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const V = require(path.join(__dirname, "..", "js", "engine.js"));

const SRC = path.join(process.env.LOCALAPPDATA || "", "Temp", "venice", "poster_reassembled.png");
const ALT = "C:/Users/beenco/AppData/Roaming/Hermes/composer-images/Bittensor_Flow_in_Monochrome_3ce7f7.png";
const srcPath = fs.existsSync(SRC) ? SRC : ALT;
if (!fs.existsSync(srcPath)) { console.error("no source image found"); process.exit(1); }

const png = PNG.sync.read(fs.readFileSync(srcPath));
const plane = { width: png.width, height: png.height, data: png.data };
console.log("source:", png.width, "x", png.height);

const N = 10;
const plan = V.planCanvas(png.width, png.height, N, { mode: "native" });
const luma = V.luma(plane);
const x0 = V.bestOffset(luma, plane.width, plane.height, plan);
console.log("plan:", JSON.stringify(plan), "offset:", x0, "(center was", plan.cropX + ")");

const strips = V.slicePixels(plane, plan, x0);
console.log("strips:", strips.length, "each", strips[0].width, "x", strips[0].height);

// reassemble and diff against the cropped source
let mismatches = 0, checked = 0;
for (let i = 0; i < N; i++) {
  const s = strips[i];
  for (let y = 0; y < plan.H; y++) {
    for (let sx = 0; sx < s.width; sx++) {
      const gx = x0 + i * plan.sw + sx;
      for (let b = 0; b < 4; b++) {
        const a = s.data[(y * s.width + sx) * 4 + b];
        const c = plane.data[(y * plane.width + gx) * 4 + b];
        checked++;
        if (a !== c) mismatches++;
      }
    }
  }
}
console.log("reassembly:", checked, "bytes checked,", mismatches, "mismatches");

// seam continuity, same metric used on the Venice post
let seamMax = 0;
for (let i = 1; i < N; i++) {
  const d = V.seamCost(luma, plane.width, plane.height, x0 + i * plan.sw);
  seamMax = Math.max(seamMax, d);
}
console.log("max seam cost at boundaries:", seamMax.toFixed(1), "luma units");
if (mismatches !== 0) { console.error("FAIL"); process.exit(1); }
console.log("E2E-2 OK — pixel-exact slicing on the real artwork");
