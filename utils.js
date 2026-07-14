/*
 * My Constellation — utils.js
 * Small, dependency-free date and string helpers shared by every module.
 * Nothing here touches the DOM or localStorage — pure functions only.
 */

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function pad(n) {
  return n.toString().padStart(2, "0");
}

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateStr(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Next calendar occurrence of an event relative to `today`.
 *  Non-yearly events just return their own date; yearly ones roll forward
 *  to this year (or next, if this year's date has already passed). */
export function nextOccurrence(ev, today) {
  const d = fromDateStr(ev.date);
  if (!ev.yearly) return d;
  const cand = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (startOfDay(cand) < startOfDay(today)) cand.setFullYear(cand.getFullYear() + 1);
  return cand;
}

/** Whether an event falls on a specific calendar date (respecting yearly repeats). */
export function occursOn(ev, date) {
  const d = fromDateStr(ev.date);
  if (ev.yearly) return d.getMonth() === date.getMonth() && d.getDate() === date.getDate();
  return (
    d.getFullYear() === date.getFullYear() &&
    d.getMonth() === date.getMonth() &&
    d.getDate() === date.getDate()
  );
}

export function daysUntil(date, today) {
  return Math.round((startOfDay(date) - startOfDay(today)) / 86400000);
}

export function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export function normalizeUrl(u) {
  if (!u) return "";
  u = u.trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

/** Debounce helper for autosave-style handlers. */
export function debounce(fn, wait) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
