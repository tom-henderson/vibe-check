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

**Role** — default name `current-mood-github-deploy` (override with the
`AWS_DEPLOY_ROLE_NAME` variable, or supply the full ARN as the
`AWS_DEPLOY_ROLE_ARN` secret).

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

**Permissions policy** — a starting point for what `sam deploy` needs. It is
intentionally minimal; the deploy job prints the exact `AccessDenied` action if
something is missing, so extend from there. `<REGION>` defaults to
`ap-southeast-2`.
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Cloudformation",
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateStack", "cloudformation:UpdateStack",
        "cloudformation:DeleteStack", "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents", "cloudformation:DescribeStackResource",
        "cloudformation:DescribeStackResources", "cloudformation:GetTemplate",
        "cloudformation:GetTemplateSummary", "cloudformation:CreateChangeSet",
        "cloudformation:DescribeChangeSet", "cloudformation:ExecuteChangeSet",
        "cloudformation:DeleteChangeSet", "cloudformation:ListStackResources"
      ],
      "Resource": "*"
    },
    {
      "Sid": "SamManagedBucket",
      "Effect": "Allow",
      "Action": ["s3:CreateBucket", "s3:PutBucketPolicy", "s3:PutBucketTagging",
        "s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket",
        "s3:GetBucketLocation", "s3:PutEncryptionConfiguration",
        "s3:PutBucketVersioning", "s3:PutBucketPublicAccessBlock"],
      "Resource": ["arn:aws:s3:::aws-sam-cli-managed-*", "arn:aws:s3:::aws-sam-cli-managed-*/*"]
    },
    {
      "Sid": "LambdaAndUrl",
      "Effect": "Allow",
      "Action": ["lambda:CreateFunction", "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration", "lambda:GetFunction",
        "lambda:DeleteFunction", "lambda:TagResource", "lambda:ListTags",
        "lambda:CreateFunctionUrlConfig", "lambda:UpdateFunctionUrlConfig",
        "lambda:GetFunctionUrlConfig", "lambda:DeleteFunctionUrlConfig",
        "lambda:AddPermission", "lambda:RemovePermission", "lambda:GetPolicy"],
      "Resource": "arn:aws:lambda:*:<ACCOUNT_ID>:function:current-mood*"
    },
    {
      "Sid": "DynamoDB",
      "Effect": "Allow",
      "Action": ["dynamodb:CreateTable", "dynamodb:DescribeTable",
        "dynamodb:UpdateTable", "dynamodb:DeleteTable", "dynamodb:TagResource",
        "dynamodb:ListTagsOfResource", "dynamodb:DescribeContinuousBackups",
        "dynamodb:DescribeTimeToLive"],
      "Resource": "arn:aws:dynamodb:*:<ACCOUNT_ID>:table/current-mood*"
    },
    {
      "Sid": "ExecutionRole",
      "Effect": "Allow",
      "Action": ["iam:CreateRole", "iam:DeleteRole", "iam:GetRole",
        "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:GetRolePolicy",
        "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:TagRole",
        "iam:PassRole"],
      "Resource": "arn:aws:iam::<ACCOUNT_ID>:role/current-mood*"
    }
  ]
}
```

### 3. Add the secret
Settings → Secrets and variables → Actions → **Secrets**:
- `AWS_ACCOUNT_ID` — your 12-digit account id. *(Presence of this flips the
  backend job on.)*

### 4. After the first successful backend deploy
The deploy job's summary prints the **Function URL**. Add it under **Variables**:
- `BACKEND_URL` = that URL.

Re-run the workflow (or push) and the frontend switches from mock to live — no
code change.

## Optional variables (sensible defaults if unset)
| Variable | Default | Purpose |
| --- | --- | --- |
| `AWS_REGION` | `ap-southeast-2` | Region for the SAM stack |
| `AWS_DEPLOY_ROLE_NAME` | `current-mood-github-deploy` | Role name (if you didn't set `AWS_DEPLOY_ROLE_ARN`) |
| `BACKEND_URL` | *(empty → mock mode)* | Lambda Function URL for the live frontend |

## CORS note
The SAM template locks the Function URL's CORS `AllowOrigins` to
`https://tom-henderson.github.io` (the `AllowOrigin` template parameter). If the
site is served from a different origin (custom domain), update that parameter.
