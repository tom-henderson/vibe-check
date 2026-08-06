# Decision Log — Current Mood

Append-only record of choices made during the build and why. Newest at top.

## 2026-08-06 — Task tracking method
Using two version-controlled Markdown files instead of an external tracker:
`PROGRESS.md` (checklist/status) and `DECISIONS.md` (this file). Self-contained,
reviewable in the diff, no extra tooling — best fit for "minimal interaction".

## 2026-08-06 — Repo layout
- `frontend/` — static site published to GitHub Pages.
- `backend/`  — AWS SAM app (`template.yaml` + `src/`).
- `.github/workflows/` — CI/CD.
Keeps the two deployables cleanly separated.

## 2026-08-06 — Mood images: SVG placeholders
Placeholders are self-contained SVGs in `frontend/img/m1.svg … m5.svg`
(colored square + emoji from the mockup). The five moods are defined once in
`frontend/js/config.js` (`MOODS`), the single source of truth. To swap in real
art, Tom replaces the files (keeping the names) or edits `MOODS`. Backend never
sees images — only IDs `m1`–`m5`.

## 2026-08-06 — Backend URL injection & fake-until-real
`frontend/js/config.js` holds `BACKEND_URL` as a build-time placeholder token.
The Pages workflow substitutes it from a repo **variable** (`BACKEND_URL`) at
build time. Until that variable is set, the token stays unresolved and the
frontend runs in **mock mode**: it fakes state + accepts votes locally so the
full UX (pick → result/tie) is demoable with no backend. One code path, two
modes, decided at runtime by whether a real URL is present.

## 2026-08-06 — Data-layer seam
All state/vote access goes through a small `api` module with two
implementations (mock + real). Stage 1 ships the mock; Stage 4 flips to real by
config only. Keeps the UI code identical across the transition.
