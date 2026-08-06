// config.js — single source of truth the rest of the app reads.

// The five moods. IDs m1–m5 are the stable contract with the backend and stored
// data: never reorder or renumber them.
//
// Images are resolved by ID, not named here: the app looks for `img/<id>.<ext>`,
// trying MOOD_IMAGE_EXTENSIONS in order (see js/images.js). So to change a mood
// you just drop a file at `img/m3.png` (or .jpg/.gif/.svg) — no edit here. See
// docs/IMAGES.md. `color` mirrors the mockup palette and backs the tally
// bars/chips (and shows through transparent images); `tilt` is the resting
// rotation of the pick tile.
export const MOODS = [
  { id: "m1", color: "#ff8fb1", tilt: -4 },
  { id: "m2", color: "#ffca70", tilt: 3 },
  { id: "m3", color: "#8ee39a", tilt: -2 },
  { id: "m4", color: "#7ec8ff", tilt: 4 },
  { id: "m5", color: "#c69bff", tilt: -3 },
];

// Image formats tried per mood, in order. Raster formats come first so a real
// uploaded image wins over any leftover placeholder; the first file that loads
// is used. Extend this list to allow more types.
export const MOOD_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

// Build-time placeholder. The GitHub Pages workflow replaces the token below
// with the real Lambda Function URL from the `BACKEND_URL` repo variable.
// While it stays unresolved (or empty) the app runs in mock mode — see api.js.
const RAW_BACKEND_URL = "__BACKEND_URL__";

// Treat the unresolved token, an empty string, or obvious junk as "no backend".
export const BACKEND_URL =
  RAW_BACKEND_URL && !RAW_BACKEND_URL.startsWith("__") ? RAW_BACKEND_URL : "";

export const USE_MOCK = BACKEND_URL === "";
