# Current Mood — Implementation Handover

A single-page site where each visitor picks one of five "mood" images per day. After voting they see the current global winner plus a ranked tally of all votes. All counts are per-day; a new day starts fresh at midnight New Zealand time. Nothing is deleted — each day's totals are kept as its own record.

This document is the build spec. Follow the staged plan at the end. The visual design is fixed and provided as a working HTML mockup (`mood-mockup.html`) — match it.

---

## 1. Architecture

- **Frontend:** static single page, served from **GitHub Pages**. Plain HTML/CSS/JS, no framework required. The mockup is hand-written HTML/CSS and can be lifted almost verbatim.
- **Backend:** one **AWS Lambda** function exposed via a **Lambda Function URL** (no API Gateway). Handles two operations: read today's state, and cast a vote.
- **Storage:** **DynamoDB**, one table. One item per day holding that day's five counters.
- **Infrastructure as code:** define the Lambda, Function URL, and DynamoDB table with **AWS SAM** (`template.yaml`). No console click-ops for backend resources.
- **Deployment:** a **GitHub Actions workflow** builds and deploys — `sam build && sam deploy` for the backend, and publishing the static site to GitHub Pages. Assume an AWS account is already provisioned with deploy credentials available to the workflow (provisioned separately, out of scope here).
- **No auth, no admin.** Changing the five images is a redeploy of the static site.

```
[ GitHub Pages static page ] --fetch--> [ Lambda Function URL ] --> [ DynamoDB table ]
```

### Why this shape
Ultra-low traffic. Function URL avoids API Gateway cost and config. DynamoDB gives atomic increments (no lost votes under concurrency) and cheap per-day items. Daily reset is achieved by *partitioning on the date*, not by deletion — see §4.

---

## 2. The five moods

- Five moods, referenced by stable IDs `m1`–`m5`. IDs are the contract between frontend, backend, and stored data. **Never reorder or renumber** — the images can change but an ID always means the same slot.
- Each mood is a **square image**. In the mockup they're emoji placeholders; real build uses image files (e.g. `/img/m1.png` … `/img/m5.png`), bundled with the static site.
- The mood set is defined **once** in a small config the frontend reads (e.g. a `MOODS` array of `{id, src}`). The backend does **not** need to know the images — it only ever deals with IDs and counts.

---

## 3. Screens & states

All three visual states are in `mood-mockup.html`. The mockup's top toolbar (pick/result/tie) is a **mockup-only** device for previewing — remove it in the real build.

1. **Pick** — heading "what's the mood?", five tiles in a row. Tap a tile to vote. Tiles lift/rotate on hover; confetti drifts in the background (respect `prefers-reduced-motion`).
2. **Result** — heading "current mood:", the winning image shown large, then a ranked list of all five (image chip + bar + raw count, highest first, no percentages), then a footer line "`N` votes today · wipes at midnight". Includes a small "that's what you picked too" / "you picked X" line echoing the visitor's own choice.
3. **Tie** — same as Result but two (or more) winners shown side by side, all sharing rank 1.

Additional states to implement (not drawn, keep them simple and on-brand):

4. **Loading** — brief state while the initial fetch resolves. A minimal centered message or the heading with tiles disabled is fine.
5. **Vote failed** — if the vote request errors, keep the visitor on the pick screen and show a short inline message in the interface's voice, e.g. "that didn't go through — try again". Re-enable the tiles. Do not fabricate a success.

### Which screen shows on load
- **Already voted today** (cookie present and matches today) → go straight to **Result**, with their pick echoed.
- **Not voted** → show **Pick**. On successful vote → **Result**.

---

## 4. Daily model & reset (important)

- The unit of time is a **day in `Pacific/Auckland`**. Compute the current `dayKey` as the NZ calendar date, format `YYYY-MM-DD`.
- **Compute `dayKey` server-side in the Lambda**, from NZ time, on every request. Never trust a date sent by the client. NZ observes daylight saving, so use a proper timezone conversion (e.g. an IANA-aware date library or `Intl` with `timeZone: 'Pacific/Auckland'`), not a fixed UTC offset.
- DynamoDB items are keyed by `dayKey`. Reads and writes always target *today's* key.
- **Reset is implicit:** at NZ midnight the `dayKey` rolls over, so the app starts reading a new key that doesn't exist yet → zero votes. No scheduled job, no TTL, no deletion.
- A day with **zero votes never creates an item** — the item is created on the first vote of that day.
- Past days' items are **retained** (history kept, though the app never displays them).

---

## 5. Data model (DynamoDB)

Single table, e.g. `current-mood`.

- **Partition key:** `dayKey` (String), e.g. `"2026-08-06"`. No sort key.
- **Attributes:** one numeric counter per mood ID.

Example item:
```json
{
  "dayKey": "2026-08-06",
  "m1": 10,
  "m2": 15,
  "m3": 41,
  "m4": 30,
  "m5": 22
}
```

Notes:
- Counters are incremented atomically (see vote op). Missing counter = 0.
- On-demand (pay-per-request) billing. No TTL configured.

---

## 6. API (Lambda Function URL)

One function, routed on method/path or a small action field — keep it minimal. Two operations:

### GET state
Returns today's counts.

- Server computes `dayKey`.
- Read the item for `dayKey`. If absent, treat all counts as 0.
- **Response:**
```json
{
  "dayKey": "2026-08-06",
  "counts": { "m1": 10, "m2": 15, "m3": 41, "m4": 30, "m5": 22 },
  "total": 118,
  "winners": ["m3"]
}
```
- `winners` is the list of mood IDs tied for the highest count (one element normally, more on a tie). Empty array if `total` is 0.
- Frontend can compute `winners`/ranking itself too; returning it keeps the client dumb. Either is fine — pick one and be consistent.

### POST vote
Records one vote.

- Body: `{ "mood": "m3" }`. **Validate** `mood` is one of `m1`–`m5`; reject otherwise with 400.
- Server computes `dayKey`.
- Atomic update: `ADD <mood> :one` (DynamoDB `ADD` on a number, `:one = 1`) on the `dayKey` item, upserting the item if it doesn't exist. This is the whole concurrency story — no read-modify-write.
- **Response:** same shape as GET state (return the fresh counts so the client can render Result without a second call).

### CORS
- The page is served from the GitHub Pages origin; the Function URL is a different origin. Configure CORS on the Function URL (or in the handler) to allow that origin, `GET` and `POST`, and `Content-Type`. Lock the allowed origin to the Pages site rather than `*` where practical.

---

## 7. Vote locking (one vote per day, best-effort)

- On a successful vote, set a **cookie** recording the vote, scoped to today. Store the chosen mood ID and the `dayKey` (e.g. value `m3|2026-08-06`).
- **Expiry:** set the cookie to expire at the **next NZ midnight**, so the lock and the daily reset line up — a returning visitor is unlocked exactly when a fresh day begins.
- On load, if the cookie exists **and its `dayKey` matches today's**, treat the visitor as already-voted → show Result with their pick echoed. If the cookie's `dayKey` is stale (they last voted a previous day), ignore it and show Pick.
- This is deliberately **best-effort** — clearing cookies or switching devices lets someone vote again. That's acceptable; do not add server-side enforcement, fingerprinting, or accounts.

---

## 8. Frontend behaviour summary

1. On load: read cookie. Fetch GET state.
2. If already voted today → render **Result** (winner(s) large, ranked tally, footer count, "you picked X").
3. Else → render **Pick** with the five tiles.
4. On tile tap: disable tiles, POST vote. On success → set cookie, render Result from the response. On failure → re-enable tiles, show the inline "didn't go through" message.
5. Result ranking: sort moods by count descending; render all five; visually flag rank-1 (ties share rank 1 and both winner images show large).
6. Respect `prefers-reduced-motion` (already handled for confetti in the mockup; apply the same care to any added motion).

---

## 9. Out of scope (explicit)

- No admin UI, no history view, no per-day archive browsing (data is kept but never surfaced).
- No user accounts, no analytics, no email.
- No percentages in the tally — ranked raw counts only.
- No mood labels/titles — images only.

---

## 10. Staged implementation plan

Work in these stages; each should be independently verifiable.

**Stage 1 — Static frontend, mocked data.**
Lift the mockup into the real page. Remove the preview toolbar. Wire the three states behind a local mock (a hardcoded `counts` object and a fake "vote" that mutates it in memory). Implement pick → result flow, ranking, tie handling, loading, and vote-failed states. Confirm design matches `mood-mockup.html` and is responsive to mobile. *No backend yet.*

**Stage 2 — SAM scaffold + DynamoDB table.**
Create the SAM project (`template.yaml`). Define the DynamoDB table: on-demand billing, partition key `dayKey` (String), no TTL. Pass the table name to the function as an environment variable and grant the function least-privilege access (read + `UpdateItem` on that table only). `sam build && sam deploy` and confirm the table exists.

**Stage 3 — Lambda + Function URL (in SAM).**
Add the function and its Function URL to `template.yaml`. Implement the handler: NZ `dayKey` computation (DST-correct), GET state, POST vote with `ADD` atomic increment and upsert, mood validation, and the JSON response shape in §6. Configure the Function URL and CORS locked to the Pages origin (via the SAM resource, `AllowOrigins`). Deploy and test both ops against the live URL with curl, including first-vote-of-day item creation and tie counts.

**Stage 4 — Wire frontend to API.**
Replace the Stage 1 mock with real `fetch` calls to the Function URL. Implement the cookie (value `mood|dayKey`, expiry at next NZ midnight) and the already-voted-on-load path. Verify: fresh visitor can vote once, returning visitor sees Result, new day re-enables voting.

**Stage 5 — CI/CD via GitHub Actions.**
Add a GitHub Actions workflow that: authenticates to the pre-provisioned AWS account, runs `sam build && sam deploy` for the backend, and publishes the static site to GitHub Pages. Assume deploy credentials are supplied as repository secrets (setup done separately — the workflow just consumes them). The frontend needs the deployed Function URL: either inject it at build time from a workflow variable/SAM output, or commit it as a small config — document which. Trigger the workflow and confirm a clean from-scratch deploy.

**Stage 6 — End-to-end verify.**
Against the live deployment: vote, reload (still locked), inspect the DynamoDB item, and confirm a simulated day rollover (e.g. a temporary `dayKey` override or a second table item) reads as a clean slate. Confirm reduced-motion and keyboard focus.

### Acceptance criteria
- Fresh visitor sees Pick; one tap records exactly one vote and shows Result.
- Reload within the same NZ day keeps them on Result with their pick echoed (no re-vote).
- Result shows the correct winner(s), correct ranked order, raw counts, and today's total; ties show multiple rank-1 winners.
- Concurrent votes never lose a count (atomic `ADD`).
- At NZ midnight the displayed counts reset to zero with no manual action; the previous day's item still exists in DynamoDB.
- Vote failure leaves the visitor able to retry, with a clear inline message.
- Motion respects `prefers-reduced-motion`; tiles are keyboard-focusable.
