---
name: dependabot-maintenance
description: >-
  Review, triage, and merge the repo's open Dependabot dependency-update PRs
  safely, one at a time, confirming a green deploy between each. Use when asked
  to "handle the dependabot PRs", "do the dependency updates", "merge the update
  PRs", or perform routine dependency maintenance on this repo.
---

# Dependabot maintenance

Routine for safely clearing the open Dependabot dependency-update PRs on
**vibe-check** (Current Mood). Tuned to this repo's shape: a static frontend on
GitHub Pages + an AWS Lambda/DynamoDB backend deployed by
`.github/workflows/deploy.yml` on **push to `main`**.

## The one thing to remember about this repo's CI

**There is no PR-level CI.** The `deploy` workflow only runs *after* a merge to
`main` — it is the CI *and* the production deploy at once (`sam build && sam
deploy` for the backend, Pages publish for the frontend). Consequences:

- You cannot validate a PR before merging it. The only signal is the post-merge
  deploy run.
- A bad merge deploys straight to the live site / live Lambda. So merge
  **one PR at a time** and **wait for each deploy to go green before merging the
  next**. Never batch-merge.
- Because merges go to `main` behind branch protection, prefer merging via the
  API/tooling (the same way earlier dependabot PRs were merged).

## Scope: which PRs

Only PRs **opened by `dependabot[bot]`** that are dependency updates. In this
repo they carry the labels `dependencies` + (`javascript` | `github_actions`).
(Note: there is no `update` label — don't filter on one.) List them, e.g. by
listing open PRs and keeping those whose author is `dependabot[bot]`.

## Step 1 — Triage every PR by its changelog

For each PR, read the changelog/release notes (Dependabot embeds them in the PR
body) and classify:

**Safe to merge** (the common case here):
- **Patch / minor bumps of pinned GitHub Actions** (e.g. `deploy-pages`
  5.0.0→5.0.1, `configure-aws-credentials` 6.2.3→6.2.4). Bugfix/feature only.
- **AWS SDK v3 minor bumps** (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`
  within the `^3` line). These are backward-compatible; the changelogs are
  "version bump only" + unrelated service clients + endpoint refreshes. The
  handler only uses stable surface (`DynamoDBClient`, `DynamoDBDocumentClient`,
  `GetCommand`, `UpdateCommand`).

**Hold and comment — do NOT merge** if any of these apply:
- **A major-version bump of a GitHub Action**, especially anything in the Pages
  publish chain (`upload-pages-artifact`, `configure-pages`, `deploy-pages`) or
  `checkout`. Major Action bumps have broken Pages deploys before (e.g.
  `upload-pages-artifact` v4 stopped including **dotfiles**; v5 moved the
  underlying `upload-artifact` to v7). With no PR CI, these only fail *on the
  live site*. Verify artifact-chain version compatibility and artifact contents
  first.
- **A major-version bump of an AWS SDK** (v3 → v4), or any changelog entry
  explicitly flagged **breaking**, **removed**, or **deprecated** for a package
  the code actually uses.
- Anything you can't confidently reason about from the changelog.

When you hold one, **post a comment on the PR** stating exactly what the risk is,
why it can't be validated pre-merge here, and what to check before merging.
Leave it open and unmerged.

## Step 2 — Plan a merge order

- **GitHub Actions PRs first** (they only touch `.github/workflows/deploy.yml`,
  smallest blast radius, fastest deploy — often an empty backend changeset).
- **Then the AWS SDK PRs.** These change `package.json` + `package-lock.json`
  and actually redeploy the Lambda code, so the deploy takes a little longer
  (real CloudFormation update, ~30–60s vs ~10s for an empty changeset).
- **Mind shared files.** Sibling PRs that edit the *same* lockfile will conflict
  after the first merges. In this repo the pairs are:
  - `/backend/src/package.json` + lock — the **prod** deps
    (`client-dynamodb`, `lib-dynamodb`).
  - `/backend/package.json` + lock — the **dev/test** deps
    (`client-dynamodb`, `lib-dynamodb`, plus `aws-sdk-client-mock`).
  Merge one of a pair, then the sibling goes `dirty` and needs a rebase
  (Step 3) before it can merge.

## Step 3 — Merge loop (repeat per safe PR)

1. Check the PR's `mergeable_state`.
   - `clean` / `blocked` (blocked = branch protection, still API-mergeable here)
     → merge it (`merge` method, to match this repo's merge-commit history).
   - `dirty` → it conflicts with `main` (a sibling lockfile already merged).
     Comment **`@dependabot rebase`** on the PR and wait ~1–3 min for Dependabot
     to regenerate the lockfile and push; the head SHA changes and the state
     returns to mergeable. Then merge. (Don't hand-edit a dependabot branch's
     lockfile — let dependabot regenerate it.)
2. After merging, find the **`deploy` workflow run for the merge commit** on
   `main` (match on the merge SHA) and **watch it to completion**.
3. Confirm **all three jobs succeed**: `config`, `frontend` (Pages publish), and
   `backend` (`sam build` → `sam deploy` → Report Function URL). For an SDK PR,
   the value is confirming `sam build` (installs the new SDK) and `sam deploy`
   (updates the live Lambda) both pass.
4. Only once green, proceed to the next PR. If a deploy **fails**, stop: do not
   merge anything else; investigate the failing job's logs and report.

## Notes / gotchas

- Deploys are serialized by `concurrency: deploy-${{ github.ref }}` with
  `cancel-in-progress: false`, so rapid merges just queue — but you should be
  waiting for green between merges anyway.
- The `backend` job runs only while the `AWS_ACCOUNT_ID` secret exists (it does
  today → live mode). If it were ever unset, SDK bumps wouldn't be exercised by
  CI at all; note that in your report.
- Handler unit tests (`cd backend && npm test`) are **not** run in CI. For an SDK
  bump you're unsure about, run them locally as an extra check before merging.
- Always end any GitHub comment you author with the Claude Code attribution
  footer.
