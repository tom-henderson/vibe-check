// app.js — screen orchestration: load → pick → result/tie, plus loading and
// vote-failed states. Rendering is data-driven from the api response and MOODS,
// so the same code renders a normal result or a tie with no special-casing.

import { MOODS } from "./config.js";
import { getState, vote } from "./api.js";
import { nextNzMidnight } from "./time.js";
import { createMoodImage } from "./images.js";

const MOOD_BY_ID = Object.fromEntries(MOODS.map((m) => [m.id, m]));
const COOKIE = "mood_vote";

// ------------------------------------------------------------------- cookie
function readVoteCookie() {
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(COOKIE + "="));
  if (!match) return null;
  const [mood, dayKey] = decodeURIComponent(match.split("=")[1]).split("|");
  if (!mood || !dayKey) return null;
  return { mood, dayKey };
}

function writeVoteCookie(mood, dayKey) {
  const expires = nextNzMidnight().toUTCString();
  // Secure over HTTPS (production on Pages); omitted on http://localhost so the
  // returning-visitor path is still testable locally.
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE}=${encodeURIComponent(
    `${mood}|${dayKey}`
  )}; expires=${expires}; path=/; SameSite=Lax${secure}`;
}

// ------------------------------------------------------------------- screens
const screens = {
  loading: document.getElementById("loading"),
  pick: document.getElementById("pick"),
  result: document.getElementById("result"),
};

function show(name) {
  for (const [key, el] of Object.entries(screens)) {
    el.classList.toggle("show", key === name);
  }
}

// ------------------------------------------------------------------- pick
let tilesLocked = false;

function buildPick() {
  const grid = document.getElementById("moods");
  grid.innerHTML = "";
  for (const mood of MOODS) {
    const btn = document.createElement("button");
    btn.className = "mood";
    btn.type = "button";
    btn.setAttribute("aria-label", "pick this mood");
    btn.style.setProperty("--tilt", `${mood.tilt}deg`);
    const swatch = document.createElement("div");
    swatch.className = "swatch";
    swatch.style.background = mood.color;
    swatch.appendChild(createMoodImage(mood.id));
    btn.appendChild(swatch);
    btn.addEventListener("click", () => castVote(mood.id));
    grid.appendChild(btn);
  }
}

function setTilesLocked(locked) {
  tilesLocked = locked;
  document
    .querySelectorAll("#moods .mood")
    .forEach((b) => (b.disabled = locked));
}

function showVoteError() {
  document.getElementById("vote-error").classList.add("show");
}
function clearVoteError() {
  document.getElementById("vote-error").classList.remove("show");
}

async function castVote(moodId) {
  if (tilesLocked) return;
  clearVoteError();
  setTilesLocked(true);
  try {
    const state = await vote(moodId);
    writeVoteCookie(moodId, state.dayKey);
    renderResult(state, moodId);
    show("result");
  } catch (err) {
    console.error(err);
    setTilesLocked(false);
    showVoteError();
  }
}

// ------------------------------------------------------------------- result
function renderResult(state, yourMood) {
  const { counts, total, winners } = state;

  // Winner(s) shown large. A tie renders every rank-1 winner side by side.
  const wrap = document.getElementById("winner-wrap");
  wrap.innerHTML = "";
  const tie = winners.length > 1;
  for (const id of winners) {
    const m = MOOD_BY_ID[id];
    const el = document.createElement("div");
    el.className = "winner" + (tie ? " tie" : "");
    el.style.background = m.color;
    el.appendChild(createMoodImage(id));
    wrap.appendChild(el);
  }

  // "you picked" echo.
  const yoursEl = document.getElementById("yours");
  if (yourMood && MOOD_BY_ID[yourMood]) {
    const m = MOOD_BY_ID[yourMood];
    const pickedWinner = winners.includes(yourMood);
    yoursEl.innerHTML = `<span class="dot" style="background:${m.color}"></span>${
      pickedWinner ? "that's what you picked too" : "you picked this one"
    }`;
    yoursEl.style.display = "";
  } else {
    yoursEl.style.display = "none";
  }

  // Ranked tally: sort by count desc; ties share a rank; bar width relative to
  // the leader. No percentages — raw counts only.
  const ranked = [...MOODS].sort(
    (a, b) => (counts[b.id] || 0) - (counts[a.id] || 0)
  );
  const max = Math.max(1, ...MOODS.map((m) => counts[m.id] || 0));
  const tallyEl = document.getElementById("tally-rows");
  tallyEl.innerHTML = "";
  ranked.forEach((m) => {
    const n = counts[m.id] || 0;
    const rank = 1 + MOODS.filter((o) => (counts[o.id] || 0) > n).length;
    const width = total ? (n / max) * 100 : 0;

    const row = document.createElement("div");
    row.className = "row";

    const rankEl = document.createElement("span");
    rankEl.className = "rank";
    rankEl.textContent = rank;

    const chip = document.createElement("div");
    chip.className = "chip";
    chip.style.background = m.color;
    chip.appendChild(createMoodImage(m.id));

    const track = document.createElement("div");
    track.className = "bar-track";
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.width = `${width}%`;
    bar.style.background = m.color;
    track.appendChild(bar);

    const num = document.createElement("span");
    num.className = "num";
    num.textContent = n;

    row.append(rankEl, chip, track, num);
    tallyEl.appendChild(row);
  });

  const noun = total === 1 ? "vote" : "votes";
  document.getElementById(
    "foot"
  ).textContent = `${total} ${noun} today · wipes at midnight`;
}

// ------------------------------------------------------------------- init
async function init() {
  buildPick();
  show("loading");
  let state;
  try {
    state = await getState();
  } catch (err) {
    // Can't reach state on load: fall back to Pick so the visitor can still try.
    console.error(err);
    show("pick");
    return;
  }

  const voted = readVoteCookie();
  if (voted && voted.dayKey === state.dayKey) {
    renderResult(state, voted.mood);
    show("result");
  } else {
    show("pick");
  }
}

init();
