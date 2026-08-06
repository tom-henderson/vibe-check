# Current Mood

A one-page site where each visitor picks one of five "mood" images per day, then
sees the current global winner and a ranked tally. Counts are per-day and reset
at midnight **Pacific/Auckland**; each day's totals are kept as their own record.

- **Frontend** — static page (`frontend/`), published to GitHub Pages.
- **Backend** — one AWS Lambda behind a Function URL + a DynamoDB table, defined
  with AWS SAM (`backend/`). Not deployed yet.
- **Spec** — `HANDOVER.md`. Progress — `PROGRESS.md`. Decisions — `DECISIONS.md`.

## Fake-until-real

The frontend works with **no backend**. `frontend/js/config.js` carries a
`BACKEND_URL` build-time placeholder; while it's unset the app runs in **mock
mode** — it fakes today's counts, accepts a vote locally, and shows the
result/tie screens. The moment a real URL is injected it uses the live API
instead, with no other code change (`frontend/js/api.js`).

## Run it locally

```bash
cd frontend
python3 -m http.server 8099
# open http://localhost:8099
```

To exercise the returning-visitor path, vote and reload — a cookie keeps you on
the result screen until the next NZ midnight. Clear site data to vote again.

## Swapping the mood images

Drop a file at `frontend/img/m1.png` … `m5.png` — or `.jpg`, `.gif`, `.svg`. The
app resolves each mood by ID across formats, so no code edit is needed; one file
per mood. IDs `m1`–`m5` are a fixed contract (never reorder or renumber), but the
image behind an ID can change freely. Full guide: **`docs/IMAGES.md`**.

## Handoff points (Tom)

These are outside the build and gate the later stages:

1. Provision the AWS account.
2. Set up GitHub OIDC for deploy and add the AWS account ID to Actions secrets.
3. Create the minimal IAM role this repo's workflow assumes (extended as needed;
   the deploy workflow reports missing permissions).
4. Once the backend is deployed, set the repo **variable** `BACKEND_URL` to the
   Lambda Function URL — the Pages build injects it automatically.
5. Enable GitHub Pages (Settings → Pages → Source: **GitHub Actions**).
6. Replace the placeholder mood images with the real art.
