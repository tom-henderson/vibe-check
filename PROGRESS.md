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

## Stage 2 — SAM scaffold + DynamoDB table  ✅ written (deploy pending AWS)
- [x] `template.yaml` with DynamoDB table (on-demand, PK `dayKey`, no TTL)
- [x] Function env var for table name + least-privilege access (GetItem+UpdateItem on the one table)

## Stage 3 — Lambda + Function URL  ✅ written & unit-tested (deploy pending AWS)
- [x] Handler: NZ dayKey (DST-correct), GET state, POST vote (atomic ADD + upsert)
- [x] Mood validation, response shape per §6
- [x] Function URL + CORS locked to Pages origin
- [x] 19 unit checks against a mocked DynamoDB (GET/POST/tie/validation) — all pass

## Stage 4 — Wire frontend to API  ✅ code-complete (activates when BACKEND_URL is set)
- [x] Real fetch calls implemented behind the api seam (build-time injected URL)
- [x] Cookie (`mood|dayKey`, expiry at next NZ midnight) + already-voted path

## Stage 5 — CI/CD via GitHub Actions  ✅ workflow written (needs Tom's AWS + Pages setup to run green)
- [x] Workflow: OIDC auth to AWS, `sam build && sam deploy` (gated on AWS_ACCOUNT_ID secret)
- [x] Publish static site to GitHub Pages, injecting Function URL (mock mode until BACKEND_URL set)
- [x] docs/DEPLOYMENT.md: OIDC trust policy + starter least-privilege IAM policy for the deploy role
- [!] Requires: AWS account, OIDC role, AWS_ACCOUNT_ID secret, Pages enabled (Tom)

## Stage 6 — End-to-end verify
- [ ] Live vote/reload/lock, inspect DynamoDB, day rollover, a11y checks

## Waiting on Tom (see README "Handoff points")
- [x] Provision AWS account + OIDC for deploy
- [x] Add AWS account ID to Actions secrets
- [x] Create the IAM deploy role I assume (name in AWS_SAM_DEPLOY_ROLE_NAME)
- [x] Enable GitHub Pages (source: GitHub Actions)
- [ ] Merge PR #2 (CI fix so backend assumes the right role)
- [ ] After first backend deploy: set BACKEND_URL repo variable
- [ ] Replace placeholder mood images

## Deploy log
- **2026-08-06, run #1** (merge of PR #1, ran the pre-fix workflow):
  - `config` ✅ backend gated on (AWS_ACCOUNT_ID present).
  - `frontend` ✅ published to Pages in mock mode.
  - `backend` ❌ `sts:AssumeRoleWithWebIdentity` not authorized — the merged
    workflow used the old hardcoded role name `current-mood-github-deploy`.
    Fix in **PR #2** (assume `AWS_SAM_DEPLOY_ROLE_NAME`, upload to
    `AWS_SAM_DEPLOY_BUCKET_NAME`). Merge #2 → re-run should get past auth.
    Watch for the next likely blocker: IAM permission scope on the deploy role.
- **2026-08-06, run #2** (merge of PR #2, corrected workflow):
  - `config` ✅, `frontend` ✅ (Pages, mock mode).
  - `backend` ❌ still at OIDC step — role **name resolved** but trust policy
    rejected the subject. Tom fixed the trust policy. (GitHub Actions outage
    then paused further runs.)
- **Pre-deploy policy audit** (against the granted deploy-role policy):
  - Gap found: **no DynamoDB permissions** → CFN `CreateTable` would be denied.
    Minimal DynamoDB policy handed to Tom (Terraform) to add.
  - Gap found: SAM's auto role (path `/`) denied by the `role/service-role/*`
    IAM scope → **template now pins the exec role to `/service-role/`** (PR #3),
    no IAM change needed.
