# Current Mood

A one-page site where each visitor picks one of five "mood" images per day, then
sees the current global winner and a ranked tally.

**Live:** https://tom-henderson.github.io/vibe-check/

## What it does

- **Pick** — five mood tiles; one tap casts a vote and shows the result.
- **Result** — the winning image large, then a ranked tally of all five (image +
  bar + raw count, highest first). A **tie** shows every rank-1 winner together.
- **One vote per day** — best-effort, via a cookie scoped to today; a returning
  visitor goes straight to the result until the next reset.
- **Daily reset** — counts are per **NZ day** (`Pacific/Auckland`), computed
  server-side, and reset at local midnight. Past days' totals are retained in the
  table but never shown.
- **All states handled** — loading, pick, result, tie, and vote-failed (keeps the
  visitor on the pick screen with an inline retry).
- **Responsive** — scales up on wide screens, down on small ones; respects
  `prefers-reduced-motion`; tiles are keyboard-focusable.
- **Swappable images** — drop a file at `frontend/img/m1.png` … `m5.png` (or
  `.jpg`/`.gif`/`.svg`); resolved by ID, no code change. See `docs/IMAGES.md`.

## How it's built

- **Frontend** (`frontend/`) — static HTML/CSS/JS, no framework, served from
  **GitHub Pages**.
- **Backend** (`backend/`) — one **AWS Lambda** behind a **Function URL**, backed
  by a single **DynamoDB** table (one item per day, atomic increments), defined
  with **AWS SAM**. Region `ap-southeast-2`.
- **CI/CD** (`.github/workflows/deploy.yml`) — on push to `main`: `sam build &&
  sam deploy` (AWS via OIDC, no stored keys) and publish the site to Pages.
- **Fake-until-real** — the frontend calls the live API only when the
  `BACKEND_URL` repo variable is set; otherwise it runs a self-contained **mock
  mode** (fake counts + local voting) so the whole UX works with no backend.

```
[ GitHub Pages static page ] --fetch--> [ Lambda Function URL ] --> [ DynamoDB ]
```

## Run locally

```bash
cd frontend && python3 -m http.server 8099   # open http://localhost:8099
```

Runs in mock mode. Vote and reload to exercise the returning-visitor path.

Backend handler tests:

```bash
cd backend && npm install && npm test        # 19 checks against a mocked DynamoDB
```

## Docs

| Doc | What |
| --- | --- |
| `HANDOVER.md` | Original build spec |
| `docs/DEPLOYMENT.md` | AWS + OIDC setup, deploy-role IAM, repo secrets/variables |
| `docs/IMAGES.md` | Swapping the mood images |
| `docs/SECURITY-REVIEW.md` | Security posture, applied hardening, owner to-dos |
| `DECISIONS.md` | Why the notable choices were made |
| `PROGRESS.md` | Build status + deploy log |
