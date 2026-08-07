# Decision Log — Current Mood

Append-only record of choices made during the build and why. Newest at top.

## 2026-08-06 — Task tracking method
Using two version-controlled Markdown files instead of an external tracker:
`PROGRESS.md` (checklist/status) and `DECISIONS.md` (this file). Self-contained,
reviewable in the diff, no extra tooling — best fit for "minimal interaction".

## 2026-08-07 — SAM transform must be AWS::Serverless-2016-10-31 here
In this locked-down account, `Transform: AWS::Serverless-2016-10-09` (the value
the SAM CLI emits) was denied at `cloudformation:CreateChangeSet` on the macro
`transform/Serverless-2016-10-09`, even with a matching identity grant. Switching
to `AWS::Serverless-2016-10-31` (the value the CloudFormation template-reference
docs specify) cleared it — CloudFormation handles that transform without the
macro-invoke authorization that blocked `-09`. Keep `-31`.

## 2026-08-07 — No reserved-concurrency cap (account limit too low)
The security pass added `ReservedConcurrentExecutions: 10`, but the account's
total Lambda concurrency is ~10 and AWS requires >=10 unreserved, so the create
was rejected ("UnreservedConcurrentExecution below its minimum value of [10]").
Removed it. The low account limit is the de-facto cap; restore an explicit one
after raising the Lambda concurrency quota. See docs/SECURITY-REVIEW.md A1.

## 2026-08-06 — Lambda execution role pinned to /service-role/
The deploy role's IAM permissions and its `iam:PassRole` condition are scoped to
`arn:aws:iam::*:role/service-role/*`. SAM's auto-generated function role is
created at path `/`, which that scope would deny at `iam:CreateRole`. So the
execution role is now defined explicitly in `template.yaml` with
`Path: /service-role/` (managed `AWSLambdaBasicExecutionRole` for logs + an
inline read/increment policy on the table). This fits the existing grant with
no broader IAM permission. The only permission the deploy role was actually
missing is DynamoDB table management (added separately by Tom).

## 2026-08-06 — Repo layout
- `frontend/` — static site published to GitHub Pages.
- `backend/`  — AWS SAM app (`template.yaml` + `src/`).
- `.github/workflows/` — CI/CD.
Keeps the two deployables cleanly separated.

## 2026-08-06 — Mood images: ID-based, format-agnostic resolution
Images are resolved by mood ID, not named in config: the app loads
`img/<id>.<ext>`, trying `png → jpg → jpeg → gif → webp → svg` and keeping the
first that loads (`frontend/js/images.js`). So swapping an image is pure
drop-in — no code edit — and any of PNG/JPG/GIF/SVG/WEBP works (`docs/IMAGES.md`).
Placeholders now ship as **PNG** (rendered from the original emoji SVGs) so the
default state resolves on the first try with no 404 chatter, and raster formats
are ordered first so a real uploaded image wins over any leftover placeholder.
No size/shape validation — deliberately the updater's responsibility. Backend
never sees images — only IDs `m1`–`m5`.

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
