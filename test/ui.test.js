/* UI tests — jsdom. Canvas 2D is stubbed; pixel math is covered by engine tests. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function inlineScripts(html) {
  return html.replace(/<script src="([^"]+)"[^>]*><\/script>/g, function (_, src) {
    return "<script>" + fs.readFileSync(path.join(__dirname, "..", src), "utf8") + "</scr" + "ipt>";
  });
}

const html = inlineScripts(fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8"));

const consoleErrors = [];
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "http://localhost/",
  pretendToBeVisual: true,
  beforeParse(w) {
    w.matchMedia = w.matchMedia || function () {
      return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } };
    };
    w.scrollTo = function () {};
    // minimal 2D context stub
    const ctxStub = {
      canvas: null,
      drawImage() {},
      getImageData(x, y, w, h) {
        return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
      },
      putImageData() {},
      imageSmoothingQuality: "",
    };
    w.HTMLCanvasElement.prototype.getContext = function () { return { ...ctxStub, canvas: this }; };
    w.URL.createObjectURL = function () { return "blob:fake"; };
    w.URL.revokeObjectURL = function () {};
    w.HTMLAnchorElement.prototype.click = function () {};
  },
});

const w = dom.window;
const d = w.document;
w.addEventListener("error", (e) => consoleErrors.push(e.message));

const assert = require("node:assert/strict");
const { test } = require("node:test");

function assertNoErrors() {
  assert.deepEqual(consoleErrors, [], "zero console errors");
}

test("page boots with guide, drop zone, footer; no workbench", () => {
  assert.ok(d.getElementById("dropZone"));
  assert.ok(d.getElementById("workbench").hidden);
  assert.ok(d.querySelector(".footer .brand").textContent.includes("CH\u039b\u039bOS") || d.querySelector(".footer .brand").textContent.trim() === "CHΛOS");
  assertNoErrors();
});

test("drop a file -> workbench opens, render path runs without errors", () => {
  const fakeFile = new w.File([new Uint8Array(8)], "bittensor flow.png", { type: "image/png" });
  const ev = new w.Event("drop", { bubbles: true });
  Object.defineProperty(ev, "dataTransfer", { value: { files: [fakeFile] } });
  d.getElementById("dropZone").dispatchEvent(ev);
  assert.equal(d.getElementById("workbench").hidden, false, "workbench visible after drop");
  assertNoErrors();
});

test("strip buttons update the count input and aria state", () => {
  const btn20 = d.querySelector('[data-n="20"]');
  btn20.click();
  assert.equal(d.getElementById("stripCount").value, "20");
  assert.equal(btn20.getAttribute("aria-pressed"), "true");
  assert.equal(d.querySelector('[data-n="10"]').getAttribute("aria-pressed"), "false");
  assertNoErrors();
});

test("gap slider updates the readout", () => {
  const gap = d.getElementById("gapRange");
  gap.value = "4";
  gap.dispatchEvent(new w.Event("input", { bubbles: true }));
  assert.equal(d.getElementById("gapRead").textContent, "4px");
  assertNoErrors();
});

test("download click runs the export path (stubbed canvas) without errors", () => {
  const dl = d.getElementById("downloadBtn");
  dl.click();
  assertNoErrors();
});

test("footer credit font-size is the reduced 13px", () => {
  // sanity: rule exists in the stylesheet
  const css = fs.readFileSync(path.join(__dirname, "..", "css", "styles.css"), "utf8");
  assert.ok(/\.footer \.brand[\s\S]*?font-size: 13px/.test(css));
});
