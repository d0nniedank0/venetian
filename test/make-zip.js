/* E2E-1: buildZip output must be readable by a real unzipper (Python's zipfile). */
const fs = require("fs");
const path = require("path");
const Z = require(path.join(__dirname, "..", "js", "zip.js"));

const dir = path.join(__dirname, "zipcheck");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const files = [];
for (let i = 1; i <= 3; i++) {
  const data = new Uint8Array(1000 * i);
  for (let j = 0; j < data.length; j++) data[j] = (j * i) & 0xff;
  files.push({ name: `strips-${String(i).padStart(2, "0")}.png`, data });
}
fs.writeFileSync(path.join(dir, "strips.zip"), Buffer.from(Z.buildZip(files)));
console.log("wrote", path.join(dir, "strips.zip"));
