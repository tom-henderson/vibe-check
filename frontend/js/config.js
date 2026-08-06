// config.js — single source of truth the rest of the app reads.

// The five moods. IDs m1–m5 are the stable contract with the backend and stored
// data: never reorder or renumber them. Images can change freely — swap the
// files in img/ (keeping the names) or point `src` somewhere else.
// `color` mirrors the mockup palette and is used for bars/accents in the tally.
export const MOODS = [
  { id: "m1", src: "img/m1.svg", color: "#ff8fb1", tilt: -4 },
  { id: "m2", src: "img/m2.svg", color: "#ffca70", tilt: 3 },
  { id: "m3", src: "img/m3.svg", color: "#8ee39a", tilt: -2 },
  { id: "m4", src: "img/m4.svg", color: "#7ec8ff", tilt: 4 },
  { id: "m5", src: "img/m5.svg", color: "#c69bff", tilt: -3 },
];

// Build-time placeholder. The GitHub Pages workflow replaces the token below
// with the real Lambda Function URL from the `BACKEND_URL` repo variable.
// While it stays unresolved (or empty) the app runs in mock mode — see api.js.
const RAW_BACKEND_URL = "__BACKEND_URL__";

// Treat the unresolved token, an empty string, or obvious junk as "no backend".
export const BACKEND_URL =
  RAW_BACKEND_URL && !RAW_BACKEND_URL.startsWith("__") ? RAW_BACKEND_URL : "";

export const USE_MOCK = BACKEND_URL === "";
