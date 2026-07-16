/*
 * My Constellation — app.js
 * The controller: owns state, wires up event delegation, and drives the
 * render loop. Templates live in ui.js, persistence lives in storage.js,
 * date math lives in utils.js / holidays.js — this file just connects them.
 */
import { uid, toDateStr, fromDateStr, startOfDay, nextOccurrence, occursOn, daysUntil, debounce } from "./utils.js";
import {
  DEFAULT_CATEGORIES, SWATCHES,
  STORAGE_EVENTS, STORAGE_CATEGORIES, STORAGE_FILTERS, STORAGE_DRAFT,
  loadJSON, saveJSON, removeKey, loadTheme, saveTheme,
  exportBackup, parseBackupFile,
} from "./storage.js";
import {
  APP_VERSION, catOf,
  renderHeader, renderSearchBar, renderChips, renderCalendarCard, renderMonthPicker, renderListCard,
  renderEventModal, renderCatManager, renderSettings, renderConfirm, renderToast,
} from "./ui.js";

/* ---------------------------------------------------------------------- */
/* State                                                                  */
/* ---------------------------------------------------------------------- */
const state = {
  events: loadJSON(STORAGE_EVENTS, []),
  categories: loadJSON(STORAGE_CATEGORIES, DEFAULT_CATEGORIES),
  activeFilters: loadJSON(STORAGE_FILTERS, DEFAULT_CATEGORIES.map((c) => c.id)),
  cursor: startOfDay(new Date()),
  selectedDate: null,
  navDirection: null,
  monthPickerOpen: false,
  pickerYear: new Date().getFullYear(),
  editing: null,
  addingCat: false,
  newCatColor: SWATCHES[0],
  catManagerOpen: false,
  settingsOpen: false,
  searchOpen: false,
  searchQuery: "",
  sortOrder: "date-asc",
  theme: loadTheme(),
  confirm: null,
  toast: null,
  version: APP_VERSION,
};

const appEl = document.getElementById("app");
let toastTimer = null;

/* ---------------------------------------------------------------------- */
/* Persistence helpers                                                    */
/* ---------------------------------------------------------------------- */
function persistEvents() { saveJSON(STORAGE_EVENTS, state.events); }
function persistCategories() { saveJSON(STORAGE_CATEGORIES, state.categories); }
function persistFilters() { saveJSON(STORAGE_FILTERS, state.activeFilters); }

/* ---------------------------------------------------------------------- */
/* Render loop                                                            */
/* ---------------------------------------------------------------------- */
function computeListData(today) {
  const activeSet = new Set(state.activeFilters);
  const visibleEvents = state.events.filter((e) => activeSet.has(e.category));
  const q = state.searchQuery.trim().toLowerCase();
  const searching = state.searchOpen && q.length > 0;

  if (searching) {
    let results = state.events
      .filter((e) => (e.title || "").toLowerCase().includes(q) || (e.note || "").toLowerCase().includes(q))
      .map((e) => ({ event: e, date: nextOccurrence(e, today) }));

    if (state.sortOrder === "date-asc") {
      results.sort((a, b) => Math.abs(daysUntil(a.date, today)) - Math.abs(daysUntil(b.date, today)));
    } else if (state.sortOrder === "date-desc") {
      results.sort((a, b) => b.date - a.date);
    } else if (state.sortOrder === "category") {
      const order = state.categories.map((c) => c.id);
      results.sort((a, b) => order.indexOf(a.event.category) - order.indexOf(b.event.category) || a.date - b.date);
    }
    return { searching: true, results, todays: [], upcoming: [], selectedEvents: [] };
  }

  const todays = visibleEvents.filter((e) => occursOn(e, today));
  const weekLater = new Date(today);
  weekLater.setDate(weekLater.getDate() + 7);
  const upcoming = visibleEvents
    .map((e) => ({ ...e, _next: nextOccurrence(e, today) }))
    .filter((e) => startOfDay(e._next).getTime() > today.getTime() && startOfDay(e._next).getTime() <= weekLater.getTime())
    .sort((a, b) => a._next - b._next);
  const selectedEvents = state.selectedDate ? visibleEvents.filter((e) => occursOn(e, state.selectedDate)) : [];

  return { searching: false, results: [], todays, upcoming, selectedEvents };
}

function renderNow() {
  const today = startOfDay(new Date());
  document.documentElement.setAttribute("data-theme", state.theme);
  const computed = computeListData(today);

  appEl.innerHTML = `
    ${renderHeader()}
    <div class="oc-wrap">
      ${renderSearchBar(state)}
      ${renderChips(state)}
      ${renderCalendarCard(state, today)}
      ${renderListCard(state, today, computed)}
    </div>
    <button class="oc-fab" data-action="open-add" aria-label="予定を追加">＋</button>
    ${renderEventModal(state)}
    ${renderCatManager(state)}
    ${renderMonthPicker(state)}
    ${renderSettings(state)}
    ${renderConfirm(state)}
    ${renderToast(state)}
  `;
}

/** Public render(): keeps scroll position stable across re-renders since
 *  we rebuild the whole #app subtree rather than patching individual nodes. */
function render() {
  const scrollY = window.scrollY;
  renderNow();
  requestAnimationFrame(() => window.scrollTo(0, scrollY));
}

function showToast(message) {
  state.toast = message;
  render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.toast = null; render(); }, 2200);
}

/* ---------------------------------------------------------------------- */
/* Modal open/close                                                       */
/* ---------------------------------------------------------------------- */
function focusTitleField() {
  const el = document.getElementById("fieldTitle");
  if (el) el.focus();
}

function openAdd(dateStr) {
  state.editing = { id: null, title: "", category: state.categories[0]?.id || "other", date: dateStr, yearly: false, note: "", url: "" };
  state.addingCat = false;
  render();
  focusTitleField();
}

function openEdit(id) {
  const ev = state.events.find((e) => e.id === id);
  if (!ev) return;
  state.editing = { ...ev, url: ev.url || "" };
  state.addingCat = false;
  render();
}

function closeModal() {
  state.editing = null;
  state.addingCat = false;
  removeKey(STORAGE_DRAFT);
  render();
}

const scheduleDraftSave = debounce(() => {
  if (state.editing) saveJSON(STORAGE_DRAFT, state.editing);
}, 400);

const debouncedSearchRender = debounce(() => {
  const el = document.getElementById("searchInput");
  const pos = el ? el.selectionStart : null;
  render();
  const el2 = document.getElementById("searchInput");
  if (el2) {
    el2.focus();
    if (pos != null) el2.setSelectionRange(pos, pos);
  }
}, 150);

/* ---------------------------------------------------------------------- */
/* Click delegation                                                       */
/* ---------------------------------------------------------------------- */
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-action]");
  if (!t) return;
  const action = t.dataset.action;
  if (action === "stop") { e.stopPropagation(); return; }
  if (action === "edit-event") return; // handled via long-press, see pointer handlers below

  switch (action) {
    case "toggle-search": {
      state.searchOpen = !state.searchOpen;
      if (!state.searchOpen) state.searchQuery = "";
      render();
      if (state.searchOpen) document.getElementById("searchInput")?.focus();
      break;
    }
    case "clear-search": {
      state.searchQuery = "";
      render();
      document.getElementById("searchInput")?.focus();
      break;
    }
    case "open-settings": state.settingsOpen = true; render(); break;
    case "close-settings": state.settingsOpen = false; render(); break;

    case "toggle-filter": {
      const id = t.dataset.id;
      const set = new Set(state.activeFilters);
      set.has(id) ? set.delete(id) : set.add(id);
      state.activeFilters = [...set];
      persistFilters();
      render();
      break;
    }
    case "prev-month": {
      state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() - 1, 1);
      state.navDirection = "prev";
      render();
      state.navDirection = null;
      break;
    }
    case "next-month": {
      state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + 1, 1);
      state.navDirection = "next";
      render();
      state.navDirection = null;
      break;
    }
    case "go-today": {
      state.cursor = startOfDay(new Date());
      state.selectedDate = null;
      state.navDirection = "jump";
      render();
      state.navDirection = null;
      break;
    }

    case "select-day": {
      const d = fromDateStr(t.dataset.date);
      const same = state.selectedDate && toDateStr(state.selectedDate) === t.dataset.date;
      state.selectedDate = same ? null : d;
      render();
      break;
    }
    case "add-for-day": openAdd(t.dataset.date); break;
    case "open-add": openAdd(state.selectedDate ? toDateStr(state.selectedDate) : toDateStr(startOfDay(new Date()))); break;
    case "close-modal": closeModal(); break;

    case "open-month-picker": state.pickerYear = state.cursor.getFullYear(); state.monthPickerOpen = true; render(); break;
    case "close-month-picker": state.monthPickerOpen = false; render(); break;
    case "picker-prev-year": state.pickerYear -= 1; render(); break;
    case "picker-next-year": state.pickerYear += 1; render(); break;
    case "pick-month": {
      const year = parseInt(t.dataset.year, 10), month = parseInt(t.dataset.month, 10);
      state.cursor = new Date(year, month, 1);
      state.selectedDate = null;
      state.monthPickerOpen = false;
      state.navDirection = "jump";
      render();
      state.navDirection = null;
      break;
    }

    case "pick-category": {
      const id = t.dataset.id;
      state.editing.category = id;
      if (id === "birthday") state.editing.yearly = true;
      render();
      break;
    }
    case "toggle-addcat": state.addingCat = !state.addingCat; render(); break;
    case "pick-swatch": state.newCatColor = t.dataset.color; render(); break;
    case "commit-newcat": {
      const nameEl = document.getElementById("newCatName");
      const name = nameEl ? nameEl.value.trim() : "";
      if (!name) return;
      const id = "c" + uid();
      state.categories.push({ id, name, color: state.newCatColor });
      state.activeFilters = [...new Set([...state.activeFilters, id])];
      state.editing.category = id;
      state.addingCat = false;
      persistCategories();
      persistFilters();
      render();
      break;
    }
    case "save-event": {
      if (!state.editing.title.trim()) { document.getElementById("fieldTitle")?.focus(); return; }
      if (state.editing.id) {
        state.events = state.events.map((ev) => (ev.id === state.editing.id ? state.editing : ev));
      } else {
        state.events.push({ ...state.editing, id: uid() });
      }
      persistEvents();
      showToast("保存しました");
      closeModal();
      break;
    }
    case "ask-delete-event": {
      const ev = state.editing;
      state.confirm = {
        title: "予定を削除しますか？",
        body: `「${ev.title || "この予定"}」を削除します。この操作は取り消せません。`,
        confirmLabel: "削除する",
        onConfirm: () => {
          state.events = state.events.filter((e) => e.id !== ev.id);
          persistEvents();
          removeKey(STORAGE_DRAFT);
          state.editing = null;
          showToast("削除しました");
        },
      };
      render();
      break;
    }

    case "open-catmanager": state.catManagerOpen = true; render(); break;
    case "close-catmanager": state.catManagerOpen = false; render(); break;
    case "set-cat-color": {
      const id = t.dataset.id, color = t.dataset.color;
      state.categories = state.categories.map((c) => (c.id === id ? { ...c, color } : c));
      persistCategories();
      render();
      break;
    }
    case "ask-delete-cat": {
      if (state.categories.length <= 1) return;
      const id = t.dataset.id;
      const cat = catOf(state.categories, id);
      state.confirm = {
        title: "カテゴリーを削除しますか？",
        body: `「${cat.name}」を削除します。このカテゴリーの予定は自動的に他のカテゴリーへ移動します。`,
        confirmLabel: "削除する",
        onConfirm: () => {
          const fallback = state.categories.find((c) => c.id === "other" && c.id !== id) || state.categories.find((c) => c.id !== id);
          state.events = state.events.map((ev) => (ev.category === id ? { ...ev, category: fallback.id } : ev));
          state.categories = state.categories.filter((c) => c.id !== id);
          state.activeFilters = state.activeFilters.filter((fid) => fid !== id);
          persistEvents(); persistCategories(); persistFilters();
          showToast("カテゴリーを削除しました");
        },
      };
      render();
      break;
    }

    case "set-theme": {
      state.theme = t.dataset.theme;
      saveTheme(state.theme);
      render();
      break;
    }
    case "export-backup": exportBackup(state.events, state.categories); showToast("バックアップを書き出しました"); break;
    case "trigger-import": document.getElementById("importFileInput")?.click(); break;

    case "ask-reset-all": {
      state.confirm = {
        title: "すべてのデータを削除しますか？",
        body: "保存されている予定とカテゴリーがすべて削除されます。この操作は取り消せません。",
        confirmLabel: "すべて削除",
        onConfirm: () => {
          state.events = [];
          state.categories = DEFAULT_CATEGORIES.map((c) => ({ ...c }));
          state.activeFilters = state.categories.map((c) => c.id);
          persistEvents(); persistCategories(); persistFilters();
          showToast("データを削除しました");
        },
      };
      render();
      break;
    }

    case "cancel-confirm": state.confirm = null; render(); break;
    case "confirm-yes": {
      const fn = state.confirm && state.confirm.onConfirm;
      state.confirm = null;
      if (fn) fn();
      render();
      break;
    }
    default: break;
  }
});

/* ---------------------------------------------------------------------- */
/* Input delegation (typing — mutate state without a full re-render so   */
/* focus/cursor position in the field being typed into is never lost)    */
/* ---------------------------------------------------------------------- */
document.addEventListener("input", (e) => {
  if (e.target.classList && e.target.classList.contains("oc-catrow-name")) {
    const id = e.target.dataset.catid;
    state.categories = state.categories.map((c) => (c.id === id ? { ...c, name: e.target.value } : c));
    persistCategories();
    return;
  }
  if (e.target.id === "searchInput") {
    state.searchQuery = e.target.value;
    debouncedSearchRender();
    return;
  }
  const field = e.target.dataset && e.target.dataset.field;
  if (!field || !state.editing) return;
  if (field === "yearly") {
    state.editing.yearly = e.target.checked;
  } else {
    state.editing[field] = e.target.value;
  }
  scheduleDraftSave();
});

document.addEventListener("change", (e) => {
  if (e.target.id === "importFileInput") {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    parseBackupFile(file)
      .then(({ events, categories }) => {
        state.confirm = {
          title: "データを復元しますか？",
          body: `${events.length}件の予定を読み込みます。現在保存されているデータは上書きされます。`,
          confirmLabel: "復元する",
          onConfirm: () => {
            state.events = events;
            state.categories = categories.length ? categories : DEFAULT_CATEGORIES.map((c) => ({ ...c }));
            state.activeFilters = state.categories.map((c) => c.id);
            persistEvents(); persistCategories(); persistFilters();
            showToast("データを復元しました");
          },
        };
        render();
      })
      .catch(() => showToast("ファイルを読み込めませんでした"));
    return;
  }
  if (e.target.matches && e.target.matches(".oc-sort-select")) {
    state.sortOrder = e.target.value;
    render();
  }
});

/* ---------------------------------------------------------------------- */
/* Long-press to edit (tickets only) + keyboard shortcuts                 */
/* ---------------------------------------------------------------------- */
let pressTimer = null;
let pressTarget = null;

function clearPress() {
  if (pressTarget) pressTarget.classList.remove("oc-pressing");
  if (pressTimer) clearTimeout(pressTimer);
  pressTimer = null;
  pressTarget = null;
}

document.addEventListener("pointerdown", (e) => {
  const t = e.target.closest('[data-action="edit-event"]');
  if (!t || e.target.closest("a")) return;
  pressTarget = t;
  t.classList.add("oc-pressing");
  pressTimer = setTimeout(() => {
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (_) {} }
    openEdit(t.dataset.id);
    pressTimer = null;
  }, 480);
});
document.addEventListener("pointerup", clearPress);
document.addEventListener("pointercancel", clearPress);
document.addEventListener("pointerleave", clearPress, true);

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (state.confirm) { state.confirm = null; render(); return; }
  if (state.settingsOpen) { state.settingsOpen = false; render(); return; }
  if (state.monthPickerOpen) { state.monthPickerOpen = false; render(); return; }
  if (state.catManagerOpen) { state.catManagerOpen = false; render(); return; }
  if (state.editing) { closeModal(); return; }
});

/* ---------------------------------------------------------------------- */
/* Init                                                                   */
/* ---------------------------------------------------------------------- */
function init() {
  // Restore an in-progress draft if the app was closed mid-edit (autosave).
  const draft = loadJSON(STORAGE_DRAFT, null);
  if (draft && draft.title !== undefined) {
    state.editing = draft;
  }

  render();
  if (state.editing) focusTitleField();

  // Fade the launch splash out once the first paint has happened.
  requestAnimationFrame(() => {
    setTimeout(() => {
      const splash = document.getElementById("splash");
      if (!splash) return;
      splash.classList.add("oc-hide");
      setTimeout(() => splash.remove(), 500);
    }, 350);
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      /* offline caching just won't be available — the app still works online */
    });
  }
}

init();
