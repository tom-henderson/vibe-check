# Progress Tracker — Current Mood

Living checklist of what's done, in-flight, and pending. Updated as work lands.
Companion to `DECISIONS.md` (why) and `HANDOVER.md` (the build spec).

Legend: `[x]` done · `[~]` in progress · `[ ]` pending · `[!]` blocked (needs Tom)

## Stage 1 — Static frontend, mocked data  ✅ done, verified in browser
- [x] Lift mockup into real page; remove preview toolbar
- [x] MOODS config (single source of truth for the five images)
- [x] Placeholder mood images (SVG) — Tom swaps for real art later
- [x] Pick screen with vote flow
- [x] Result screen (winner large, ranked tally, footer, "you picked X")
- [x] Tie screen (multiple rank-1 winners)
- [x] Loading state
- [x] Vote-failed state
- [x] Mock backend (in-memory counts + fake vote) behind a swappable data layer
- [x] Responsive to mobile — verified at 390px
- [x] Respect prefers-reduced-motion; keyboard-focusable tiles

## Stage 2 — SAM scaffold + DynamoDB table
- [ ] `template.yaml` with DynamoDB table (on-demand, PK `dayKey`, no TTL)
- [ ] Function env var for table name + least-privilege access

## Stage 3 — Lambda + Function URL
- [ ] Handler: NZ dayKey (DST-correct), GET state, POST vote (atomic ADD + upsert)
- [ ] Mood validation, response shape per §6
- [ ] Function URL + CORS locked to Pages origin

## Stage 4 — Wire frontend to API
- [ ] Replace mock with real fetch calls (build-time injected URL)
- [ ] Cookie (`mood|dayKey`, expiry at next NZ midnight) + already-voted path

## Stage 5 — CI/CD via GitHub Actions
- [ ] Workflow: OIDC auth to AWS, `sam build && sam deploy`
- [ ] Publish static site to GitHub Pages, injecting Function URL
- [!] Requires: AWS account, OIDC role, repo secrets/vars (Tom)

## Stage 6 — End-to-end verify
- [ ] Live vote/reload/lock, inspect DynamoDB, day rollover, a11y checks

## Waiting on Tom (see README "Handoff points")
- [ ] Provision AWS account + OIDC for deploy
- [ ] Add AWS account ID to Actions secrets
- [ ] Create the IAM deploy role I assume
- [ ] Replace placeholder mood images
- [ ] Enable GitHub Pages (source: GitHub Actions) — confirm
