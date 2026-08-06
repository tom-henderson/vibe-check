# Security review — Current Mood

Scope: the surface this repo deploys and exposes — a **public** repo, a **public**
static site, and a **public, unauthenticated** Lambda Function URL, with GitHub
Actions holding **OIDC access to AWS**. The AWS account itself (guardrails, SCPs,
budgets, the deploy-role policy) is the owner's responsibility; this review
covers what we put into it and how it's shipped.

Date: 2026-08-06. Severity is relative to a low-stakes "current mood" app —
there's no PII and no auth to steal; the stakes are **cost, availability, and the
CI→AWS trust boundary**, not data confidentiality.

## Summary

| # | Area | Finding | Severity |
|---|------|---------|----------|
| A1 | Public API | Unauthenticated Function URL with no concurrency cap or rate limit → cost/DoS amplification | **High** |
| B1 | CI/CD | Third-party Actions pinned to floating tags, not commit SHAs (job can mint AWS creds) | **Medium** |
| B2 | CI/CD | `id-token: write` granted workflow-wide instead of per-job | Low |
| B3 | CI/CD | `workflow_dispatch` from any branch can publish that branch to the live Pages site | Low |
| C1 | IAM | Deploy pipeline is an AWS privilege-escalation path if `main` is compromised | **Medium** |
| D1 | Frontend | No Content-Security-Policy; third-party font from Google | Low |
| D2 | Frontend | Vote cookie missing `Secure` flag | Low |
| A2 | API | CORS is relied on as if it were an abuse control (it isn't) | Info |
| — | Data | No PII stored; whitelist input validation; least-privilege runtime role | Positive |

---

## A. Public API abuse, DoS, and cost

### A1 (High) — Unauthenticated endpoint with no throttle or concurrency cap
`FunctionUrlConfig.AuthType: NONE` is intentional (anonymous voting), but the
function has **no `ReservedConcurrentExecutions`** and there's no rate limiting in
front of it. Anyone can script unlimited `POST`s. Consequences:

- **Cost amplification / financial DoS.** Every request is a Lambda invoke; every
  vote is a DynamoDB on-demand write. Both scale elastically with no ceiling, so
  sustained traffic runs up spend without any hard cap.
- **Ballot stuffing.** The one-vote-per-day control is a cookie only (by design,
  best-effort). The API accepts arbitrary scripted votes; tallies are not
  trustworthy against a motivated actor. This is an accepted design trade-off —
  documented here so it's a known, not a surprise.

**Remediations (in order of effort/value):**
1. **Set `ReservedConcurrentExecutions`** on the function (e.g. 5–20). Caps
   concurrent invokes → bounds both cost and DynamoDB write rate, and contains
   blast radius. Trade-off: under a flood, legitimate users get throttled (fail
   → the app's "that didn't go through" path). Cheap, in-template, recommended.
2. **AWS Budgets alarm** on the account (owner side) to alert on spend spikes.
3. **Short-TTL cache on GET.** Front the Function URL with CloudFront and cache
   `GET` state for ~5–10s. Reads are identical for all visitors, so this absorbs
   read floods cheaply. Adds infra.
4. **Per-IP rate limiting.** CloudFront + AWS WAF rate-based rule if abuse becomes
   real. More infra/cost; probably overkill unless targeted.
5. If vote integrity ever matters: a lightweight challenge (hCaptcha/PoW) or WAF —
   not accounts. Out of scope for now.

### A2 (Info) — CORS is not an abuse control
CORS is correctly locked to the Pages origin, but that only stops *other websites'
browser JS* from reading responses. It does **not** stop `curl`, scripts, or
server-side callers from hitting the endpoint directly. Abuse protection comes
from input validation (present) and concurrency capping (A1) — not CORS. Keep the
CORS lock (it's good hygiene), just don't count it as a security boundary.

---

## B. CI/CD and the OIDC trust boundary

### B1 (Medium) — Actions pinned to floating tags
Every third-party action is referenced by moving tag: `aws-actions/
configure-aws-credentials@v4`, `aws-actions/setup-sam@v2`, `actions/checkout@v4`,
`actions/configure-pages@v5`, `actions/upload-pages-artifact@v3`,
`actions/deploy-pages@v4`. The `backend` job holds `id-token: write` and assumes an
AWS role, so a compromised action release (or a moved tag) runs **inside a job that
can obtain deployable AWS credentials**. Pin each action to a **full commit SHA**
(keep the human tag in a trailing comment) and let Dependabot bump them. This is
the single highest-leverage supply-chain hardening for a public repo with AWS
access.

### B2 (Low) — `id-token: write` is workflow-wide
`permissions:` at the top grants `id-token: write` to *all* jobs, including
`config` (needs none). Prefer minimal top-level permissions (`contents: read`) and
grant `id-token`/`pages` **per job** — `id-token: write` on `backend` (AWS) and on
`frontend` (Pages attestation), nothing extra on `config`.

### B3 (Low) — `workflow_dispatch` can publish any branch to production
The `frontend` job has no branch guard, so a maintainer running *Run workflow* on
an arbitrary branch would publish that branch's site to the live Pages
environment. (AWS is safe here — the OIDC trust only allows `main`, so a non-main
dispatch can't assume the deploy role.) Mitigations: add `if: github.ref ==
'refs/heads/main'` to the `frontend` job, and/or add a **deployment protection
rule** on the `github-pages` environment restricting it to `main`. Low risk
(dispatch requires write access) but easy to close.

Fork safety — **currently good, keep it that way:** the workflow triggers only on
`push` to `main` and `workflow_dispatch`. There is no `pull_request` or
`pull_request_target` trigger, so fork PRs cannot run with this repo's secrets or
OIDC. Do **not** add `pull_request_target` (or `pull_request` steps that build/run
PR code with secrets) later without careful review — that's the classic public-repo
credential-theft vector.

---

## C. IAM and blast radius

### C1 (Medium) — The deploy pipeline is a privilege-escalation path
Merging/pushing to `main` triggers an OIDC assume of the deploy role and a CFN
deploy of whatever the template says. The deploy-role policy (as shared) grants
`iam:PutRolePolicy`/`AttachRolePolicy` on `role/service-role/*` plus `iam:PassRole`
to `lambda.amazonaws.com`. That combination means a malicious change to `main`
could deploy a service-role with an over-broad inline policy and a Lambda that
uses it — i.e. escalate beyond the deploy role's own scope. So **whoever can land
a commit on `main` effectively controls that blast radius.** Controls:

- **Protect `main`.** Require PR review, disallow direct pushes, restrict who can
  merge. Since *merge = deploy to AWS*, this is the most important governance
  control and it's free. This is the primary defence.
- **Tighten the deploy role itself** (account-side) — this is where the blast
  radius actually lives: prefer attaching known AWS-managed policies over broad
  `PutRolePolicy`, and scope resources to `current-mood*` / a tight role path.
- **A permissions boundary is not effective if set in our template.** A boundary
  only prevents escalation when the *deploy role's own policy* requires it — an
  `iam:PermissionsBoundary` condition on `CreateRole`/`PutRolePolicy` so the
  deploy role simply cannot create a role without the boundary. Setting
  `PermissionsBoundary` in the CloudFormation template is worthless against a
  compromised `main`, because the attacker controls the template and would just
  omit it. Even the account-side condition has a gap: `PassRole` can only be
  constrained by resource ARN and `PassedToService`, not by the passed role's
  permissions — so any *pre-existing* privileged role under the passable path
  (`service-role/*`) could still be attached to a function. Keeping that path
  free of privileged roles is part of the control.

Runtime role — **good.** `MoodFunctionRole` grants only `dynamodb:GetItem` +
`UpdateItem` on the one table, plus managed logging. No wildcards. This is correct
least privilege and limits what a compromised *function* (vs. pipeline) could do.

---

## D. Frontend / client

### D1 (Low) — No CSP; third-party font
The page sets no Content-Security-Policy and loads fonts from
`fonts.googleapis.com`/`fonts.gstatic.com`. GitHub Pages can't set response
headers, but a `<meta http-equiv="Content-Security-Policy">` gives defense-in-depth
(restrict `script-src 'self'`, `connect-src 'self' <function-url-origin>`,
`img-src 'self' data:`, and fonts to Google or self). Self-hosting the two fonts
removes the third-party request entirely (also a minor privacy win — it stops
leaking every visitor's IP to Google). The app builds DOM with
`createElement`/`textContent` (no untrusted `innerHTML` sink), so XSS exposure is
already low; CSP is belt-and-suspenders.

### D2 (Low) — Vote cookie missing `Secure`
`document.cookie = "mood_vote=…; SameSite=Lax; path=/"` — add `Secure` so it's only
sent over HTTPS (the site is HTTPS-only on Pages). The cookie holds no secret
(just the chosen mood + day), so impact is minimal, but it's a one-word fix.

### Build-time injection (Low)
`sed -i "s|__BACKEND_URL__|${BACKEND_URL}|g"` substitutes a maintainer-set repo
variable into a JS string literal. It's trusted input, but a stray `"` or markup
in the value could break out of the string. Safer long-term: validate the value is
an `https://…on.aws/` URL before substituting, or write it into a dedicated
generated config file rather than editing source. Low priority given the value is
maintainer-controlled.

---

## E. Positives (keep these)

- **Input validation is a whitelist:** the handler rejects any `mood` not in
  `m1..m5` (400) before touching DynamoDB. This prevents the `ADD #mood :one`
  write from creating attacker-chosen attributes / growing the item — a real
  injection vector, correctly closed. Malformed JSON is caught, too.
- **No PII, no auth, no analytics.** Storage is per-day counters only. Nothing
  sensitive to leak; the daily-partition model also caps per-day blast radius.
- **Least-privilege runtime role** (C, above).
- **No secrets in the repo**; `.gitignore` covers `node_modules`, `.aws-sam`,
  local SAM config.
- **Small function** (128 MB, 5 s timeout) — limits per-invocation cost/blast.

---

## Prioritized remediation checklist

**Repo-side (applied 2026-08-06):**
- [x] A1 — `ReservedConcurrentExecutions: 10` on the function (adjustable).
- [x] B1 — all Actions pinned to commit SHAs; Dependabot added (actions + npm).
- [x] B2 — `id-token`/`pages` moved to per-job `permissions`; default is `contents: read`.
- [x] B3 — `frontend` (and `backend`) jobs guarded to `refs/heads/main`.
- [x] D1 — `<meta>` CSP added (strict `script-src 'self'`). Self-hosting fonts still optional.
- [x] D2 — `Secure` added to the vote cookie (over HTTPS).

**Account / GitHub settings (owner):**
- [ ] C1 — **branch protection on `main`** (required review, no direct push) — the
      primary control against a compromised-`main` deploy. Highest priority.
- [ ] C1 — deploy-role least-privilege review; if delegating IAM, enforce a
      permissions boundary via an `iam:PermissionsBoundary` condition on the
      *deploy role* (not the template) and keep `service-role/*` free of
      privileged roles.
- [ ] A1 — AWS Budgets alert; consider CloudFront (GET cache) / WAF if abused.
- [ ] B3 — `github-pages` environment protection rule limited to `main`.
- [ ] D1 — (optional) self-host the two fonts to drop the third-party request.
