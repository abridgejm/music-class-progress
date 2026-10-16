// Olympia Music Class Tracker: all data stays in this browser (localStorage).
(() => {
  "use strict";

  const STORAGE_KEY = "musicClass.v1";
  const BACKUP_REMINDER_DAYS = 30;
  const ATTENDANCE = [
    { v: "present", label: "Present" },
    { v: "absent", label: "Absent" },
  ];
  const FEE_STATUS = { unpaid: "Unpaid", partial: "Partial", paid: "Paid" };
  // Week fields that can be shared across ticked kids
  const SAME = {
    lessonLearnt: { flag: "sameLesson", all: "#sameLessonAll" },
    practice: { flag: "samePractice", all: "#samePracticeAll" },
  };
  const SONG_STATUS = [
    { v: "learning", label: "🌱 Learning" },
    { v: "gotit", label: "✅ Got it" },
    { v: "ready", label: "⭐ Performance-ready" },
  ];
  const songStatusLabel = (v) => SONG_STATUS.find((x) => x.v === v)?.label || "";

  // ---------- Storage ----------
  let storageOk = true;
  const defaultBatches = () => [
    { id: "wed", name: "Wednesday", day: 2, startTime: "", endTime: "", startDate: "", color: 0 },
    { id: "fri", name: "Friday", day: 4, startTime: "", endTime: "", startDate: "", color: 1 },
  ];
  const emptyData = () => ({ students: [], weeks: {}, fees: {}, songs: {}, settings: {}, batches: defaultBatches(), lastBackup: null });
  const DEFAULT_SETTINGS = { className: "Olympia Music Class Tracker", teacherName: "", greeting: "Hi!", signOff: "See you next week! 🎶", countryCode: "" };
  const setting = (k) => (data.settings?.[k] || "").trim() || DEFAULT_SETTINGS[k];

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalize(JSON.parse(raw)) : emptyData();
    } catch {
      storageOk = false;
      return emptyData();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      storageOk = true;
    } catch {
      storageOk = false;
      renderBanners();
    }
  }

  function normalize(d) {
    if (!d || typeof d !== "object") throw new Error("Not a backup file");
    if (!Array.isArray(d.students)) throw new Error("Missing students");
    // "Excused" was removed; older entries count as absent
    Object.values(d.weeks || {}).forEach((w) =>
      Object.values(w || {}).forEach((e) => { if (e && e.attendance === "excused") e.attendance = "absent"; }));
    return {
      students: d.students.filter((s) => s && s.id && typeof s.name === "string"),
      weeks: d.weeks && typeof d.weeks === "object" ? d.weeks : {},
      fees: d.fees && typeof d.fees === "object" ? d.fees : {},
      songs: d.songs && typeof d.songs === "object" ? d.songs : {},
      batches: Array.isArray(d.batches) ? d.batches.filter((b) => b && b.id && typeof b.name === "string") : defaultBatches(),
      settings: d.settings && typeof d.settings === "object" ? d.settings : {},
      lastBackup: d.lastBackup || null,
    };
  }

  let data = load();

  // ---------- Dates ----------
  const pad = (n) => String(n).padStart(2, "0");
  const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = (k) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d || 1);
  };
  function mondayOf(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const monthKeyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const addMonths = (k, n) => {
    const d = parseKey(k);
    return monthKeyOf(new Date(d.getFullYear(), d.getMonth() + n, 1));
  };
  const fmtDay = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const fmtMonth = (k) => parseKey(k).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  // ---------- State ----------
  let currentWeek = dateKey(mondayOf(new Date()));
  let currentMonth = monthKeyOf(new Date());
  let calMonth = monthKeyOf(new Date());
  let currentTab = "week";

  // ---------- Helpers ----------
  const $ = (s) => document.querySelector(s);
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  // Batches repeat weekly on their day (0 = Monday … 6 = Sunday) from their start date
  const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const BATCH_COLORS = 6;
  const allBatches = () => data.batches;
  const batchById = (id) => data.batches.find((b) => b.id === id) || null;
  const batchOf = (s) => batchById(s?.batch);
  // 3-letter label (e.g. "Wed"), or the full name when two batches would look the same
  const shortName = (b) => {
    const s = b.name.slice(0, 3);
    const clash = data.batches.some((o) => o !== b && o.name.slice(0, 3).toLowerCase() === s.toLowerCase());
    return clash || b.name.length <= 4 ? b.name : s;
  };
  const batchStyle = (b) => `--c: var(--b${b.color % BATCH_COLORS}); --cs: var(--b${b.color % BATCH_COLORS}-soft)`;
  const hasStarted = (b, date) => !b.startDate || dateKey(date) >= b.startDate;
  const fmtTime = (t) => {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  };
  const timeText = (b) => (b?.startTime ? `${fmtTime(b.startTime)}${b.endTime ? `–${fmtTime(b.endTime)}` : ""}` : "");
  let currentBatch = "wed";
  try { currentBatch = sessionStorage.getItem("musicClass.batch") || currentBatch; } catch {}
  // Kids show only in their own batch; kids without one appear under All
  const inBatch = (s) => currentBatch === "all" || s.batch === currentBatch;
  const unassigned = () => data.students.filter((s) => !s.archived && !batchOf(s));
  const activeStudents = () =>
    data.students.filter((s) => !s.archived && inBatch(s)).sort((a, b) => a.name.localeCompare(b.name));
  // The actual class day within a Monday-keyed week
  const classDay = (week, batch) => addDays(parseKey(week), batch ? batch.day : 0);
  const studentById = (id) => data.students.find((s) => s.id === id);

  function weekEntry(week, id, create = false) {
    if (!data.weeks[week]) {
      if (!create) return {};
      data.weeks[week] = {};
    }
    if (!data.weeks[week][id]) {
      if (!create) return {};
      data.weeks[week][id] = {};
    }
    return data.weeks[week][id];
  }

  function feeEntry(month, id, create = false) {
    if (!data.fees[month]) {
      if (!create) return {};
      data.fees[month] = {};
    }
    if (!data.fees[month][id]) {
      if (!create) return {};
      data.fees[month][id] = {};
    }
    return data.fees[month][id];
  }

  // Missed = absent, counted over all weeks or only weeks starting in a month
  function missedCount(id, month = null) {
    let missed = 0;
    for (const [week, entries] of Object.entries(data.weeks)) {
      if (month && week.slice(0, 7) !== month) continue;
      const a = entries[id]?.attendance;
      if (a === "absent") missed++;
    }
    return { missed };
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---------- Banners ----------
  function renderBanners() {
    const out = [];
    if (!storageOk) {
      out.push(`<div class="banner warn"><span>⚠️ This browser is blocking saved data, so changes will be lost when you close the page. Try a normal (non-private) window.</span></div>`);
    } else if (data.students.length) {
      const last = data.lastBackup ? new Date(data.lastBackup) : null;
      const stale = !last || Date.now() - last.getTime() > BACKUP_REMINDER_DAYS * 864e5;
      if (stale) {
        out.push(`<div class="banner no-print"><span>💾 ${last ? `Last backup was ${fmtDay(last)}.` : "You haven't made a backup yet."} Your class data lives only in this browser, so grab a copy now and then.</span><button type="button" class="btn small primary" data-action="backup">Download backup</button></div>`);
      }
    }
    const loose = unassigned().length;
    if (loose) {
      const msg = `👋 ${loose} kid${loose === 1 ? " doesn't" : "s don't"} have a batch yet${currentBatch === "all" ? "" : ", so they're only shown under All"}.`;
      out.push(`<div class="banner warn no-print"><span>${msg}</span>${currentTab === "students" && currentBatch === "all" ? "" : `<button type="button" class="btn small primary" data-action="assign-batches">Assign batches</button>`}</div>`);
    }
    $("#banners").innerHTML = out.join("");
  }

  // ---------- Tabs ----------
  function showTab(tab) {
    currentTab = tab;
    document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    ["students", "week", "calendar", "songs", "fees"].forEach((t) => ($(`#tab-${t}`).hidden = t !== tab));
    try { sessionStorage.setItem("musicClass.tab", tab); } catch {}
    render();
  }

  // ---------- Weekly view ----------
  function feeBadge(id, month) {
    const status = feeEntry(month, id).status || "unpaid";
    if (status === "paid") return "";
    return `<span class="badge ${status}">Fees ${FEE_STATUS[status].toLowerCase()}</span>`;
  }

  function renderWeek() {
    const monday = parseKey(currentWeek);
    const month = monthKeyOf(monday);
    $("#weekLabel").textContent = `Week of ${fmtDay(monday)}`;
    const batch = batchById(currentBatch);
    const cd = batch && classDay(currentWeek, batch);
    $("#classDate").textContent = !batch ? "All batches"
      : hasStarted(batch, cd) ? `${batch.name} class · ${fmtDay(cd)}${timeText(batch) ? ` · ${timeText(batch)}` : ""}`
      : `${batch.name} batch starts ${fmtDay(parseKey(batch.startDate))}`;
    const kids = activeStudents();
    $("#weekEmpty").hidden = kids.length > 0;
    $("#weekRows").closest(".table-scroll").hidden = kids.length === 0;

    $("#weekRows").innerHTML = kids.map((s) => {
      const e = weekEntry(currentWeek, s.id);
      const m = missedCount(s.id, month);
      const t = missedCount(s.id);
      return `
        <tr data-id="${s.id}" class="${e.attendance === "absent" ? "is-absent" : ""}">
          <td>
            <button type="button" class="kid-name" data-action="history">${esc(s.name)}</button>
            ${feeBadge(s.id, month)}
            <div class="send-btns no-print">
              <button type="button" class="btn small ghost" data-action="share" aria-label="Text ${esc(s.name)}'s update to their parent">💬 Messages</button>
              <button type="button" class="btn small ghost" data-action="whatsapp" aria-label="Send ${esc(s.name)}'s update on WhatsApp">🟢 WhatsApp</button>
              <button type="button" class="btn small ghost" data-action="email" aria-label="Email ${esc(s.name)}'s update to their parent">✉️ Email</button>
            </div>
          </td>
          <td>
            <div class="att" role="group" aria-label="Attendance for ${esc(s.name)}">
              ${ATTENDANCE.map((a) => `<button type="button" data-v="${a.v}" aria-pressed="${e.attendance === a.v}">${a.label}</button>`).join("")}
            </div>
          </td>
          <td>
            <textarea data-field="lessonLearnt" rows="2" placeholder="e.g. Breathing, a new song verse">${esc(e.lessonLearnt)}</textarea>
            <label class="same-lesson no-print"><input type="checkbox" data-same="lessonLearnt" ${e.sameLesson ? "checked" : ""}> Same lesson</label>
          </td>
          <td>
            <textarea data-field="practice" rows="2" placeholder="e.g. Warm-ups 10 min daily">${esc(e.practice)}</textarea>
            <label class="same-lesson no-print"><input type="checkbox" data-same="practice" ${e.samePractice ? "checked" : ""}> Same practice</label>
          </td>
          <td><textarea data-field="notes" rows="2" placeholder="Optional">${esc(e.notes)}</textarea></td>
          <td class="missed ${t.missed ? "has" : ""}">
            ${m.missed} this month<br><span class="kid-sub">${t.missed} total</span>
          </td>
        </tr>`;
    }).join("");
    Object.values(SAME).forEach((cfg) => {
      $(cfg.all).checked = kids.length > 0 && kids.every((k) => !!weekEntry(currentWeek, k.id)[cfg.flag]);
    });
    renderWeekSummary();
  }

  function renderWeekSummary() {
    const kids = activeStudents();
    const month = monthKeyOf(parseKey(currentWeek));
    const counts = { present: 0, absent: 0, unmarked: 0 };
    kids.forEach((s) => {
      const a = weekEntry(currentWeek, s.id).attendance;
      counts[a || "unmarked"]++;
    });
    const unpaid = kids.filter((s) => (feeEntry(month, s.id).status || "unpaid") !== "paid").length;
    $("#weekSummary").innerHTML = kids.length ? `
      <span class="stat"><b>${counts.present}</b>present</span>
      <span class="stat"><b>${counts.absent}</b>absent</span>
      <span class="stat"><b>${counts.unmarked}</b>not marked</span>
      <span class="stat"><b>${unpaid}</b>fees not fully paid (${esc(fmtMonth(month))})</span>` : "";
  }

  function copyLastWeekPractice() {
    const prev = dateKey(addDays(parseKey(currentWeek), -7));
    let copied = 0;
    activeStudents().forEach((s) => {
      const from = weekEntry(prev, s.id).practice;
      const to = weekEntry(currentWeek, s.id);
      if (from && !to.practice) {
        weekEntry(currentWeek, s.id, true).practice = from;
        copied++;
      }
    });
    save();
    renderWeek();
    toast(copied ? `Copied practice for ${copied} kid${copied > 1 ? "s" : ""}` : "Nothing to copy from last week");
  }

  function csvCell(v) {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportCsv() {
    const month = monthKeyOf(parseKey(currentWeek));
    const rows = [["Week of", "Kid", "Batch", "Attendance", "Lesson learnt", "Practice lesson", "Notes", "Missed this month", "Missed total", "Fee status"]];
    activeStudents().forEach((s) => {
      const e = weekEntry(currentWeek, s.id);
      rows.push([
        currentWeek, s.name, batchOf(s)?.name || "", e.attendance || "", e.lessonLearnt, e.practice, e.notes,
        missedCount(s.id, month).missed, missedCount(s.id).missed,
        FEE_STATUS[feeEntry(month, s.id).status || "unpaid"],
      ]);
    });
    download(`music-class-week-${currentWeek}.csv`, rows.map((r) => r.map(csvCell).join(",")).join("\n"), "text/csv");
  }

  // ---------- Share with parents ----------
  // Teacher notes stay private; fees are mentioned only when not fully paid,
  // and only in the last class week of the month
  const isLastWeekOfMonth = (week) => monthKeyOf(addDays(parseKey(week), 7)) !== week.slice(0, 7);

  function parentMessage(id) {
    const s = studentById(id);
    const monday = parseKey(currentWeek);
    const month = monthKeyOf(monday);
    const e = weekEntry(currentWeek, id);
    const b = batchOf(s);
    const when = b ? `${b.name}'s class on ${fmtDay(classDay(currentWeek, b))}${timeText(b) ? ` (${timeText(b)})` : ""}` : `the week of ${fmtDay(monday)}`;
    const lines = [`${setting("greeting")} Here's ${s.name}'s singing update for ${when} 🎤`, ""];
    if (e.attendance === "present") lines.push("✅ Attended class");
    if (e.attendance === "absent") lines.push("❌ Missed class this week");
    if (e.lessonLearnt?.trim()) lines.push(`📖 Learnt: ${e.lessonLearnt.trim()}`);
    if (e.practice?.trim()) lines.push(`🏠 Practice at home: ${e.practice.trim()}`);
    lines.push(...missedReport(id, month));
    // Songs and skills whose status changed during this week
    const weekEnd = dateKey(addDays(monday, 7));
    const changed = (data.songs[id] || []).filter((x) => x.updated >= currentWeek && x.updated < weekEnd);
    if (changed.length) {
      lines.push("🎵 Songs & skills:");
      changed.forEach((x) => lines.push(`   • ${x.title}: ${songStatusLabel(x.status)}`));
    }
    if (isLastWeekOfMonth(currentWeek)) {
      const f = feeEntry(month, id);
      const status = f.status || "unpaid";
      if (status === "unpaid") lines.push(`💳 Friendly reminder: ${fmtMonth(month)} fees are still due.`);
      if (status === "partial") lines.push(`💳 Friendly reminder: ${fmtMonth(month)} fees are partly paid${Number(f.amount) ? ` (${f.amount} received)` : ""}.`);
    }
    lines.push("", setting("signOff"));
    if (setting("teacherName")) lines.push(`– ${setting("teacherName")}`);
    return lines.join("\n");
  }

  // Missed classes this month (with dates) plus the running total
  function missedReport(id, month) {
    const monthName = parseKey(month).toLocaleDateString(undefined, { month: "long" });
    const dates = Object.keys(data.weeks)
      .filter((w) => w.slice(0, 7) === month && data.weeks[w][id]?.attendance === "absent")
      .sort()
      .map((w) => {
        const b = batchOf(studentById(id));
        const d = classDay(w, b).toLocaleDateString(undefined, { month: "short", day: "numeric" });
        return b ? `${shortName(b)}, ${d}` : `Week of ${d}`;
      });
    const total = missedCount(id).missed;
    if (!dates.length) {
      return [`📅 No missed classes in ${monthName} 🌟${total ? ` (${total} missed in total)` : ""}`];
    }
    return [
      `📅 Missed classes in ${monthName}: ${dates.length}`,
      ...dates.map((d) => `   • ${d}`),
      `   Total missed so far: ${total}`,
    ];
  }

  const phoneOf = (contact) => {
    const digits = String(contact || "").replace(/[^\d+]/g, "");
    return digits.replace(/\D/g, "").length >= 7 ? digits : "";
  };

  // WhatsApp needs the number with its country code (no +, spaces or leading 0)
  function whatsappNumber(contact) {
    const raw = String(contact || "").trim();
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 7) return "";
    if (raw.startsWith("+")) return digits;
    if (raw.startsWith("00")) return digits.slice(2);
    const cc = setting("countryCode").replace(/\D/g, "");
    return cc ? cc + digits.replace(/^0+/, "") : "";
  }

  function whatsappUpdate(id) {
    const s = studentById(id);
    const num = whatsappNumber(s.contact);
    if (!num) toast(s.contact ? "Add your country code in ⚙️ Settings to open the parent's chat directly" : `No parent phone saved for ${s.name}. Pick the chat in WhatsApp`);
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(parentMessage(id))}`, "_blank", "noopener");
  }

  // Opens the teacher's email app with the update written; nothing is sent until they press Send
  function emailUpdate(id) {
    const s = studentById(id);
    const b = batchOf(s);
    const when = b ? `${shortName(b)}, ${fmtDay(classDay(currentWeek, b))}` : `week of ${fmtDay(parseKey(currentWeek))}`;
    const subject = `${s.name}'s singing update (${when})`;
    const to = (s.email || "").trim();
    if (!to) toast(`No parent email saved for ${s.name}. Add it on the Students tab`);
    location.href = `mailto:${encodeURIComponent(to).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(parentMessage(id))}`;
  }

  async function shareUpdate(id) {
    const s = studentById(id);
    const text = parentMessage(id);
    const phone = phoneOf(s.contact);
    // A saved parent phone number opens Messages addressed to them
    if (phone) {
      location.href = `sms:${phone}?&body=${encodeURIComponent(text)}`;
      return;
    }
    if (navigator.share) {
      try { await navigator.share({ text }); } catch { /* share sheet dismissed */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("Update copied. Paste it into Messages");
    } catch {
      prompt("Copy this update:", text);
    }
  }

  // ---------- Calendar ----------
  function classSummary(week, batch) {
    const kids = data.students.filter((s) => !s.archived && s.batch === batch.id);
    let present = 0, absent = 0;
    const lessons = new Set();
    kids.forEach((k) => {
      const e = weekEntry(week, k.id);
      if (e.attendance === "present") present++;
      if (e.attendance === "absent") absent++;
      if (e.lessonLearnt?.trim()) lessons.add(e.lessonLearnt.trim());
    });
    return { kids: kids.length, present, absent, lesson: [...lessons][0] || "", moreLessons: lessons.size > 1 };
  }

  function renderCalendar() {
    const first = parseKey(calMonth);
    $("#calMonthLabel").textContent = fmtMonth(calMonth);
    const todayKey = dateKey(new Date());
    const batches = allBatches().filter((b) => currentBatch === "all" || b.id === currentBatch);
    $("#calLegend").innerHTML = batches.map((b) => `<span><i class="dot" style="${batchStyle(b)}"></i>${esc(b.name)}${timeText(b) ? ` · ${timeText(b)}` : ""}${b.startDate && b.startDate > todayKey ? ` (from ${fmtDay(parseKey(b.startDate))})` : ""}</span>`).join("") + `<span>💳 Fee reminder week</span>`;
    const start = mondayOf(first);
    const cells = [];
    let classes = 0, marked = 0;
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((d) => cells.push(`<div class="cal-head" role="columnheader">${d}</div>`));
    for (let i = 0; i < 42; i++) {
      const day = addDays(start, i);
      if (i >= 35 && day.getMonth() !== first.getMonth()) break;
      const key = dateKey(day);
      const week = dateKey(mondayOf(day));
      const inMonth = day.getMonth() === first.getMonth();
      const chips = batches.filter((b) => dateKey(classDay(week, b)) === key && hasStarted(b, day)).map((b) => {
        const sum = classSummary(week, b);
        if (inMonth) { classes++; if (sum.present + sum.absent) marked++; }
        const past = key < todayKey;
        const status = sum.present + sum.absent
          ? `<span class="cal-att">✅ ${sum.present}${sum.absent ? ` · ❌ ${sum.absent}` : ""}</span>`
          : `<span class="cal-att muted">${past ? "Not marked" : `${sum.kids} kid${sum.kids === 1 ? "" : "s"}`}</span>`;
        const fee = isLastWeekOfMonth(week) ? `<span class="cal-fee" title="Fee reminders go out this week">💳</span>` : "";
        return `<button type="button" class="cal-class" style="${batchStyle(b)}" data-week="${week}" data-batch="${b.id}" aria-label="${esc(b.name)} class on ${fmtDay(day)}">
          <span class="cal-batch">${esc(shortName(b))}<span class="wide-only">${shortName(b) === b.name ? "" : esc(b.name.slice(3))}</span> ${fee}</span>
          ${timeText(b) ? `<span class="cal-time wide-only">${fmtTime(b.startTime)}</span>` : ""}
          ${status}
          ${sum.lesson ? `<span class="cal-lesson">${esc(sum.lesson)}${sum.moreLessons ? " +" : ""}</span>` : ""}
        </button>`;
      }).join("");
      cells.push(`<div class="cal-day ${inMonth ? "" : "other"} ${key === todayKey ? "today" : ""}" role="gridcell">
        <span class="cal-num">${day.getDate()}</span>${chips}</div>`);
    }
    $("#calendar").innerHTML = cells.join("");
    $("#calSummary").innerHTML = `<span class="stat"><b>${classes}</b>classes this month</span><span class="stat"><b>${marked}</b>with attendance marked</span>`;
  }

  // ---------- Songs & skills ----------
  let songKid = null;
  const sortedSongs = (id) =>
    [...(data.songs[id] || [])].sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));

  function renderSongs() {
    const kids = activeStudents();
    $("#songEmpty").hidden = kids.length > 0;
    $("#songsBody").hidden = kids.length === 0;
    if (!kids.length) return;
    if (!kids.some((k) => k.id === songKid)) songKid = kids[0].id;
    $("#songKid").innerHTML = kids.map((k) => `<option value="${k.id}" ${k.id === songKid ? "selected" : ""}>${esc(k.name)}</option>`).join("");
    const items = sortedSongs(songKid);
    const counts = Object.fromEntries(SONG_STATUS.map((x) => [x.v, 0]));
    items.forEach((x) => counts[x.status]++);
    $("#songSummary").innerHTML = items.length ? SONG_STATUS.map((x) => `<span class="stat"><b>${counts[x.v]}</b>${x.label}</span>`).join("") : "";
    $("#songRows").innerHTML = items.length ? items.map((x) => `
      <tr data-song="${x.id}">
        <td class="song-edit">
          <input data-song-field="title" value="${esc(x.title)}" aria-label="Song or skill name">
          <select data-song-field="kind" aria-label="Type"><option value="song" ${x.kind !== "skill" ? "selected" : ""}>Song</option><option value="skill" ${x.kind === "skill" ? "selected" : ""}>Skill</option></select>
        </td>
        <td><div class="att" role="group" aria-label="Status for ${esc(x.title)}">
          ${SONG_STATUS.map((st) => `<button type="button" data-v="${st.v}" aria-pressed="${x.status === st.v}">${st.label}</button>`).join("")}
        </div></td>
        <td class="kid-sub">${x.updated ? esc(fmtDay(parseKey(x.updated))) : ""}</td>
        <td><button type="button" class="btn small ghost danger" data-action="remove-song">Remove</button></td>
      </tr>`).join("")
      : `<tr><td colspan="4" class="empty">No songs or skills yet. Add one above.</td></tr>`;
  }

  function addSong(kind, title, everyone) {
    const today = dateKey(new Date());
    const ids = everyone ? activeStudents().map((k) => k.id) : [songKid];
    let added = 0;
    ids.forEach((id) => {
      const list = (data.songs[id] ||= []);
      if (list.some((x) => x.title.toLowerCase() === title.toLowerCase())) return;
      list.push({ id: uid(), kind, title, status: "learning", updated: today });
      added++;
    });
    save();
    renderSongs();
    toast(everyone ? `Added "${title}" for ${added} kid${added === 1 ? "" : "s"}` : added ? `Added "${title}"` : `"${title}" is already on the list`);
  }

  // ---------- Fees ----------
  function renderFees() {
    $("#monthLabel").textContent = fmtMonth(currentMonth);
    const kids = activeStudents();
    $("#feeEmpty").hidden = kids.length > 0;
    $("#feeRows").closest(".table-scroll").hidden = kids.length === 0;
    $("#feeRows").innerHTML = kids.map((s) => {
      const f = feeEntry(currentMonth, s.id);
      const status = f.status || "unpaid";
      return `
        <tr data-id="${s.id}">
          <td><button type="button" class="kid-name" data-action="history">${esc(s.name)}</button>
            <span class="badge ${status}">${FEE_STATUS[status]}</span></td>
          <td><select data-fee="status" aria-label="Fee status for ${esc(s.name)}">
            ${Object.entries(FEE_STATUS).map(([v, l]) => `<option value="${v}" ${v === status ? "selected" : ""}>${l}</option>`).join("")}
          </select></td>
          <td><input data-fee="amount" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(f.amount)}" placeholder="0.00" aria-label="Amount paid by ${esc(s.name)}"></td>
          <td><input data-fee="paidOn" type="date" value="${esc(f.paidOn)}" aria-label="Date ${esc(s.name)} paid"></td>
        </tr>`;
    }).join("");
    renderFeeSummary();
  }

  function renderFeeSummary() {
    const kids = activeStudents();
    const c = { paid: 0, partial: 0, unpaid: 0 };
    let total = 0;
    kids.forEach((s) => {
      const f = feeEntry(currentMonth, s.id);
      c[f.status || "unpaid"]++;
      total += Number(f.amount) || 0;
    });
    $("#feeSummary").innerHTML = kids.length ? `
      <span class="stat"><b>${c.paid}</b>paid</span>
      <span class="stat"><b>${c.partial}</b>partial</span>
      <span class="stat"><b>${c.unpaid}</b>unpaid</span>
      <span class="stat"><b>${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>collected</span>` : "";
  }

  // ---------- Students ----------
  function renderStudents() {
    const all = data.students.filter(inBatch).sort((a, b) => (a.archived - b.archived) || a.name.localeCompare(b.name));
    const rowHtml = (s) => `
      <tr data-id="${s.id}" class="${s.archived ? "archived" : ""} ${batchOf(s) ? "" : "needs-batch"}">
        <td><input data-student="name" value="${esc(s.name)}" aria-label="Name"></td>
        <td><div class="att batch-toggle" role="group" aria-label="Batch for ${esc(s.name)}">
          ${allBatches().map((b) => `<button type="button" data-set-batch="${b.id}" aria-pressed="${s.batch === b.id}">${esc(shortName(b))}</button>`).join("")}
        </div></td>
        <td><input data-student="contact" value="${esc(s.contact)}" aria-label="Parent phone"></td>
        <td><input data-student="email" type="email" value="${esc(s.email)}" aria-label="Parent email"></td>
        <td class="missed">${missedCount(s.id).missed}</td>
        <td><div class="row-actions">
          <button type="button" class="btn small ghost" data-action="history">History</button>
          <button type="button" class="btn small ghost" data-action="archive">${s.archived ? "Restore" : "Archive"}</button>
          <button type="button" class="btn small ghost danger" data-action="delete">Delete</button>
        </div></td>
      </tr>`;
    const group = (title, kids) => kids.length ? `<tr class="group-row"><td colspan="6">${title} · ${kids.length} kid${kids.length === 1 ? "" : "s"}</td></tr>${kids.map(rowHtml).join("")}` : "";
    $("#studentRows").innerHTML = !all.length
      ? `<tr><td colspan="6" class="empty">No kids in this batch yet. Add one above.</td></tr>`
      : currentBatch === "all"
        ? group("⚠️ Needs a batch", all.filter((s) => !batchOf(s))) + allBatches().map((b) => group(`${esc(b.name)} batch`, all.filter((s) => s.batch === b.id))).join("")
        : all.map(rowHtml).join("");
  }

  // ---------- Batch manager ----------
  const dayOptions = (sel) => DAY_NAMES.map((d, i) => `<option value="${i}" ${i === sel ? "selected" : ""}>${d}</option>`).join("");

  function renderBatches() {
    const todayKey = dateKey(new Date());
    $("#batchRows").innerHTML = allBatches().length ? allBatches().map((b) => {
      const kids = data.students.filter((s) => !s.archived && s.batch === b.id).length;
      const upcoming = b.startDate && b.startDate > todayKey;
      return `<tr data-batch-id="${b.id}">
        <td data-label="Batch"><span class="batch-name"><i class="dot" style="${batchStyle(b)}"></i><input data-batch-field="name" value="${esc(b.name)}" aria-label="Batch name"></span>
          ${upcoming ? `<span class="badge partial">Starts ${esc(fmtDay(parseKey(b.startDate)))}</span>` : ""}</td>
        <td data-label="Day"><select data-batch-field="day" aria-label="Day">${dayOptions(b.day)}</select></td>
        <td data-label="Time"><div class="time-range"><input type="time" data-batch-field="startTime" value="${esc(b.startTime)}" aria-label="Start time"><span>to</span><input type="time" data-batch-field="endTime" value="${esc(b.endTime)}" aria-label="End time"></div></td>
        <td data-label="Starts on"><input type="date" data-batch-field="startDate" value="${esc(b.startDate)}" aria-label="Starts on"></td>
        <td class="kid-sub">${kids} kid${kids === 1 ? "" : "s"}</td>
        <td><button type="button" class="btn small ghost danger" data-action="remove-batch">Remove</button></td>
      </tr>`;
    }).join("") : `<tr><td colspan="6" class="empty">No batches yet. Add one below.</td></tr>`;
    const f = $("#addBatch");
    if (!f.dataset.ready) { f.day.innerHTML = dayOptions(5); f.dataset.ready = "1"; }
  }

  function addBatch(form) {
    const day = Number(form.day.value);
    const used = new Set(allBatches().map((b) => b.color));
    let color = 0;
    while (used.has(color) && color < BATCH_COLORS - 1) color++;
    const b = {
      id: uid(), name: form.name.value.trim() || DAY_NAMES[day], day,
      startTime: form.startTime.value, endTime: form.endTime.value, startDate: form.startDate.value, color,
    };
    data.batches.push(b);
    save();
    form.reset();
    form.day.value = "5";
    render();
    toast(`${b.name} batch added${b.startDate ? `, starting ${fmtDay(parseKey(b.startDate))}` : ""}`);
  }

  function removeBatch(id) {
    const b = batchById(id);
    const kids = data.students.filter((s) => s.batch === id);
    const msg = kids.length
      ? `Remove the ${b.name} batch? Its ${kids.length} kid${kids.length === 1 ? "" : "s"} will move to "Needs a batch". Their history is kept.`
      : `Remove the ${b.name} batch?`;
    if (!confirm(msg)) return;
    data.batches = data.batches.filter((x) => x.id !== id);
    kids.forEach((s) => (s.batch = ""));
    save();
    render();
    toast(`${b.name} batch removed`);
  }

  function deleteStudent(id) {
    const s = studentById(id);
    if (!s || !confirm(`Delete ${s.name} and all their history? This can't be undone. (Tip: Archive keeps their history.)`)) return;
    data.students = data.students.filter((x) => x.id !== id);
    Object.values(data.weeks).forEach((w) => delete w[id]);
    Object.values(data.fees).forEach((m) => delete m[id]);
    delete data.songs[id];
    save();
    render();
    toast(`${s.name} deleted`);
  }

  // ---------- History ----------
  function openHistory(id) {
    const s = studentById(id);
    if (!s) return;
    const weeks = Object.keys(data.weeks).filter((w) => data.weeks[w][id] && Object.values(data.weeks[w][id]).some(Boolean)).sort().reverse();
    const months = Object.keys(data.fees).filter((m) => data.fees[m][id]).sort().reverse();
    const t = missedCount(id);
    const attLabel = (a) => (ATTENDANCE.find((x) => x.v === a)?.label || "—");

    $("#historyTitle").textContent = batchOf(s) ? `${s.name} · ${batchOf(s).name} batch` : s.name;
    $("#historyBody").innerHTML = `
      <div class="summary">
        <span class="stat"><b>${weeks.filter((w) => data.weeks[w][id].attendance === "present").length}</b>classes attended</span>
        <span class="stat"><b>${t.missed}</b>missed</span>
        ${s.contact ? `<span class="stat">📱 ${esc(s.contact)}</span>` : ""}
        ${s.email ? `<span class="stat">✉️ ${esc(s.email)}</span>` : ""}
      </div>
      <h3>Weekly progress</h3>
      ${weeks.length ? `<div class="table-scroll"><table class="grid">
        <thead><tr><th>Week of</th><th>Attendance</th><th>Lesson learnt</th><th>Practice lesson</th><th>Notes</th></tr></thead>
        <tbody>${weeks.map((w) => {
          const e = data.weeks[w][id];
          return `<tr class="${e.attendance === "absent" ? "is-absent" : ""}"><td>${esc(fmtDay(parseKey(w)))}</td><td>${attLabel(e.attendance)}</td><td>${esc(e.lessonLearnt)}</td><td>${esc(e.practice)}</td><td>${esc(e.notes)}</td></tr>`;
        }).join("")}</tbody></table></div>` : `<p class="empty">No weeks recorded yet.</p>`}
      <h3>Songs &amp; skills</h3>
      ${(data.songs[id] || []).length ? `<div class="table-scroll"><table class="grid">
        <thead><tr><th>Song / skill</th><th>Status</th><th>Updated</th></tr></thead>
        <tbody>${sortedSongs(id).map((x) => `<tr><td>${esc(x.title)}<span class="kind">${x.kind === "skill" ? "Skill" : "Song"}</span></td><td>${songStatusLabel(x.status)}</td><td>${x.updated ? esc(fmtDay(parseKey(x.updated))) : ""}</td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">No songs or skills yet.</p>`}
      <h3>Fees</h3>
      ${months.length ? `<div class="table-scroll"><table class="grid">
        <thead><tr><th>Month</th><th>Status</th><th>Amount</th><th>Paid on</th></tr></thead>
        <tbody>${months.map((m) => {
          const f = data.fees[m][id];
          const st = f.status || "unpaid";
          return `<tr><td>${esc(fmtMonth(m))}</td><td><span class="badge ${st}">${FEE_STATUS[st]}</span></td><td>${esc(f.amount)}</td><td>${f.paidOn ? esc(fmtDay(parseKey(f.paidOn))) : ""}</td></tr>`;
        }).join("")}</tbody></table></div>` : `<p class="empty">No fees recorded yet.</p>`}`;
    $("#historyDialog").showModal();
  }

  // ---------- Backup ----------
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadBackup() {
    data.lastBackup = new Date().toISOString();
    save();
    download(`music-class-backup-${dateKey(new Date())}.json`, JSON.stringify(data, null, 2), "application/json");
    renderBanners();
    toast("Backup downloaded");
  }

  function restoreBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const restored = normalize(JSON.parse(reader.result));
        if (data.students.length && !confirm(`Replace the current class data with this backup (${restored.students.length} kids)?`)) return;
        data = restored;
        save();
        render();
        toast(`Restored ${restored.students.length} kids`);
      } catch {
        toast("That file doesn't look like a Singing Class backup");
      }
    };
    reader.readAsText(file);
  }

  // ---------- Render ----------
  function renderSettings() {
    const name = setting("className");
    $("#className").textContent = `🎤 ${name}`;
    document.title = name;
  }

  function settingsPreview() {
    const form = $("#settingsForm");
    const val = (k) => form[k].value.trim() || DEFAULT_SETTINGS[k];
    const lines = [`${val("greeting")} Here's Maya's singing update for the week of ${fmtDay(parseKey(currentWeek))} 🎤`, "", "✅ Attended class", "📖 Learnt: Breathing, a new song verse", "", val("signOff")];
    if (form.teacherName.value.trim()) lines.push(`– ${form.teacherName.value.trim()}`);
    $("#messagePreview").textContent = lines.join("\n");
  }

  function openSettings() {
    const form = $("#settingsForm");
    Object.keys(DEFAULT_SETTINGS).forEach((k) => (form[k].value = data.settings?.[k] || ""));
    settingsPreview();
    $("#settingsDialog").showModal();
  }

  function renderBatchPicker() {
    if (currentBatch !== "all" && !batchById(currentBatch)) currentBatch = allBatches()[0]?.id || "all";
    $("#batchPicker").innerHTML = [...allBatches().map((b) => ({ id: b.id, label: b.name })), { id: "all", label: "All" }]
      .map((b) => `<button type="button" data-batch="${b.id}" aria-pressed="${b.id === currentBatch}">${esc(b.label)}</button>`).join("");
    const sel = $("#addStudent").batch;
    sel.innerHTML = allBatches().map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("") || `<option value="">No batches yet</option>`;
    const batch = batchById(currentBatch);
    if (batch) sel.value = batch.id;
    $("#addAllLabel").textContent = batch ? `Add for the whole ${batch.name} batch` : "Add for all batches";
  }

  function render() {
    renderSettings();
    renderBatchPicker();
    renderBanners();
    if (currentTab === "week") renderWeek();
    if (currentTab === "fees") renderFees();
    if (currentTab === "students") { renderBatches(); renderStudents(); }
    if (currentTab === "songs") renderSongs();
    if (currentTab === "calendar") renderCalendar();
  }

  // ---------- Events ----------
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  document.addEventListener("click", (ev) => {
    const go = ev.target.closest("[data-goto]");
    if (go) { ev.preventDefault(); showTab(go.dataset.goto); }
    if (ev.target.closest('[data-action="backup"]')) downloadBackup();
    if (ev.target.closest('[data-action="assign-batches"]')) {
      currentBatch = "all";
      try { sessionStorage.setItem("musicClass.batch", currentBatch); } catch {}
      showTab("students");
    }
  });

  $("#prevWeek").addEventListener("click", () => { currentWeek = dateKey(addDays(parseKey(currentWeek), -7)); renderWeek(); });
  $("#nextWeek").addEventListener("click", () => { currentWeek = dateKey(addDays(parseKey(currentWeek), 7)); renderWeek(); });
  $("#thisWeek").addEventListener("click", () => { currentWeek = dateKey(mondayOf(new Date())); renderWeek(); });
  $("#copyPractice").addEventListener("click", copyLastWeekPractice);
  $("#exportCsv").addEventListener("click", exportCsv);
  $("#printWeek").addEventListener("click", () => window.print());
  $("#prevMonth").addEventListener("click", () => { currentMonth = addMonths(currentMonth, -1); renderFees(); });
  $("#prevCalMonth").addEventListener("click", () => { calMonth = addMonths(calMonth, -1); renderCalendar(); });
  $("#nextCalMonth").addEventListener("click", () => { calMonth = addMonths(calMonth, 1); renderCalendar(); });
  $("#thisCalMonth").addEventListener("click", () => { calMonth = monthKeyOf(new Date()); renderCalendar(); });
  $("#calendar").addEventListener("click", (ev) => {
    const c = ev.target.closest(".cal-class");
    if (!c) return;
    currentWeek = c.dataset.week;
    currentBatch = c.dataset.batch;
    try { sessionStorage.setItem("musicClass.batch", currentBatch); } catch {}
    showTab("week");
  });
  $("#nextMonth").addEventListener("click", () => { currentMonth = addMonths(currentMonth, 1); renderFees(); });

  // Weekly table: attendance toggles and text fields
  $("#weekRows").addEventListener("click", (ev) => {
    const row = ev.target.closest("tr[data-id]");
    if (!row) return;
    const id = row.dataset.id;
    if (ev.target.closest('[data-action="history"]')) return openHistory(id);
    if (ev.target.closest('[data-action="share"]')) return shareUpdate(id);
    if (ev.target.closest('[data-action="email"]')) return emailUpdate(id);
    if (ev.target.closest('[data-action="whatsapp"]')) return whatsappUpdate(id);
    const btn = ev.target.closest(".att button");
    if (!btn) return;
    const e = weekEntry(currentWeek, id, true);
    e.attendance = e.attendance === btn.dataset.v ? "" : btn.dataset.v; // tap again to clear
    save();
    renderWeek();
  });
  $("#weekRows").addEventListener("input", (ev) => {
    const field = ev.target.dataset.field;
    const row = ev.target.closest("tr[data-id]");
    if (!field || !row) return;
    weekEntry(currentWeek, row.dataset.id, true)[field] = ev.target.value;
    // Typing in a ticked "Same lesson" / "Same practice" row updates the other ticked rows too
    if (SAME[field] && weekEntry(currentWeek, row.dataset.id)[SAME[field].flag]) {
      sameRows(field).forEach((r) => {
        if (r === row) return;
        r.querySelector(`[data-field="${field}"]`).value = ev.target.value;
        weekEntry(currentWeek, r.dataset.id, true)[field] = ev.target.value;
      });
    }
    save();
  });

  // ---------- Same lesson / same practice ----------
  const sameRows = (field) =>
    [...document.querySelectorAll("#weekRows tr[data-id]")].filter((r) => r.querySelector(`[data-same="${field}"]`).checked);

  function syncSame(field, preferRow = null) {
    const rows = sameRows(field);
    const textOf = (r) => r.querySelector(`[data-field="${field}"]`).value;
    // Use the text from another ticked row first; otherwise keep the one just ticked
    const source = rows.find((r) => r !== preferRow && textOf(r).trim()) || (preferRow && textOf(preferRow).trim() ? preferRow : null);
    if (source) {
      const text = textOf(source);
      rows.forEach((r) => {
        r.querySelector(`[data-field="${field}"]`).value = text;
        weekEntry(currentWeek, r.dataset.id, true)[field] = text;
      });
    }
    const all = [...document.querySelectorAll(`#weekRows [data-same="${field}"]`)];
    $(SAME[field].all).checked = all.length > 0 && all.every((c) => c.checked);
    save();
  }

  $("#weekRows").addEventListener("change", (ev) => {
    const field = ev.target.dataset.same;
    if (!SAME[field]) return;
    const row = ev.target.closest("tr[data-id]");
    weekEntry(currentWeek, row.dataset.id, true)[SAME[field].flag] = ev.target.checked;
    syncSame(field, row);
  });
  Object.entries(SAME).forEach(([field, cfg]) => {
    $(cfg.all).addEventListener("change", (ev) => {
      const rows = [...document.querySelectorAll("#weekRows tr[data-id]")];
      rows.forEach((r) => {
        r.querySelector(`[data-same="${field}"]`).checked = ev.target.checked;
        weekEntry(currentWeek, r.dataset.id, true)[cfg.flag] = ev.target.checked;
      });
      // Copy from the first kid who already has something written
      const first = rows.find((r) => r.querySelector(`[data-field="${field}"]`).value.trim());
      if (ev.target.checked) syncSame(field, first || null);
      else save();
    });
  });

  // Fees table
  $("#feeRows").addEventListener("click", (ev) => {
    const row = ev.target.closest("tr[data-id]");
    if (row && ev.target.closest('[data-action="history"]')) openHistory(row.dataset.id);
  });
  $("#feeRows").addEventListener("change", (ev) => {
    const key = ev.target.dataset.fee;
    const row = ev.target.closest("tr[data-id]");
    if (!key || !row) return;
    const f = feeEntry(currentMonth, row.dataset.id, true);
    f[key] = ev.target.value;
    if (key === "status" && ev.target.value === "paid" && !f.paidOn) f.paidOn = dateKey(new Date());
    save();
    renderFees();
  });

  // Students
  $("#addStudent").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const name = form.name.value.trim();
    if (!name) return;
    data.students.push({ id: uid(), name, contact: form.contact.value.trim(), email: form.email.value.trim(), batch: form.batch.value, archived: false });
    save();
    form.reset();
    form.name.focus();
    renderStudents();
    renderBanners();
    toast(`${name} added`);
  });
  $("#studentRows").addEventListener("change", (ev) => {
    const key = ev.target.dataset.student;
    const row = ev.target.closest("tr[data-id]");
    if (!key || !row) return;
    const s = studentById(row.dataset.id);
    const value = ev.target.value.trim();
    if (key === "name" && !value) { ev.target.value = s.name; return; }
    s[key] = value;
    save();
    if (key === "batch") {
      renderStudents();
      toast(`${s.name} is in the ${batchOf(s).name} batch`);
    }
  });
  $("#studentRows").addEventListener("click", (ev) => {
    const row = ev.target.closest("tr[data-id]");
    const action = ev.target.closest("[data-action]")?.dataset.action;
    const setBatch = ev.target.closest("[data-set-batch]");
    if (row && setBatch) {
      const s = studentById(row.dataset.id);
      if (s.batch === setBatch.dataset.setBatch) return;
      s.batch = setBatch.dataset.setBatch;
      save();
      renderStudents();
      renderBanners();
      toast(`${s.name} → ${batchOf(s).name} batch`);
      return;
    }
    if (!row || !action) return;
    const s = studentById(row.dataset.id);
    if (action === "history") openHistory(s.id);
    if (action === "delete") deleteStudent(s.id);
    if (action === "archive") {
      s.archived = !s.archived;
      save();
      renderStudents();
      toast(s.archived ? `${s.name} archived (history kept)` : `${s.name} restored`);
    }
  });

  // Songs & skills
  $("#songKid").addEventListener("change", (ev) => { songKid = ev.target.value; renderSongs(); });
  $("#addSong").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const title = form.title.value.trim();
    if (!title) return;
    addSong(form.kind.value, title, form.all.checked);
    form.title.value = "";
    form.title.focus();
  });
  $("#songRows").addEventListener("change", (ev) => {
    const field = ev.target.dataset.songField;
    const row = ev.target.closest("tr[data-song]");
    if (!field || !row) return;
    const item = (data.songs[songKid] || []).find((x) => x.id === row.dataset.song);
    if (!item) return;
    const value = ev.target.value.trim();
    if (field === "title" && !value) { ev.target.value = item.title; return; }
    item[field] = value;
    save();
    toast("Saved");
  });
  $("#songRows").addEventListener("click", (ev) => {
    const row = ev.target.closest("tr[data-song]");
    if (!row) return;
    const list = data.songs[songKid] || [];
    const item = list.find((x) => x.id === row.dataset.song);
    if (!item) return;
    if (ev.target.closest('[data-action="remove-song"]')) {
      if (!confirm(`Remove "${item.title}"?`)) return;
      data.songs[songKid] = list.filter((x) => x !== item);
    } else {
      const btn = ev.target.closest(".att button");
      if (!btn || btn.dataset.v === item.status) return;
      item.status = btn.dataset.v;
      item.updated = dateKey(new Date());
    }
    save();
    renderSongs();
  });

  $("#downloadBackup").addEventListener("click", downloadBackup);
  $("#restoreBackup").addEventListener("change", (ev) => {
    const file = ev.target.files[0];
    if (file) restoreBackup(file);
    ev.target.value = "";
  });
  $("#closeHistory").addEventListener("click", () => $("#historyDialog").close());
  $("#addBatch").addEventListener("submit", (ev) => { ev.preventDefault(); addBatch(ev.target); });
  $("#batchRows").addEventListener("change", (ev) => {
    const field = ev.target.dataset.batchField;
    const row = ev.target.closest("tr[data-batch-id]");
    if (!field || !row) return;
    const b = batchById(row.dataset.batchId);
    let value = ev.target.value;
    if (field === "name") { value = value.trim(); if (!value) { ev.target.value = b.name; return; } }
    if (field === "day") value = Number(value);
    b[field] = value;
    save();
    render();
    toast("Batch updated");
  });
  $("#batchRows").addEventListener("click", (ev) => {
    const row = ev.target.closest("tr[data-batch-id]");
    if (row && ev.target.closest('[data-action="remove-batch"]')) removeBatch(row.dataset.batchId);
  });
  $("#batchPicker").addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-batch]");
    if (!btn) return;
    currentBatch = btn.dataset.batch;
    try { sessionStorage.setItem("musicClass.batch", currentBatch); } catch {}
    render();
  });
  $("#openSettings").addEventListener("click", openSettings);
  $("#closeSettings").addEventListener("click", () => $("#settingsDialog").close());
  $("#settingsDialog").addEventListener("click", (ev) => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });
  $("#settingsForm").addEventListener("input", settingsPreview);
  $("#settingsForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const form = ev.target;
    data.settings = Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((k) => [k, form[k].value.trim()]));
    save();
    render();
    $("#settingsDialog").close();
    toast("Settings saved");
  });
  $("#resetSettings").addEventListener("click", () => {
    const form = $("#settingsForm");
    Object.keys(DEFAULT_SETTINGS).forEach((k) => (form[k].value = ""));
    settingsPreview();
  });
  $("#historyDialog").addEventListener("click", (ev) => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });

  // ---------- Start ----------
  let startTab = data.students.length ? "week" : "students";
  try { startTab = sessionStorage.getItem("musicClass.tab") || startTab; } catch {}
  showTab(startTab);
})();
