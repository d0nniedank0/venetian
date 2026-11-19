# Venetian

Slice any picture into numbered vertical strips that reassemble into a single
image on an X multi-photo post. Runs entirely in the browser — no upload, no
server, no tracking.

Live: **https://venetiancut.pages.dev**

## Versions

Each version is a self-contained folder so older releases stay intact and
comparable:

- **`0.1/`** — current. Adds the Shape control (Panorama, Poster 3:4, Poster
  4:5, Square 1:1) for no-scroll poster composites, plus crop/narrower warnings
  and aspect-preserving preview.
- **`0.0/`** — first release. Panorama-only slicing, seam-aware crop.

Development and history live in each version's own files; bump the folder
(`0.2/`, …) for the next release and point the deployment at it.

## Tests

Each version has its own `test/` suite. `node_modules` must live off Drive
(the sync corrupts package.json — see `0.1/README.md` for the mirror workflow).

Not affiliated with X. Built by CHΛOS.
