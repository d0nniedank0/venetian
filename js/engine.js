/* Venetian engine — DOM-free.
   Slice any picture into N vertical strips that reassemble into one image
   on an X multi-photo post.

   Recipe (reverse-engineered from @AskVenice's 20-tile post, Nov 2026):
   - Height is the hard cap: X stores originals at up to 2048 px tall.
   - Total width must divide EXACTLY by N or the grid shows slivers.
   - Strips upload in order 01..N; X can't reorder afterwards.
*/

(function () {
  "use strict";

  var X_MAX_HEIGHT = 2048;
  var MAX_STRIPS = 20;

  // Work out the output canvas geometry for a source image.
  // mode "native": no resampling — crop width to a multiple of N.
  // mode "fit": resample to at most maxHeight tall, then crop.
  function planCanvas(srcW, srcH, N, opts) {
    opts = opts || {};
    if (!Number.isInteger(N) || N < 2 || N > MAX_STRIPS) {
      throw new Error("strip count must be an integer between 2 and " + MAX_STRIPS);
    }
    if (!Number.isFinite(srcW) || srcW < 1) throw new Error("invalid width");
    if (!Number.isFinite(srcH) || srcH < 1) throw new Error("invalid height");

    var H, scaleW, mode = opts.mode || "native";
    if (mode === "fit") {
      var maxH = Number.isFinite(opts.maxHeight) ? opts.maxHeight : X_MAX_HEIGHT;
      H = Math.min(srcH, maxH);
      scaleW = Math.round(srcW * (H / srcH));
    } else {
      // native: no resampling
      H = srcH;
      scaleW = srcW;
    }

    var W = Math.floor(scaleW / N) * N; // divisible by N
    var cropX = Math.floor((scaleW - W) / 2); // centered, never negative

    if (W / N < 4) {
      throw new Error("too narrow: strips would be under 4 px wide; use fewer strips");
    }

    return { W: W, H: H, sw: W / N, N: N, cropX: cropX, mode: mode, srcW: srcW, srcH: srcH };
  }

  // Slice rectangles in SOURCE coordinates.
  function sliceBounds(plan, cropX) {
    var out = [];
    for (var i = 0; i < plan.N; i++) {
      out.push({ x: (cropX || plan.cropX) + i * plan.sw, y: 0, w: plan.sw, h: plan.H });
    }
    return out;
  }

  // Cost of cutting the canvas at column x: mean abs difference between
  // the columns either side of the cut, computed on the luma plane.
  // Canvas edges (0, W) cost 0 — nothing is cut there.
  function seamCost(luma, W, H, x) {
    if (x <= 0 || x >= W) return 0;
    var a = x - 1, b = x, sum = 0;
    for (var y = 0; y < H; y++) {
      sum += Math.abs(luma[y * W + a] - luma[y * W + b]);
    }
    return sum / H;
  }

  // Search offsets within +/- slack of the centered crop for the one whose
  // boundaries all cut the least detail. Scanned outward from center, so
  // ties resolve to the offset closest to the centered crop.
  function bestOffset(luma, srcW, H, plan, slack) {
    if (typeof slack !== "number") slack = plan.sw > 8 ? 8 : plan.sw - 1;
    var center = plan.cropX, best = center, bestScore = Infinity;
    for (var k = 0; k <= slack; k++) {
      var deltas = k === 0 ? [0] : [k, -k];
      for (var c = 0; c < deltas.length; c++) {
        var x0 = center + deltas[c];
        if (x0 < 0 || x0 + plan.W > srcW) continue;
        var score = 0;
        for (var i = 1; i < plan.N; i++) score += seamCost(luma, srcW, H, x0 + i * plan.sw);
        if (score < bestScore) { bestScore = score; best = x0; }
      }
    }
    return best;
  }

  // Zero-padded output names — upload order is the effect, so names must sort.
  function fileName(stem, i, N) {
    var pad = String(N).length;
    return stem + "-" + String(i).padStart(pad, "0") + ".png";
  }

  function warnings(plan) {
    var out = [];
    if (plan.mode === "native" && plan.srcH > X_MAX_HEIGHT) {
      out.push(
        "Source is " + plan.srcH + "px tall — native mode skips X's 2048 px original-size cap; switch to fit mode for full-res uploads."
      );
    }
    if (plan.sw < 24) {
      out.push(
        "Strips are only " + plan.sw + "px wide — fine detail or text will slice mid-glyph."
      );
    }
    if (plan.W / plan.H < 0.8) {
      out.push(
        "Canvas is " + (plan.W / plan.H).toFixed(2) + ":1 — portrait posters read worse sliced; wide art works best."
      );
    }
    return out;
  }

  // Luma plane (BT.601) from an RGBA ImageData-like object — used for seam scoring.
  function luma(plane) {
    var d = plane.data, W = plane.width, H = plane.height;
    var out = new Float32Array(W * H);
    for (var i = 0; i < W * H; i++) {
      var p = i * 4;
      out[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
    }
    return out;
  }

  // Cut an RGBA plane into N exact strips at crop offset. Returns planes
  // {width, height, data} ready for putImageData.
  function slicePixels(plane, plan, cropX) {
    var src = plane.data, W = plane.width;
    var strips = [];
    for (var i = 0; i < plan.N; i++) {
      var x0 = cropX + i * plan.sw;
      var data = new Uint8ClampedArray(plan.sw * plan.H * 4);
      for (var y = 0; y < plan.H; y++) {
        var srcRow = (y * W + x0) * 4, dstRow = y * plan.sw * 4;
        for (var s = 0; s < plan.sw * 4; s++) data[dstRow + s] = src[srcRow + s];
      }
      strips.push({ width: plan.sw, height: plan.H, data: data });
    }
    return strips;
  }

  var api = {
    planCanvas: planCanvas,
    sliceBounds: sliceBounds,
    slicePixels: slicePixels,
    luma: luma,
    seamCost: seamCost,
    bestOffset: bestOffset,
    fileName: fileName,
    warnings: warnings,
    X_MAX_HEIGHT: X_MAX_HEIGHT,
    MAX_STRIPS: MAX_STRIPS,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Venetian = api;
})();
