# Venetian

Slice any picture into numbered vertical strips that reassemble into a single
image on an X multi-photo post — the "scroll-across" effect from
[@AskVenice's 20-tile post](https://x.com/AskVenice/status/2121310688740061551).

**Everything runs in your browser. No server, no upload, no tracking.**

## Run locally
Open `index.html`, or `python -m http.server` in this folder and visit
`http://localhost:8000`.

## Tests
```
npm install
node --test test/engine.test.js
```
(plus `test/ui.test.js` — jsdom UI suite — once the UI slice lands)

## How it works
- **Height is the hard cap.** X stores originals at up to 2048 px tall; fit
  mode resamples to exactly that.
- **Width divides exactly by N.** Leftover pixels are cropped, centered —
  X's grid leaves no room for slivers.
- **Seam-aware cut.** Every candidate boundary is scored by how much detail
  it would bisect; the whole crop shifts a few px so boundaries land on
  quiet pixels.
- **Upload order is the effect.** Files come out numbered `01..N`; X can't
  reorder photos after posting.

Not affiliated with X. Built by CHΛOS.
