/*
 * My Constellation — holidays.js
 * Computes Japanese national holidays (祝日) for a given year, including
 * substitute holidays (振替休日). Formulas are the standard modern rule
 * set and are accurate for 1980–2099. Results are cached per year since
 * the calendar re-renders often but the holiday set never changes.
 */
import { pad, toDateStr, fromDateStr } from "./utils.js";

function nthWeekdayOfMonth(year, month, weekday, n) {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

const holidayCache = {};

export function japaneseHolidays(year) {
  if (holidayCache[year]) return holidayCache[year];
  const set = new Set();
  const add = (m, d) => set.add(`${year}-${pad(m)}-${pad(d)}`);

  add(1, 1); // 元日
  const comingOfAge = nthWeekdayOfMonth(year, 0, 1, 2);
  add(comingOfAge.getMonth() + 1, comingOfAge.getDate()); // 成人の日
  add(2, 11); // 建国記念の日
  if (year >= 2020) add(2, 23); // 天皇誕生日
  const springEq = Math.floor(20.8431 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
  add(3, springEq); // 春分の日
  add(4, 29); // 昭和の日
  add(5, 3); add(5, 4); add(5, 5); // 憲法記念日・みどりの日・こどもの日
  const marine = nthWeekdayOfMonth(year, 6, 1, 3);
  add(marine.getMonth() + 1, marine.getDate()); // 海の日
  add(8, 11); // 山の日
  const respect = nthWeekdayOfMonth(year, 8, 1, 3);
  add(respect.getMonth() + 1, respect.getDate()); // 敬老の日
  const autumnEq = Math.floor(23.2488 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
  add(9, autumnEq); // 秋分の日
  const sports = year >= 2000 ? nthWeekdayOfMonth(year, 9, 1, 2) : new Date(year, 9, 10);
  add(sports.getMonth() + 1, sports.getDate()); // スポーツの日
  add(11, 3); // 文化の日
  add(11, 23); // 勤労感謝の日

  // 振替休日: a holiday landing on Sunday pushes to the next non-holiday day
  const extra = [];
  set.forEach((ds) => {
    const d = fromDateStr(ds);
    if (d.getDay() === 0) {
      const sub = new Date(d);
      do { sub.setDate(sub.getDate() + 1); } while (set.has(toDateStr(sub)));
      extra.push(toDateStr(sub));
    }
  });
  extra.forEach((ds) => set.add(ds));

  holidayCache[year] = set;
  return set;
}

export function isHoliday(date) {
  return japaneseHolidays(date.getFullYear()).has(toDateStr(date));
}
