# Updating the mood images

The five moods are shown as square images. You can change any of them without
touching code — just add a file with the right name.

## The rule

Each mood is a file named after its **ID** (`m1`–`m5`) in `frontend/img/`:

```
frontend/img/m1.png
frontend/img/m2.png
frontend/img/m3.png
frontend/img/m4.png
frontend/img/m5.png
```

The app looks up each mood by ID and loads `img/<id>.<ext>`, trying these
extensions in order and using the first file it finds:

```
png → jpg → jpeg → gif → webp → svg
```

So any of **PNG, JPG, GIF, SVG** (plus WEBP) work. The files shipped today are
placeholder PNGs.

## To change a mood

1. **Same format (easiest):** overwrite the file, keeping the name.
   e.g. replace `frontend/img/m3.png` with your PNG.
2. **Different format:** delete the mood's existing file and add yours under the
   same ID. e.g. remove `m3.png`, add `m3.jpg`.

> **Keep one file per mood.** If both `m3.png` and `m3.jpg` exist, the earlier
> one in the extension order wins (`png` before `jpg`) — which may not be the one
> you intended. Deleting the old file avoids any surprise.

That's the whole process. There is **no config to edit** and nothing to
register — the IDs `m1`–`m5` are fixed and the lookup is automatic.

## What's on you

- **Square + sized sensibly.** The app doesn't crop, pad, or validate. Images are
  displayed in square frames (`object-fit: cover`), so a non-square image will be
  center-cropped. Aim for a square source, a few hundred pixels per side is plenty.
- **File size.** No limit is enforced; keep them reasonably small so the page
  loads quickly.
- **No text labels.** Moods are images only — whatever meaning you want is in the
  picture.

## Going live

Images are part of the static site. Once your change is on `main`, the deploy
workflow republishes GitHub Pages automatically — no separate step.

## Adding more formats (optional)

To allow another extension (e.g. `avif`), add it to `MOOD_IMAGE_EXTENSIONS` in
`frontend/js/config.js`. Order matters: earlier = preferred.

## Changing how many moods there are

Out of scope for a normal image swap — the count of five is wired into the
layout and the backend contract. Changing it means touching `MOODS` in
`config.js` (and the backend's mood list). The image mechanism itself doesn't
care how many there are.
