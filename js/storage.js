/*
 * My Constellation — storage.js
 * All persistence lives here: localStorage read/write, default data,
 * theme preference, and JSON backup export/import so a phone change
 * doesn't mean losing every star you've collected.
 */

export const STORAGE_EVENTS = "myConstellationEvents";
export const STORAGE_CATEGORIES = "myConstellationCategories";
export const STORAGE_FILTERS = "myConstellationFilters";
export const STORAGE_THEME = "myConstellationTheme";
export const STORAGE_DRAFT = "myConstellationDraft";

export const DEFAULT_CATEGORIES = [
  { id: "live", name: "ライブ", color: "#F7B8CC" },
  { id: "tv", name: "TV出演", color: "#FCDD9B" },
  { id: "release", name: "新曲", color: "#A9DDD3" },
  { id: "movie", name: "映画", color: "#C7BEF2" },
  { id: "birthday", name: "誕生日", color: "#F9C9A8" },
  { id: "volley", name: "バレー", color: "#AFC6EE" },
  { id: "other", name: "その他", color: "#C7CBE0" },
];

export const SWATCHES = [
  "#F7B8CC", "#FCDD9B", "#A9DDD3", "#C7BEF2", "#F9C9A8",
  "#AFC6EE", "#F3AEB1", "#B7E0C4", "#D9C6EE", "#A7DCE0",
];

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

export function saveJSON(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    /* storage full or unavailable — fail silently, app still works in-memory */
  }
}

export function removeKey(key) {
  try { localStorage.removeItem(key); } catch (e) {}
}

export function loadTheme() {
  try { return localStorage.getItem(STORAGE_THEME) || "dark"; }
  catch (e) { return "dark"; }
}

export function saveTheme(theme) {
  try { localStorage.setItem(STORAGE_THEME, theme); } catch (e) {}
}

/** Download events + categories as a portable JSON backup file. */
export function exportBackup(events, categories) {
  const payload = {
    app: "My Constellation",
    version: 1,
    exportedAt: new Date().toISOString(),
    events,
    categories,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `my-constellation-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Read + validate an uploaded backup file. Resolves { events, categories }. */
export function parseBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.events) || !Array.isArray(data.categories)) {
          throw new Error("バックアップファイルの形式が正しくありません");
        }
        resolve({ events: data.events, categories: data.categories });
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
