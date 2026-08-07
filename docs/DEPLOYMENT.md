# Deployment

Two deployables, one workflow (`.github/workflows/deploy.yml`), triggered on push
to `main` (and manually via *Run workflow*).

- **Frontend** → GitHub Pages. Always deploys. Ships in **mock mode** until the
  `BACKEND_URL` variable is set, then uses the live API.
- **Backend** → AWS via SAM. Deploys only once `AWS_ACCOUNT_ID` exists as a
  secret; otherwise the job is skipped so the frontend still ships.

## What Claude does vs. what you do

Claude wrote and maintains the workflow, the SAM template, and the frontend, and
watches the runs. The following are the account-level handoffs only you can do.

### 1. Enable GitHub Pages
Settings → Pages → **Source: GitHub Actions**. (No branch selection needed.)

### 2. Set up AWS OIDC + the deploy role
Create an IAM OIDC identity provider for GitHub (once per account) and a role the
workflow assumes. No long-lived AWS keys are stored in GitHub.

**OIDC provider** (skip if it already exists):
- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`

**Role** — its name is supplied via `AWS_SAM_DEPLOY_ROLE_NAME` (variable or
secret). The workflow builds the ARN as
`arn:aws:iam::<AWS_ACCOUNT_ID>:role/<AWS_SAM_DEPLOY_ROLE_NAME>`.

Trust policy (locks the role to this repo's `main`):
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike": { "token.actions.githubusercontent.com:sub": "repo:tom-henderson/vibe-check:ref:refs/heads/main" }
    }
  }]
}
```

**Permissions policy.** Tom manages the deploy role's policy directly. Against
that policy, `sam deploy` for this stack needs, beyond CloudFormation/S3/Lambda
(already granted):

- **DynamoDB table management** — the one gap. Minimal actions to create/update
  the on-demand table (no TTL/PITR/autoscaling), scoped to `table/current-mood*`:
  `CreateTable`, `DeleteTable`, `DescribeTable`, `UpdateTable`,
  `DescribeTimeToLive`, `DescribeContinuousBackups`, `ListTagsOfResource`,
  `TagResource`, `UntagResource`.
- **IAM for the execution role** — no addition needed. The function's execution
  role is defined at `Path: /service-role/` in `template.yaml`, so it falls
  under the existing `iam:*` / `iam:PassRole` grant scoped to
  `role/service-role/*`. (SAM's default auto-generated role sits at path `/` and
  would be denied — hence the explicit role.)

The deploy job prints the exact `AccessDenied` action if anything else surfaces,
so extend from there.

### 3. Add the secrets / variables
Settings → Secrets and variables → Actions. These may go under either the
**Secrets** or **Variables** tab — the workflow reads both:
- `AWS_ACCOUNT_ID` — 12-digit account id. *(Presence of this as a **secret**
  flips the backend job on.)*
- `AWS_SAM_DEPLOY_ROLE_NAME` — name of the IAM role the workflow assumes.
- `AWS_SAM_DEPLOY_BUCKET_NAME` — pre-created S3 bucket for SAM upload artifacts.

### 4. After the first successful backend deploy
The deploy job's summary prints the **Function URL**. Add it under **Variables**:
- `BACKEND_URL` = that URL.

Re-run the workflow (or push) and the frontend switches from mock to live — no
code change.

## Optional variables (sensible defaults if unset)
| Variable | Default | Purpose |
| --- | --- | --- |
| `AWS_REGION` | `ap-southeast-2` | Region for the SAM stack |
| `BACKEND_URL` | *(empty → mock mode)* | Lambda Function URL for the live frontend |

## CORS note
The SAM template locks the Function URL's CORS `AllowOrigins` to
`https://tom-henderson.github.io` (the `AllowOrigin` template parameter). If the
site is served from a different origin (custom domain), update that parameter.
