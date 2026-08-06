// time.js — NZ-day helpers used by the mock and by the vote cookie.
// The real backend computes its own dayKey; these mirror that logic client-side.

// Current calendar date in Pacific/Auckland as "YYYY-MM-DD" (DST-correct via Intl).
export function nzDayKey(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// The instant of the next NZ midnight (start of tomorrow's NZ day), to the
// minute. Found by binary-searching the day-boundary, so daylight saving is
// handled by nzDayKey rather than a fixed offset. Used for cookie expiry.
export function nextNzMidnight(now = new Date()) {
  const startDay = nzDayKey(now);
  let lo = now.getTime();
  let hi = lo + 26 * 3600 * 1000; // next NZ day is always within 26h
  while (nzDayKey(new Date(hi)) === startDay) hi += 3600 * 1000;
  while (hi - lo > 60 * 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (nzDayKey(new Date(mid)) === startDay) lo = mid;
    else hi = mid;
  }
  return new Date(hi);
}
