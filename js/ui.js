/*
 * My Constellation — ui.js
 * The view layer: pure functions that turn state into HTML strings.
 * Nothing in here mutates state or talks to localStorage — app.js owns
 * that. Keeping templates here (instead of scattered inline strings)
 * is what makes the markup easy to scan and safe to change later.
 */
import { escapeHtml, normalizeUrl, fromDateStr, occursOn, daysUntil, toDateStr } from "./utils.js";
import { isHoliday } from "./holidays.js";
import { SWATCHES, WEEKDAYS } from "./storage.js";

export const APP_VERSION = "1.0.0";

export function catOf(categories, id) {
  return categories.find((c) => c.id === id) || categories[categories.length - 1] || { name: "その他", color: "#C7CBE0" };
}

/** The one soft-star glyph used everywhere (title, chips, calendar, buttons, splash).
 *  `color` sets currentColor (via inline style) so each usage can tint it independently. */
export function starIcon(extraClass = "", color = "") {
  const style = color ? ` style="color:${color}"` : "";
  return `<svg class="oc-star-icon ${extraClass}" aria-hidden="true"${style}><use href="#star-soft"></use></svg>`;
}

/* ---------------------------------------------------------------------- */
/* Header                                                                  */
/* ---------------------------------------------------------------------- */
export function renderHeader() {
  return `
    <div class="oc-header">
      <div class="oc-header-text">
        <div class="oc-title">${starIcon("oc-title-mark")}My Constellation</div>
        <div class="oc-sub">日々を照らす、小さな星たちを集めて。</div>
      </div>
      <button class="oc-icon-btn" data-action="toggle-search" aria-label="予定を検索">🔎</button>
      <button class="oc-icon-btn" data-action="open-settings" aria-label="設定を開く">⚙️</button>
    </div>
  `;
}

export function renderSearchBar(state) {
  if (!state.searchOpen) return "";
  return `
    <div class="oc-search">
      <span class="oc-search-icon" aria-hidden="true">🔎</span>
      <input
        id="searchInput"
        type="search"
        inputmode="search"
        placeholder="予定のタイトルやメモで検索"
        value="${escapeHtml(state.searchQuery)}"
        data-field="search"
        aria-label="予定を検索"
      />
      ${state.searchQuery ? `<button class="oc-search-clear" data-action="clear-search" aria-label="検索をクリア">✕</button>` : ""}
    </div>
  `;
}

/* ---------------------------------------------------------------------- */
/* Filter chips                                                           */
/* ---------------------------------------------------------------------- */
export function renderChips(state) {
  const activeSet = new Set(state.activeFilters);
  const chips = state.categories.map((c) => `
    <button class="oc-chip ${activeSet.has(c.id) ? "active" : ""}" data-action="toggle-filter" data-id="${c.id}"
      style="${activeSet.has(c.id) ? `box-shadow:0 2px 8px ${c.color}55` : ""}"
      aria-pressed="${activeSet.has(c.id)}">
      ${starIcon("oc-chip-star", c.color)}${escapeHtml(c.name)}
    </button>
  `).join("");
  return `
    <div class="oc-chips">
      ${chips}
      <button class="oc-chip oc-manage-chip" data-action="open-catmanager">${starIcon("oc-chip-star")}色を編集</button>
    </div>
  `;
}

/* ---------------------------------------------------------------------- */
/* Calendar                                                                */
/* ---------------------------------------------------------------------- */
export function renderCalendarCard(state, today) {
  const y = state.cursor.getFullYear(), m = state.cursor.getMonth();
  const first = new Date(y, m, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));

  const activeSet = new Set(state.activeFilters);
  const visibleEvents = state.events.filter((e) => activeSet.has(e.category));
  const monthLabel = `${y}年 ${m + 1}月`;
  const isCurrentMonth = today.getFullYear() === y && today.getMonth() === m;

  const wdHtml = WEEKDAYS.map((w, i) => `<div class="oc-wd ${i === 0 ? "sun" : ""} ${i === 6 ? "sat" : ""}">${w}</div>`).join("");

  const dayHtml = cells.map((d) => {
    if (!d) return `<div class="oc-day empty"></div>`;
    const isToday = d.getTime() === today.getTime();
    const isSelected = state.selectedDate && toDateStr(d) === toDateStr(state.selectedDate);
    const dayEvents = visibleEvents.filter((e) => occursOn(e, d));
    const shown = dayEvents.slice(0, 3);
    const stars = shown.map((e) =>
      starIcon("oc-day-star", isSelected ? "#fff" : catOf(state.categories, e.category).color)
    ).join("");
    const plus = dayEvents.length > 3 ? `<span class="oc-day-star-plus">+</span>` : "";
    const wd = d.getDay();
    const numClass = isHoliday(d) ? "holiday" : wd === 0 ? "sun" : wd === 6 ? "sat" : "";
    return `<button class="oc-day ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}" data-action="select-day" data-date="${toDateStr(d)}" aria-label="${d.getMonth() + 1}月${d.getDate()}日${dayEvents.length ? `、予定${dayEvents.length}件` : ""}">
      <span class="num ${numClass}">${d.getDate()}</span><span class="oc-day-stars">${stars}${plus}</span>
    </button>`;
  }).join("");

  const navClass = state.navDirection === "next" ? "nav-next" : state.navDirection === "prev" ? "nav-prev" : state.navDirection === "jump" ? "nav-jump" : "";

  return `
    <div class="oc-card">
      <div class="oc-cal-head">
        <button class="oc-nav-btn" data-action="prev-month" aria-label="前の月">‹</button>
        <div class="oc-cal-title-group">
          <button class="oc-cal-title" data-action="open-month-picker" aria-haspopup="dialog">
            ${monthLabel}<span class="oc-cal-chevron" aria-hidden="true">▾</span>
          </button>
          <button class="oc-today-btn ${!isCurrentMonth || state.selectedDate ? "is-active" : ""}" data-action="go-today" aria-label="今日へ戻る">
            ${starIcon("oc-today-star")}
          </button>
        </div>
        <button class="oc-nav-btn" data-action="next-month" aria-label="次の月">›</button>
      </div>
      <div class="oc-grid ${navClass}">${wdHtml}${dayHtml}</div>
    </div>
  `;
}

/* ---------------------------------------------------------------------- */
/* Month / year picker                                                    */
/* ---------------------------------------------------------------------- */
export function renderMonthPicker(state) {
  if (!state.monthPickerOpen) return "";
  const year = state.pickerYear;
  const curY = state.cursor.getFullYear(), curM = state.cursor.getMonth();
  const grid = Array.from({ length: 12 }, (_, m) => `
    <button class="oc-month-cell ${year === curY && m === curM ? "sel" : ""}" data-action="pick-month" data-year="${year}" data-month="${m}">${m + 1}月</button>
  `).join("");
  return `
  <div class="oc-overlay" data-action="close-month-picker" role="presentation">
    <div class="oc-modal oc-month-picker" data-action="stop" role="dialog" aria-modal="true" aria-label="年月を選択">
      <div class="oc-modal-title">年月を選択</div>
      <div class="oc-picker-year-row">
        <button class="oc-nav-btn" data-action="picker-prev-year" aria-label="前の年">‹</button>
        <div class="oc-picker-year">${year}年</div>
        <button class="oc-nav-btn" data-action="picker-next-year" aria-label="次の年">›</button>
      </div>
      <div class="oc-month-grid">${grid}</div>
      <div class="oc-btn-row">
        <button class="oc-btn oc-btn-ghost" data-action="close-month-picker">キャンセル</button>
      </div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------------- */
/* Tickets (event cards)                                                  */
/* ---------------------------------------------------------------------- */
function buildTicket({ id, color, numHtml, title, metaHtml, badgeText, url }) {
  const link = normalizeUrl(url);
  return `
    <div class="oc-ticket" style="--c:${color}" data-action="edit-event" data-id="${id}">
      <div class="oc-ticket-date"><span class="num">${numHtml}</span></div>
      <div class="oc-ticket-body">
        <div class="oc-ticket-title">${escapeHtml(title)}</div>
        ${metaHtml || ""}
        ${link ? `<a class="oc-ticket-link" href="${link}" target="_blank" rel="noopener" data-action="stop">🔗 リンクを開く</a>` : ""}
      </div>
      <div class="oc-ticket-badge">${escapeHtml(badgeText)}</div>
    </div>
  `;
}

export function ticketToday(e, categories) {
  const c = catOf(categories, e.category);
  return buildTicket({
    id: e.id, color: c.color,
    numHtml: e.yearly ? starIcon("oc-ticket-star", c.color) : fromDateStr(e.date).getDate(),
    title: e.title,
    metaHtml: e.note ? `<div class="oc-ticket-meta">${escapeHtml(e.note)}</div>` : "",
    badgeText: c.name,
    url: e.url,
  });
}

export function ticketCountdown(e, categories, nextDate, today) {
  const c = catOf(categories, e.category);
  const dLeft = daysUntil(nextDate, today);
  const label = dLeft === 0 ? "今日" : dLeft === 1 ? "明日" : `あと${dLeft}日`;
  return buildTicket({
    id: e.id, color: c.color,
    numHtml: `${nextDate.getMonth() + 1}/${nextDate.getDate()}`,
    title: e.title,
    metaHtml: `<div class="oc-ticket-meta">${escapeHtml(c.name)}${e.yearly ? "・毎年" : ""}</div>`,
    badgeText: label,
    url: e.url,
  });
}

export function ticketSearch(e, categories, occDate, today) {
  const c = catOf(categories, e.category);
  const dLeft = daysUntil(occDate, today);
  const rel = dLeft === 0 ? "本日" : dLeft > 0 ? `あと${dLeft}日` : `${Math.abs(dLeft)}日前`;
  return buildTicket({
    id: e.id, color: c.color,
    numHtml: `${occDate.getMonth() + 1}/${occDate.getDate()}`,
    title: e.title,
    metaHtml: `<div class="oc-ticket-meta">${escapeHtml(c.name)} ・ ${rel}</div>`,
    badgeText: c.name,
    url: e.url,
  });
}

/* ---------------------------------------------------------------------- */
/* List card: search results / selected day / today+week split           */
/* ---------------------------------------------------------------------- */
export function renderListCard(state, today, computed) {
  const { searching, results, todays, upcoming, selectedEvents } = computed;

  if (searching) {
    return `
      <div class="oc-card">
        <div class="oc-section-title">
          ${starIcon("oc-section-star")}検索結果（${results.length}件）
          <select class="oc-sort-select" data-action="change-sort" aria-label="並び替え">
            <option value="date-asc" ${state.sortOrder === "date-asc" ? "selected" : ""}>日付が近い順</option>
            <option value="date-desc" ${state.sortOrder === "date-desc" ? "selected" : ""}>新しい順</option>
            <option value="category" ${state.sortOrder === "category" ? "selected" : ""}>カテゴリー順</option>
          </select>
        </div>
        ${results.length === 0
          ? `<div class="oc-empty">見つかりませんでした</div>`
          : results.map((r) => ticketSearch(r.event, state.categories, r.date, today)).join("")}
      </div>
    `;
  }

  if (state.selectedDate) {
    const sel = state.selectedDate;
    return `
      <div class="oc-card">
        <div class="oc-section-title">${starIcon("oc-section-star")}${sel.getMonth() + 1}月${sel.getDate()}日の予定</div>
        ${selectedEvents.length === 0
          ? `<div class="oc-empty">この日の予定はまだありません</div>`
          : selectedEvents.map((e) => ticketToday(e, state.categories)).join("")}
        <div class="oc-btn-row">
          <button class="oc-btn oc-btn-ghost" data-action="add-for-day" data-date="${toDateStr(sel)}">この日に追加</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="oc-card">
      <div class="oc-section-title">${starIcon("oc-section-star")}Today</div>
      ${todays.length === 0
        ? `<div class="oc-empty">今日の予定はありません</div>`
        : todays.map((e) => ticketToday(e, state.categories)).join("")}
    </div>
    <div class="oc-card">
      <div class="oc-section-title">${starIcon("oc-section-star")}Up Next</div>
      ${upcoming.length === 0
        ? `<div class="oc-empty">1週間以内の予定はありません</div>`
        : upcoming.map((e) => ticketCountdown(e, state.categories, e._next, today)).join("")}
    </div>
  `;
}

/* ---------------------------------------------------------------------- */
/* Add / edit event modal                                                 */
/* ---------------------------------------------------------------------- */
export function renderEventModal(state) {
  const ed = state.editing;
  if (!ed) return "";
  const catPills = state.categories.map((c) => `
    <div class="oc-cat-pill ${ed.category === c.id ? "sel" : ""}" style="--c:${c.color}" data-action="pick-category" data-id="${c.id}">
      ${starIcon("oc-chip-star", c.color)}${escapeHtml(c.name)}
    </div>
  `).join("") + `<div class="oc-cat-pill" data-action="toggle-addcat">＋ 追加</div>`;

  const addCatBlock = state.addingCat ? `
    <div>
      <div class="oc-newcat">
        <input class="oc-input" id="newCatName" placeholder="新しいカテゴリー名" />
      </div>
      <div class="oc-swatches">
        ${SWATCHES.map((s) => `<div class="oc-sw ${state.newCatColor === s ? "sel" : ""}" style="background:${s}" data-action="pick-swatch" data-color="${s}"></div>`).join("")}
      </div>
      <div class="oc-btn-row">
        <button class="oc-btn oc-btn-primary" data-action="commit-newcat">このカテゴリーを作成</button>
      </div>
    </div>
  ` : "";

  return `
  <div class="oc-overlay" data-action="close-modal" role="presentation">
    <div class="oc-modal" data-action="stop" role="dialog" aria-modal="true" aria-label="${ed.id ? "予定を編集" : "予定を追加"}">
      <div class="oc-modal-title">${ed.id ? "予定を編集" : "予定を追加"}</div>
      <div class="oc-field">
        <label class="oc-label" for="fieldTitle">タイトル</label>
        <input class="oc-input" id="fieldTitle" data-field="title" placeholder="例：〇〇 単独ライブ" value="${escapeHtml(ed.title)}" />
      </div>
      <div class="oc-field">
        <label class="oc-label">カテゴリー</label>
        <div class="oc-cat-grid">${catPills}</div>
        ${addCatBlock}
      </div>
      <div class="oc-field">
        <label class="oc-label" for="fieldDate">日付</label>
        <input type="date" class="oc-date" id="fieldDate" data-field="date" value="${ed.date}" />
      </div>
      <div class="oc-field">
        <label class="oc-yearly-row">
          <input type="checkbox" id="fieldYearly" data-field="yearly" ${ed.yearly ? "checked" : ""} />
          毎年繰り返す
        </label>
        <div class="oc-yearly-hint">「誕生日」カテゴリーを選ぶと自動でオンになります</div>
      </div>
      <div class="oc-field">
        <label class="oc-label" for="fieldUrl">URL（任意）</label>
        <input class="oc-input" id="fieldUrl" data-field="url" placeholder="チケットサイト・特設ページなど" value="${escapeHtml(ed.url || "")}" />
      </div>
      <div class="oc-field">
        <label class="oc-label" for="fieldNote">メモ（任意）</label>
        <textarea class="oc-textarea" id="fieldNote" data-field="note">${escapeHtml(ed.note || "")}</textarea>
      </div>
      <div class="oc-btn-row">
        ${ed.id ? `<button class="oc-btn oc-btn-danger" data-action="ask-delete-event">削除</button>` : ""}
        <button class="oc-btn oc-btn-ghost" data-action="close-modal">キャンセル</button>
        <button class="oc-btn oc-btn-primary" data-action="save-event">保存</button>
      </div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------------- */
/* Category manager                                                       */
/* ---------------------------------------------------------------------- */
export function renderCatManager(state) {
  if (!state.catManagerOpen) return "";
  const counts = state.categories.reduce((acc, c) => {
    acc[c.id] = state.events.filter((e) => e.category === c.id).length;
    return acc;
  }, {});
  const rows = state.categories.map((c) => `
    <div class="oc-catrow">
      <div class="oc-catrow-head">
        <input class="oc-input oc-catrow-name" data-catid="${c.id}" value="${escapeHtml(c.name)}" aria-label="カテゴリー名" />
        <span class="oc-catrow-count">${counts[c.id] || 0}件</span>
      </div>
      <div class="oc-swatches-inline">
        ${SWATCHES.map((s) => `<div class="oc-sw ${c.color === s ? "sel" : ""}" style="background:${s}" data-action="set-cat-color" data-id="${c.id}" data-color="${s}"></div>`).join("")}
      </div>
      ${state.categories.length > 1 ? `<button class="oc-catrow-del" data-action="ask-delete-cat" data-id="${c.id}">このカテゴリーを削除</button>` : ""}
    </div>
  `).join("");

  return `
  <div class="oc-overlay" data-action="close-catmanager" role="presentation">
    <div class="oc-modal" data-action="stop" role="dialog" aria-modal="true" aria-label="カテゴリーを編集">
      <div class="oc-modal-title">カテゴリーを編集</div>
      ${rows}
      <div class="oc-btn-row">
        <button class="oc-btn oc-btn-primary" data-action="close-catmanager">閉じる</button>
      </div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------------- */
/* Settings screen                                                        */
/* ---------------------------------------------------------------------- */
export function renderSettings(state) {
  if (!state.settingsOpen) return "";
  return `
  <div class="oc-overlay" data-action="close-settings" role="presentation">
    <div class="oc-modal" data-action="stop" role="dialog" aria-modal="true" aria-label="設定">
      <div class="oc-modal-title">設定</div>

      <div class="oc-settings-section">
        <div class="oc-settings-heading">データ管理</div>
        <div class="oc-settings-row">
          <div>
            <div class="oc-settings-row-label">保存されている予定</div>
            <div class="oc-settings-row-desc">${state.events.length}件・カテゴリー${state.categories.length}個</div>
          </div>
        </div>
        <div class="oc-settings-row">
          <div>
            <div class="oc-settings-row-label">すべてのデータを削除</div>
            <div class="oc-settings-row-desc">予定とカテゴリーをすべて消去します</div>
          </div>
          <button class="oc-btn oc-btn-danger" style="flex:none;" data-action="ask-reset-all">削除</button>
        </div>
      </div>

      <div class="oc-settings-section">
        <div class="oc-settings-heading">テーマ</div>
        <div class="oc-settings-row">
          <div class="oc-settings-row-label">表示</div>
          <div class="oc-theme-toggle">
            <button class="${state.theme === "dark" ? "active" : ""}" data-action="set-theme" data-theme="dark">夜空</button>
            <button class="${state.theme === "light" ? "active" : ""}" data-action="set-theme" data-theme="light">やわらか</button>
          </div>
        </div>
      </div>

      <div class="oc-settings-section">
        <div class="oc-settings-heading">バックアップ</div>
        <div class="oc-settings-row">
          <div>
            <div class="oc-settings-row-label">JSONで書き出す</div>
            <div class="oc-settings-row-desc">機種変更前に保存しておくと安心です</div>
          </div>
          <button class="oc-btn oc-btn-ghost" style="flex:none;" data-action="export-backup">書き出す</button>
        </div>
        <div class="oc-settings-row">
          <div>
            <div class="oc-settings-row-label">JSONから復元</div>
            <div class="oc-settings-row-desc">バックアップファイルを選んで復元します</div>
          </div>
          <button class="oc-btn oc-btn-ghost" style="flex:none;" data-action="trigger-import">復元する</button>
        </div>
        <input type="file" id="importFileInput" class="oc-file-input" accept="application/json,.json" />
      </div>

      <div class="oc-settings-section">
        <div class="oc-settings-heading">アプリ情報</div>
        <div class="oc-about">
          My Constellation v${escapeHtml(state.version)}<br />
          好きなもの・楽しみにしていることだけを集める、あなただけの星座。<br />
          データはこの端末のブラウザ内に保存されます。
        </div>
      </div>

      <div class="oc-btn-row">
        <button class="oc-btn oc-btn-primary" data-action="close-settings">閉じる</button>
      </div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------------- */
/* Confirm dialog (delete / reset / import overwrite)                     */
/* ---------------------------------------------------------------------- */
export function renderConfirm(state) {
  const c = state.confirm;
  if (!c) return "";
  return `
  <div class="oc-overlay" data-action="cancel-confirm" role="presentation">
    <div class="oc-modal oc-confirm" data-action="stop" role="alertdialog" aria-modal="true" aria-label="${escapeHtml(c.title)}">
      <div class="oc-confirm-title">${escapeHtml(c.title)}</div>
      <div class="oc-confirm-body">${escapeHtml(c.body)}</div>
      <div class="oc-btn-row">
        <button class="oc-btn oc-btn-ghost" data-action="cancel-confirm">キャンセル</button>
        <button class="oc-btn oc-btn-danger" data-action="confirm-yes">${escapeHtml(c.confirmLabel || "削除する")}</button>
      </div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------------- */
/* Toast + splash                                                         */
/* ---------------------------------------------------------------------- */
export function renderToast(state) {
  if (!state.toast) return "";
  return `
    <div class="oc-toast-wrap" aria-live="polite">
      <div class="oc-toast">${escapeHtml(state.toast)}</div>
    </div>
  `;
}

export function splashHtml() {
  return `
    <div class="oc-splash" id="splash">
      ${starIcon("oc-splash-star")}
      <div class="oc-splash-text">My Constellation</div>
    </div>
  `;
}
