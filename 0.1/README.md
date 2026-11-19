# Venetian

Slice any picture into numbered vertical strips that reassemble into a single
image on an X multi-photo post, the "scroll-across" effect from
[@AskVenice's 20-tile post](https://x.com/AskVenice/status/2121310688740061551).

**Everything runs in your browser. No server, no upload, no tracking.**

Live: https://venetiancut.pages.dev

## Versions & deploy

Version folders are the source of truth; the repo root is a **build artifact**.
Never hand-edit files at the root — edit inside the version folder, then copy
its contents up to the root and push. Cloudflare Pages serves the root, so a
push is a deploy.

- `0.1/` — current: Shape control (Panorama / Poster 3:4 / 4:5 / Square 1:1),
  no-scroll poster composites, crop/narrower warnings, aspect-preserved preview.
- `0.0/` — first release: panorama-only slicing, seam-aware crop.

To ship the next version: copy `0.N/` contents up to the root, then
`git commit` + `git push`.

## Run
No build, no install for the app itself: open `index.html` (double-click works;
everything is client-side).

## Tests
`node_modules` must NOT live on Drive — the sync corrupts it
(`ERR_INVALID_PACKAGE_CONFIG`). Use the off-Drive mirror:

```bash
L="$LOCALAPPDATA/Temp/venetian-local"
rm -rf "$L" && mkdir -p "$L"
cp index.html README.md package.json package-lock.json "$L/"
cp -r js css test assets "$L/"
cd "$L" && npm install
node --test test/engine.test.js   # engine tests
node --test test/ui.test.js      # jsdom UI tests
node test/e2e-slice.js           # real PNG through the pipeline, pixel-diff reassembly
node test/make-zip.js && python test/verify-zip.py   # ZIP vs a real extractor
```

After editing files on Drive, re-copy them into `$L` before testing.

## How it works
- **Height is the hard cap.** X stores originals at up to 2048 px tall; fit
  mode resamples to exactly that.
- **Width divides exactly by N.** Leftover pixels are cropped, centered;
  X's grid leaves no room for slivers.
- **Shape (aspect) target.** Poster mode caps the canvas to a requested
  W:H ratio and center-crops, so a portrait composite fits the card with no
  scrolling.
- **Seam-aware cut.** Every candidate boundary is scored by how much detail
  it would bisect; the whole crop shifts a few px so boundaries land on
  quiet pixels.
- **Upload order is the effect.** Files come out numbered `01..N`; X can't
  reorder photos after posting.

## Credits
Not affiliated with X. Built by CHΛOS.
