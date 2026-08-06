// api.js — the data-layer seam. Two implementations behind one interface:
//   getState() -> { dayKey, counts, total, winners }
//   vote(mood) -> same shape (fresh counts including the new vote)
// Which one is active is decided by config (USE_MOCK). The UI never knows.

import { MOODS, BACKEND_URL, USE_MOCK } from "./config.js";
import { nzDayKey } from "./time.js";

const IDS = MOODS.map((m) => m.id);

// Winners = all IDs tied for the highest count. Empty when there are no votes.
export function computeWinners(counts, total) {
  if (!total) return [];
  const max = Math.max(...IDS.map((id) => counts[id] || 0));
  return IDS.filter((id) => (counts[id] || 0) === max);
}

// Normalise a bare counts map into the full response shape.
function shape(dayKey, counts) {
  const full = {};
  let total = 0;
  for (const id of IDS) {
    const n = Number(counts[id]) || 0;
    full[id] = n;
    total += n;
  }
  return { dayKey, counts: full, total, winners: computeWinners(full, total) };
}

// ---------------------------------------------------------------- real backend
async function realGetState() {
  const r = await fetch(BACKEND_URL, { method: "GET" });
  if (!r.ok) throw new Error("state request failed: " + r.status);
  return await r.json();
}

async function realVote(mood) {
  const r = await fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mood }),
  });
  if (!r.ok) throw new Error("vote request failed: " + r.status);
  return await r.json();
}

// ---------------------------------------------------------------- mock backend
// Persists per-day counts in localStorage so reloads and the returning-visitor
// path behave like the real thing. Seeds a believable baseline the first time a
// given NZ day is seen. A little latency makes the loading state visible.
const MOCK_KEY_PREFIX = "mock-counts:";
const MOCK_SEED = { m1: 10, m2: 15, m3: 41, m4: 30, m5: 22 };

function mockLoad(dayKey) {
  const key = MOCK_KEY_PREFIX + dayKey;
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore storage errors, fall through to seed */
  }
  const seeded = { ...MOCK_SEED };
  try {
    localStorage.setItem(key, JSON.stringify(seeded));
  } catch {
    /* storage may be unavailable; still return seeded in-memory */
  }
  return seeded;
}

function mockSave(dayKey, counts) {
  try {
    localStorage.setItem(MOCK_KEY_PREFIX + dayKey, JSON.stringify(counts));
  } catch {
    /* ignore */
  }
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function mockGetState() {
  await delay(250);
  const dayKey = nzDayKey();
  return shape(dayKey, mockLoad(dayKey));
}

async function mockVote(mood) {
  await delay(300);
  if (!IDS.includes(mood)) throw new Error("invalid mood: " + mood);
  const dayKey = nzDayKey();
  const counts = mockLoad(dayKey);
  counts[mood] = (Number(counts[mood]) || 0) + 1;
  mockSave(dayKey, counts);
  return shape(dayKey, counts);
}

// ---------------------------------------------------------------- public API
export const getState = USE_MOCK ? mockGetState : realGetState;
export const vote = USE_MOCK ? mockVote : realVote;
