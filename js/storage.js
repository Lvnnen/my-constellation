/*
 * My Constellation — storage.js
 * All persistence lives here: localStorage read/write, default data,
 * and JSON backup export/import so a phone change doesn't mean losing
 * every star you've collected.
 */

export const STORAGE_EVENTS = "myConstellationEvents";
export const STORAGE_CATEGORIES = "myConstellationCategories";
export const STORAGE_FILTERS = "myConstellationFilters";
export const STORAGE_DRAFT = "myConstellationDraft";

/* Soft, dusty pastels — chosen to sit quietly alongside the app's default
 * Sea Blue / Shell White palette rather than compete with it. */
export const DEFAULT_CATEGORIES = [
  { id: "live", name: "ライブ", color: "#F0D6DC" },
  { id: "tv", name: "TV出演", color: "#F2E4C2" },
  { id: "release", name: "新曲", color: "#CFE0D6" },
  { id: "movie", name: "映画", color: "#D9CFE8" },
  { id: "birthday", name: "誕生日", color: "#F2D9C9" },
  { id: "volley", name: "バレー", color: "#C9D6E8" },
  { id: "other", name: "その他", color: "#D6D2DE" },
];

export const SWATCHES = [
  "#B7D9DD", "#F2D9C9", "#D9CFE8", "#F0D6DC", "#D9E2C7",
  "#F2E4C2", "#C9D6E8", "#E8D2C2", "#D6D2DE", "#CFE0D6",
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
