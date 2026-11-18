"use strict";
/* Engine tests — run with: node --test test/
   Fixtures are real cases: the 1672x941 Bittensor artwork sliced into 10. */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const V = require(path.join(__dirname, "..", "js", "engine.js"));
const Z = require(path.join(__dirname, "..", "js", "zip.js"));
V.buildZip = Z.buildZip; // engine surface exposes the tested zip API

test("native plan crops width to a multiple of N, centered (Bittensor fixture)", () => {
  const p = V.planCanvas(1672, 941, 10, { mode: "native" });
  assert.equal(p.W, 1670);
  assert.equal(p.H, 941);
  assert.equal(p.sw, 167);
  assert.equal(p.cropX, 1); // drops 1 px each side
  assert.equal(p.N, 10);
  assert.equal(p.W % 10, 0);
});

test("fit mode downsamples to the 2048 cap but never upscales", () => {
  const big = V.planCanvas(4000, 2250, 10, { mode: "fit", maxHeight: 2048 });
  assert.equal(big.H, 2048);
  assert.equal(big.W, 3640); // round(4000*2048/2250)=3641 -> floor to multiple of 10
  assert.equal(big.sw, 364);
  assert.equal(big.cropX, 0); // 3641-3640 = 1 -> floor(1/2) = 0
  assert.equal(big.scaleW, 3641); // pre-crop resampled width the app must draw
  const small = V.planCanvas(1672, 941, 10, { mode: "fit", maxHeight: 2048 });
  assert.equal(small.H, 941); // below cap: untouched
  assert.equal(small.W, 1670);
  assert.equal(small.scaleW, 1672); // native scale, crop 1px each side
});

test("plan width is always divisible by N across a spread of sizes", () => {
  const cases = [
    [1672, 941, 4], [1672, 941, 20], [1920, 1080, 10],
    [1080, 1350, 7], [3641, 2048, 9], [800, 600, 3],
  ];
  for (const [w, h, n] of cases) {
    const p = V.planCanvas(w, h, n, { mode: "fit", maxHeight: 2048 });
    assert.equal(p.W % n, 0, `${w}x${h} N=${n}`);
    assert.ok(p.W <= Math.round((w * Math.min(h, 2048)) / h), "never wider than source");
    assert.ok(p.cropX + p.W <= Math.round((w * Math.min(h, 2048)) / h), "crop stays inside");
  }
});

test("sliceBounds covers every pixel exactly once, in order", () => {
  const p = V.planCanvas(1672, 941, 10, { mode: "native" });
  const b = V.sliceBounds(p, p.cropX);
  assert.equal(b.length, 10);
  b.forEach((r, i) => {
    assert.equal(r.x, p.cropX + i * 167);
    assert.equal(r.w, 167);
    assert.equal(r.y, 0);
    assert.equal(r.h, 941);
  });
  assert.equal(b[0].x, 1);
  assert.equal(b[9].x + b[9].w, 1671); // last strip ends at crop right edge
  // contiguity: no gaps, no overlaps
  for (let i = 1; i < b.length; i++) assert.equal(b[i].x, b[i - 1].x + b[i - 1].w);
});

test("seamCost is zero on flat regions", () => {
  const W = 8, H = 2;
  const flat = new Uint8Array(W * H).fill(128);
  for (let x = 0; x <= W; x++) assert.equal(V.seamCost(flat, W, H, x), 0);
});

test("seamCost peaks exactly at a vertical edge", () => {
  const W = 8, H = 2;
  const g = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 4; x < W; x++) g[y * W + x] = 255;
  assert.equal(V.seamCost(g, W, H, 2), 0);
  assert.equal(V.seamCost(g, W, H, 4), 255); // the edge
  assert.equal(V.seamCost(g, W, H, 5), 0);
  assert.equal(V.seamCost(g, W, H, 0), 0); // canvas edge: nothing cut
  assert.equal(V.seamCost(g, W, H, 8), 0);
});

test("bestOffset shifts the crop so no boundary cuts the high-detail edge", () => {
  const srcW = 1737, H = 1, N = 10;
  const plan = V.planCanvas(srcW, H, N, { mode: "native" });
  assert.equal(plan.cropX, 3); // centered crop
  const g = new Uint8Array(srcW * H);
  g[349] = 255; // lone bright edge between cols 348|349 — dead center of boundary 2
  const x0 = V.bestOffset(g, srcW, H, plan);
  for (let i = 1; i < N; i++) {
    assert.ok(
      V.seamCost(g, srcW, H, x0 + i * plan.sw) < 10,
      `boundary ${i} at ${x0 + i * plan.sw} cuts the edge`
    );
  }
  assert.equal(x0, 2); // nearest shift to center that clears both 349 and 350
});

test("bestOffset stays at center when boundaries already land on quiet pixels", () => {
  const srcW = 1737, H = 1, N = 10;
  const plan = V.planCanvas(srcW, H, N, { mode: "native" });
  const flat = new Uint8Array(srcW * H).fill(90);
  assert.equal(V.bestOffset(flat, srcW, H, plan), plan.cropX);
});

test("fileName zero-pads to strip count width", () => {
  assert.equal(V.fileName("strip", 1, 10), "strip-01.png");
  assert.equal(V.fileName("strip", 10, 10), "strip-10.png");
  assert.equal(V.fileName("art", 7, 20), "art-07.png");
  assert.equal(V.fileName("art", 20, 2), "art-20.png");
});

test("planCanvas rejects nonsense inputs", () => {
  assert.throws(() => V.planCanvas(1672, 941, 0, {}), /strip count/);
  assert.throws(() => V.planCanvas(1672, 941, 21, {}), /strip count/);
  assert.throws(() => V.planCanvas(1672, 941, 2.5, {}), /strip count/);
  assert.throws(() => V.planCanvas(5, 100, 10, {}), /narrow/);
  assert.throws(() => V.planCanvas(100, 0, 10, {}), /height/);
});

test("luma converts an RGBA plane to per-pixel brightness", () => {
  // one white, one black pixel
  const plane = { width: 2, height: 1, data: new Uint8ClampedArray([255,255,255,255, 0,0,0,255]) };
  const l = V.luma(plane);
  assert.ok(Math.abs(l[0] - 255) < 0.01);
  assert.ok(Math.abs(l[1]) < 0.01);
});

test("slicePixels cuts an RGBA plane into N exact strips", () => {
  // 8x2 RGBA: column x gets value x in R
  const W = 8, H = 2;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    data[i] = x; data[i+1] = 100; data[i+2] = 50; data[i+3] = 255;
  }
  const plan = { W, H, sw: 2, N: 4 };
  const strips = V.slicePixels({ width: W, height: H, data }, plan, 0);
  assert.equal(strips.length, 4);
  strips.forEach((s, i) => {
    assert.equal(s.width, 2);
    assert.equal(s.height, 2);
    assert.equal(s.data.length, 2 * 2 * 4);
    // first pixel of each strip carries its source x
    assert.equal(s.data[0], i * 2);
  });
  // reassembly is exact
  let x = 0;
  for (const s of strips) {
    for (let sx = 0; sx < s.width; sx++, x++) {
      for (let y = 0; y < H; y++) {
        const src = (y * s.width + sx) * 4, dst = (y * W + x) * 4;
        for (let b = 0; b < 4; b++) assert.equal(s.data[src + b], data[dst + b]);
      }
    }
  }
});

test("slicePixels honors a shifted crop offset", () => {
  const W = 10, H = 1;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let x = 0; x < W; x++) data[x * 4] = x;
  const plan = { W: 8, H, sw: 2, N: 4 };
  const strips = V.slicePixels({ width: W, height: H, data }, plan, 1); // cropX = 1
  assert.equal(strips[0].data[0], 1);
  assert.equal(strips[3].data[0], 7);
});

test("buildZip emits a valid store-only ZIP structure", () => {
  const files = [
    { name: "a-01.png", data: new Uint8Array([1, 2, 3]) },
    { name: "a-02.png", data: new Uint8Array([9, 8, 7, 6]) },
  ];
  const zip = V.buildZip(files);
  assert.ok(zip instanceof Uint8Array);
  assert.ok(zip.length > 0);
  // local file header magic
  assert.equal(String.fromCharCode(zip[0], zip[1], zip[2], zip[3]), "PK\u0003\u0004");
  // names present
  const ascii = Buffer.from(zip).toString("latin1");
  assert.ok(ascii.includes("a-01.png"));
  assert.ok(ascii.includes("a-02.png"));
  // end of central directory magic at the tail
  const tail = ascii.slice(-22);
  assert.ok(tail.includes("PK\u0005\u0006"), "EOCD record at end");
});

test("buildZip records sizes and counts in the central directory", () => {
  const files = [{ name: "x.png", data: new Uint8Array([10, 20, 30, 40]) }];
  const zip = V.buildZip(files);
  const b = Buffer.from(zip);
  const ascii = b.toString("latin1");
  // EOCD is the last 22 bytes; entry count at offset 10 within it
  const eocd = ascii.length - 22;
  assert.equal(b.readUInt16LE(eocd + 10), 1, "one entry on this disk");
  // central directory header magic
  const cdStart = ascii.indexOf("PK\u0001\u0002");
  assert.ok(cdStart > 0);
  assert.equal(b.readUInt32LE(cdStart + 20), 4, "crc placeholder aside, sizes are recorded");
});

test("buildZip rejects empty or malformed file lists", () => {
  assert.throws(() => V.buildZip([]), /at least one/i);
  assert.throws(() => V.buildZip([{ name: "x.png" }]), /data/i);
  assert.throws(() => V.buildZip([{ data: new Uint8Array([1]) }]), /name/i);
});

test("warnings flag very narrow strips and uncapped tall sources", () => {
  const portrait = V.planCanvas(400, 4000, 10, { mode: "fit", maxHeight: 2048 });
  assert.ok(V.warnings(portrait).length > 0, "portrait poster should warn");
  const tallNative = V.planCanvas(2000, 4000, 10, { mode: "native" });
  assert.ok(
    V.warnings(tallNative).some((w) => /2048/.test(w)),
    "native mode on a 4000px-tall source should warn about the cap"
  );
  const fine = V.planCanvas(1672, 941, 10, { mode: "native" });
  assert.equal(V.warnings(fine).length, 0);
});
