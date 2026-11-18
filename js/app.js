/* Venetian UI layer — wires the engine to the DOM.
   Everything happens locally: File -> ImageBitmap -> canvas -> strips -> ZIP. */

if (typeof document !== "undefined") {
  (function () {
    "use strict";

    var V = window.Venetian;
    var Z = window.VenetianZip;

    var els = {
      drop: document.getElementById("dropZone"),
      hint: document.getElementById("dropHint"),
      file: document.getElementById("fileInput"),
      bench: document.getElementById("workbench"),
      seg: document.getElementById("stripSeg"),
      count: document.getElementById("stripCount"),
      mode: document.getElementById("modeSel"),
      gap: document.getElementById("gapRange"),
      gapRead: document.getElementById("gapRead"),
      seam: document.getElementById("seamShift"),
      warn: document.getElementById("warnings"),
      stage: document.getElementById("stripStage"),
      geo: document.getElementById("geometry"),
      dl: document.getElementById("downloadBtn"),
      note: document.getElementById("exportNote"),
    };

    var state = { img: null, name: "strips", N: 10, mode: "fit", gap: 1, shift: true };

    // helpers
    function stem(name) {
      var base = (name || "").replace(/\.[^.]+$/, "");
      base = base.replace(/[^\w-]+/g, "-").slice(0, 24).toLowerCase();
      return base || "strips";
    }
    function show(el, on) { el.hidden = !on; }

    // ---- source intake ----
    function takeFile(file) {
      if (!file || !/^image\//.test(file.type)) { els.hint.textContent = "That's not a picture — try a PNG or JPG."; return; }
      state.name = stem(file.name);
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); state.img = img; render(); show(els.bench, true); };
      img.onerror = function () { els.hint.textContent = "Couldn't decode that image."; };
      img.src = url;
    }

    els.drop.addEventListener("dragover", function (e) { e.preventDefault(); els.drop.classList.add("dragging"); });
    els.drop.addEventListener("dragleave", function () { els.drop.classList.remove("dragging"); });
    els.drop.addEventListener("drop", function (e) {
      e.preventDefault(); els.drop.classList.remove("dragging");
      takeFile(e.dataTransfer.files[0]);
    });
    els.file.addEventListener("change", function () { takeFile(els.file.files[0]); });

    // ---- controls ----
    Array.prototype.forEach.call(els.seg.querySelectorAll(".seg-btn"), function (btn) {
      btn.addEventListener("click", function () {
        els.count.value = btn.dataset.n;
        sync();
      });
    });
    els.count.addEventListener("change", sync);
    els.mode.addEventListener("change", sync);
    els.gap.addEventListener("input", function () { state.gap = +els.gap.value; els.gapRead.textContent = state.gap + "px"; paintPreview(); });
    els.seam.addEventListener("change", sync);

    function sync() {
      var n = parseInt(els.count.value, 10);
      if (!Number.isInteger(n) || n < 2 || n > 20) n = 10;
      state.N = n;
      Array.prototype.forEach.call(els.seg.querySelectorAll(".seg-btn"), function (b) {
        b.setAttribute("aria-pressed", b.dataset.n === String(n) ? "true" : "false");
      });
      state.mode = els.mode.value;
      state.shift = els.seam.checked;
      if (state.img) render();
    }

    // ---- render: plan, slice, preview ----
    function render() {
      var img = state.img;
      var plan;
      try {
        plan = V.planCanvas(img.naturalWidth, img.naturalHeight, state.N, { mode: state.mode });
      } catch (err) {
        els.geo.textContent = "Can't slice this: " + err.message;
        return;
      }

      // draw the (possibly resampled) canvas the plan describes
      var c = document.createElement("canvas");
      c.width = plan.scaleW; c.height = plan.H;
      var ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, plan.scaleW, plan.H);
      var plane = ctx.getImageData(0, 0, c.width, c.height);

      var x0 = plan.cropX;
      if (state.shift) {
        try { x0 = V.bestOffset(V.luma(plane), plan.scaleW, plan.H, plan); } catch (e) { x0 = plan.cropX; }
      }

      // slice from the drawn canvas at the chosen offset
      var strips = [];
      for (var i = 0; i < plan.N; i++) {
        strips.push(ctx.getImageData(x0 + i * plan.sw, 0, plan.sw, plan.H));
      }

      // warnings
      var warns = V.warnings(plan);
      show(els.warn, warns.length > 0);
      els.warn.textContent = warns.join("\n");

      // geometry line
      els.geo.textContent =
        "source " + img.naturalWidth + "\u00d7" + img.naturalHeight +
        " \u2192 " + plan.N + " strips of " + plan.sw + "\u00d7" + plan.H +
        (x0 !== plan.cropX ? " (crop shifted " + (x0 - plan.cropX >= 0 ? "+" : "") + (x0 - plan.cropX) + "px to dodge detail)" : "");

      state.plan = plan;
      state.strips = strips;
      state.canvas = c;
      paintPreview();
      els.dl.disabled = false;
      els.note.textContent = "Files are numbered; upload order is the effect — X can't reorder after posting.";
    }

    function paintPreview() {
      els.stage.innerHTML = "";
      if (!state.strips) return;
      state.strips.forEach(function (strip) {
        var sc = document.createElement("canvas");
        sc.width = strip.width; sc.height = strip.height;
        sc.getContext("2d").putImageData(strip, 0, 0);
        var im = document.createElement("img");
        im.src = sc.toDataURL("image/png");
        im.style.width = "calc(" + (100 / state.strips.length) + "% - 2px)";
        im.style.maxHeight = "420px";
        els.stage.appendChild(im);
      });
    }

    // ---- export: PNG-encode each strip, zip, download ----
    els.dl.addEventListener("click", function () {
      if (!state.strips) return;
      els.dl.disabled = true;
      var old = els.dl.textContent;
      els.dl.textContent = "Encoding\u2026";

      setTimeout(function () {
        try {
          var files = state.strips.map(function (strip, i) {
            var sc = document.createElement("canvas");
            sc.width = strip.width; sc.height = strip.height;
            sc.getContext("2d").putImageData(strip, 0, 0);
            var b64 = sc.toDataURL("image/png").split(",")[1];
            var bin = atob(b64);
            var bytes = new Uint8Array(bin.length);
            for (var j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
            return { name: V.fileName(state.name, i + 1, state.plan.N), data: bytes };
          });

          var zip = Z.buildZip(files);
          var blob = new Blob([zip], { type: "application/zip" });
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = state.name + "-" + state.plan.N + "-strips.zip";
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
          els.note.textContent = "Downloaded " + files.length + " strips. Drag them into the X composer in order.";
        } catch (err) {
          els.note.textContent = "Export failed: " + err.message;
        } finally {
          els.dl.disabled = false;
          els.dl.textContent = old;
        }
      }, 30);
    });
    // test hook: lets the jsdom suite drive render() with a stub image
    // (jsdom can't decode blob: URLs, so onload never fires there)
    window.VenetianApp = { handleFile: takeFile, render: render, state: state };
  })();
}
