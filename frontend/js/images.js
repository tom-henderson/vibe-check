// images.js — resolve a mood's image by ID, format-agnostically.
//
// A mood image lives at `img/<id>.<ext>`. We don't know the extension ahead of
// time (jpg/png/gif/svg are all fine), so we build an <img> that tries the
// candidates in MOOD_IMAGE_EXTENSIONS order and keeps the first that loads.
// This is why swapping an image needs no code change — see docs/IMAGES.md.

import { MOOD_IMAGE_EXTENSIONS } from "./config.js";

export function createMoodImage(id) {
  const img = document.createElement("img");
  img.alt = ""; // decorative; moods have no text labels
  img.draggable = false;

  const candidates = MOOD_IMAGE_EXTENSIONS.map((ext) => `img/${id}.${ext}`);
  let i = 0;
  img.src = candidates[i];
  img.addEventListener("error", function onError() {
    i += 1;
    if (i < candidates.length) {
      img.src = candidates[i]; // try the next extension
    } else {
      img.removeEventListener("error", onError); // out of options; stop
    }
  });
  return img;
}
