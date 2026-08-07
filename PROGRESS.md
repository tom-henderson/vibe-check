# Progress Tracker — Current Mood

**Status: SHIPPED & LIVE** — https://tom-henderson.github.io/vibe-check/ (live API mode).
Companion to `DECISIONS.md` (why) and `HANDOVER.md` (the build spec).

## Stages — all complete

- **1 · Static frontend + mock** ✅ Pick / Result / Tie / Loading / Vote-failed,
  data-driven; ID-based format-agnostic images; responsive; reduced-motion; a11y.
- **2 · SAM + DynamoDB table** ✅ on-demand table, PK `dayKey`, no TTL.
- **3 · Lambda + Function URL** ✅ NZ `dayKey` (DST-correct), GET/POST, atomic
  `ADD` upsert, mood validation, CORS locked to the Pages origin; 19 unit checks.
- **4 · Frontend ↔ API** ✅ real fetch behind the api seam; vote cookie
  (`mood|dayKey`, expiry at next NZ midnight); already-voted path.
- **5 · CI/CD** ✅ GitHub Actions: OIDC → AWS, `sam build && sam deploy`; Pages
  publish with build-time `BACKEND_URL` injection.
- **6 · End-to-end verify** ✅ live API verified (below).

## Live verification (2026-08-07)

- `GET` → `dayKey` = NZ date, correct counts/total/winners.
- `POST` valid mood → atomic increment persists in DynamoDB; response shape per §6.
- `POST` invalid mood → `400` (whitelist validation).
- CORS → allowed for the Pages origin, no `Access-Control-Allow-Origin` for others.
- Reset is implicit (new `dayKey` per NZ day); past days' items retained.

## Owner setup — done
- [x] AWS account + OIDC provider; `AWS_ACCOUNT_ID` secret
- [x] Deploy role (`AWS_SAM_DEPLOY_ROLE_NAME`) + artifact bucket (`AWS_SAM_DEPLOY_BUCKET_NAME`)
- [x] Deploy-role IAM extended (DynamoDB; SAM transform macro; `service-role/*`)
- [x] GitHub Pages enabled (Source: GitHub Actions)
- [x] `BACKEND_URL` repo variable set → frontend live
- [x] Real mood images uploaded

## Security (see `docs/SECURITY-REVIEW.md`)
Applied: Actions pinned to SHAs + Dependabot; per-job workflow permissions;
deploys guarded to `main`; CSP meta; `Secure` cookie; **branch protection on
`main`**. No reserved-concurrency cap — the account's ~10 concurrency quota is
already the ceiling, so a cap adds nothing unless the quota is later raised.

Open owner-side (optional, non-blocking):
- [ ] Deploy-role least-privilege review
- [ ] AWS Budgets alert (the real cost guard)
- [ ] Pages environment protection limited to `main`

## Deploy log (condensed)
- **run #1–2** — OIDC role name, then the role's **trust policy** (owner fixed).
- **GitHub Actions outage** paused runs.
- **run #3** — `CreateChangeSet` denied on the SAM transform macro
  `Serverless-2016-10-09`. Fix: switch the transform to **`AWS::Serverless-2016-10-31`**
  (the value the CFN docs specify) — cleared the macro authorization. (PR #9)
- **run #4** — stack created the table + `/service-role/` exec role; Lambda failed
  on `ReservedConcurrentExecutions` (account concurrency ~10). Fix: **remove the
  reserved-concurrency cap** (PR #10); owner deleted the `ROLLBACK_COMPLETE` stack.
- Also en route: owner added **DynamoDB** perms to the deploy role; exec role
  pinned to **`/service-role/`** to fit the role's IAM scope (PR #3).
- **run #5** ✅ **success** — stack created; Function URL published; verified live.
- **Post-launch polish** — full-bleed image corners, result-page trims, display-font
  heading, ~2× scale, credit footer (PR #12); image reorder (#13, owner).
