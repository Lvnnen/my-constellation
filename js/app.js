/*
 * My Constellation — app.js
 * The controller: owns state, wires up event delegation, and drives the
 * render loop. Templates live in ui.js, persistence lives in storage.js,
 * date math lives in utils.js / holidays.js — this file just connects them.
 */
import { uid, toDateStr, fromDateStr, startOfDay, nextOccurrence, occursOn, debounce } from "./utils.js";
import {
  DEFAULT_CATEGORIES, SWATCHES,
  STORAGE_EVENTS, STORAGE_CATEGORIES, STORAGE_FILTERS, STORAGE_DRAFT,
  loadJSON, saveJSON, removeKey,
  exportBackup, parseBackupFile,
} from "./storage.js";
import {
  APP_VERSION, catOf,
  renderHeader, renderChips, renderCalendarCard, renderMonthPicker, renderListCard,
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
  navDirection: null,     // 'prev' | 'next' | 'jump' | null — drives the calendar's motion
  monthPickerOpen: false,
  pickerYear: new Date().getFullYear(),
  editing: null,          // the event currently open in the add/edit sheet, or null
  addingCat: false,
  newCatColor: SWATCHES[0],
  catManagerOpen: false,
  settingsOpen: false,
  confirm: null,          // { title, body, confirmLabel, onConfirm } or null
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

  const todays = visibleEvents.filter((e) => occursOn(e, today));
  const weekLater = new Date(today);
  weekLater.setDate(weekLater.getDate() + 7);
  const upcoming = visibleEvents
    .map((e) => ({ ...e, _next: nextOccurrence(e, today) }))
    .filter((e) => startOfDay(e._next).getTime() > today.getTime() && startOfDay(e._next).getTime() <= weekLater.getTime())
    .sort((a, b) => a._next - b._next);
  const selectedEvents = state.selectedDate ? visibleEvents.filter((e) => occursOn(e, state.selectedDate)) : [];

  return { todays, upcoming, selectedEvents };
}

function renderNow() {
  const today = startOfDay(new Date());
  const computed = computeListData(today);

  appEl.innerHTML = `
    ${renderHeader()}
    <div class="oc-wrap">
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

/* ---------------------------------------------------------------------- */
/* Category drag-to-reorder                                                */
/* A lightweight FLIP-style reorder: the dragged row follows the pointer   */
/* via `transform`, sibling rows slide into their new slot with a CSS      */
/* transition, and the array only commits once on pointerup — no re-render */
/* mid-gesture, so the motion stays perfectly smooth.                      */
/* ---------------------------------------------------------------------- */
let dragCtx = null;

function startCategoryDrag(handle) {
  const row = handle.closest(".oc-catrow");
  const list = document.getElementById("catList");
  if (!row || !list) return;
  const rowEls = Array.from(list.querySelectorAll(".oc-catrow"));
  const rects = new Map(rowEls.map((el) => [el.dataset.id, el.getBoundingClientRect()]));
  row.classList.add("dragging");
  dragCtx = { row, rowEls, rects, draggedId: row.dataset.id, startY: null, finalOrder: null };
}

function onCategoryDragMove(e) {
  if (!dragCtx) return;
  const { row, rowEls, rects, draggedId } = dragCtx;
  if (dragCtx.startY == null) dragCtx.startY = e.clientY;
  const dy = e.clientY - dragCtx.startY;
  row.style.transform = `translateY(${dy}px)`;

  const orderedIds = rowEls.map((el) => el.dataset.id);
  const n = orderedIds.length;
  const slotTops = orderedIds.map((id) => rects.get(id).top);
  const draggedRect = rects.get(draggedId);
  const draggedCenter = draggedRect.top + dy + draggedRect.height / 2;

  let targetIndex = 0;
  for (let i = 0; i < n; i++) {
    if (draggedCenter > slotTops[i] + draggedRect.height / 2) targetIndex = i + 1;
  }
  targetIndex = Math.max(0, Math.min(n - 1, targetIndex));

  const others = orderedIds.filter((id) => id !== draggedId);
  others.forEach((id, k) => {
    const slot = k < targetIndex ? k : k + 1;
    const el = rowEls.find((r) => r.dataset.id === id);
    const shift = slotTops[slot] - rects.get(id).top;
    el.style.transition = "transform .18s ease";
    el.style.transform = shift ? `translateY(${shift}px)` : "";
  });

  dragCtx.finalOrder = [...others];
  dragCtx.finalOrder.splice(targetIndex, 0, draggedId);
}

function endCategoryDrag() {
  if (!dragCtx) return;
  const { rowEls, row, finalOrder } = dragCtx;
  rowEls.forEach((el) => { el.style.transition = ""; el.style.transform = ""; });
  row.classList.remove("dragging");
  if (finalOrder) {
    state.categories = finalOrder.map((id) => state.categories.find((c) => c.id === id));
    persistCategories();
  }
  dragCtx = null;
  render();
}

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
    case "pick-swatch": {
      state.newCatColor = t.dataset.color;
      render();
      break;
    }
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
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

document.addEventListener("input", (e) => {
  const id = e.target.id || "";

  if (e.target.classList && e.target.classList.contains("oc-catrow-name")) {
    const catId = e.target.dataset.catid;
    state.categories = state.categories.map((c) => (c.id === catId ? { ...c, name: e.target.value } : c));
    persistCategories();
    return;
  }

  // Existing-category custom color (native picker or typed hex), keyed by suffix after the dash.
  if (id.startsWith("catColorNative-") || id.startsWith("catColorHex-")) {
    const catId = id.split("-").slice(1).join("-");
    const value = e.target.value;
    const valid = id.startsWith("catColorNative-") ? true : HEX_RE.test(value);
    if (!valid) return;
    state.categories = state.categories.map((c) => (c.id === catId ? { ...c, color: value } : c));
    persistCategories();
    const nativeEl = document.getElementById(`catColorNative-${catId}`);
    const hexEl = document.getElementById(`catColorHex-${catId}`);
    if (nativeEl && nativeEl !== e.target) nativeEl.value = value;
    if (hexEl && hexEl !== e.target) hexEl.value = value;
    return;
  }

  // New-category custom color, while the "add category" panel is open.
  if (id === "newCatColorNative" || id === "newCatColorHex") {
    const value = e.target.value;
    const valid = id === "newCatColorNative" ? true : HEX_RE.test(value);
    if (!valid) return;
    state.newCatColor = value;
    const nativeEl = document.getElementById("newCatColorNative");
    const hexEl = document.getElementById("newCatColorHex");
    if (nativeEl && nativeEl !== e.target) nativeEl.value = value;
    if (hexEl && hexEl !== e.target) hexEl.value = value;
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
  }
});

/* ---------------------------------------------------------------------- */
/* Pointer gestures: long-press to edit a ticket, drag-handle to reorder   */
/* categories, plus the keyboard shortcuts that close overlays.           */
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
  const handle = e.target.closest(".oc-drag-handle");
  if (handle) {
    e.preventDefault();
    startCategoryDrag(handle);
    return;
  }
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
document.addEventListener("pointermove", (e) => { if (dragCtx) onCategoryDragMove(e); });
document.addEventListener("pointerup", () => { if (dragCtx) { endCategoryDrag(); return; } clearPress(); });
document.addEventListener("pointercancel", () => { if (dragCtx) { endCategoryDrag(); return; } clearPress(); });
document.addEventListener("pointerleave", (e) => { if (!dragCtx) clearPress(); }, true);

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
