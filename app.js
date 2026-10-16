// Music Class Progress: all data stays in this browser (localStorage).
(() => {
  "use strict";

  const STORAGE_KEY = "musicClass.v1";
  const BACKUP_REMINDER_DAYS = 30;
  const ATTENDANCE = [
    { v: "present", label: "Present" },
    { v: "absent", label: "Absent" },
    { v: "excused", label: "Excused" },
  ];
  const FEE_STATUS = { unpaid: "Unpaid", partial: "Partial", paid: "Paid" };

  // ---------- Storage ----------
  let storageOk = true;
  const emptyData = () => ({ students: [], weeks: {}, fees: {}, lastBackup: null });

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
    return {
      students: d.students.filter((s) => s && s.id && typeof s.name === "string"),
      weeks: d.weeks && typeof d.weeks === "object" ? d.weeks : {},
      fees: d.fees && typeof d.fees === "object" ? d.fees : {},
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
  let currentTab = "week";

  // ---------- Helpers ----------
  const $ = (s) => document.querySelector(s);
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const activeStudents = () =>
    data.students.filter((s) => !s.archived).sort((a, b) => a.name.localeCompare(b.name));
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

  // Missed = absent + excused, counted over all weeks or only weeks starting in a month
  function missedCount(id, month = null) {
    let missed = 0, excused = 0;
    for (const [week, entries] of Object.entries(data.weeks)) {
      if (month && week.slice(0, 7) !== month) continue;
      const a = entries[id]?.attendance;
      if (a === "absent") missed++;
      if (a === "excused") { missed++; excused++; }
    }
    return { missed, excused };
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
    $("#banners").innerHTML = out.join("");
  }

  // ---------- Tabs ----------
  function showTab(tab) {
    currentTab = tab;
    document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    ["week", "fees", "students"].forEach((t) => ($(`#tab-${t}`).hidden = t !== tab));
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
            ${s.instrument ? `<span class="kid-sub">${esc(s.instrument)}</span>` : ""}
            ${feeBadge(s.id, month)}
          </td>
          <td>
            <div class="att" role="group" aria-label="Attendance for ${esc(s.name)}">
              ${ATTENDANCE.map((a) => `<button type="button" data-v="${a.v}" aria-pressed="${e.attendance === a.v}">${a.label}</button>`).join("")}
            </div>
          </td>
          <td><textarea data-field="lessonLearnt" rows="2" placeholder="What did they learn?">${esc(e.lessonLearnt)}</textarea></td>
          <td><textarea data-field="practice" rows="2" placeholder="What to practise at home">${esc(e.practice)}</textarea></td>
          <td><textarea data-field="notes" rows="2" placeholder="Optional">${esc(e.notes)}</textarea></td>
          <td class="missed ${t.missed ? "has" : ""}" title="Excused absences count as missed">
            ${m.missed} this month<br><span class="kid-sub">${t.missed} total${t.excused ? ` (${t.excused} excused)` : ""}</span>
          </td>
        </tr>`;
    }).join("");
    renderWeekSummary();
  }

  function renderWeekSummary() {
    const kids = activeStudents();
    const month = monthKeyOf(parseKey(currentWeek));
    const counts = { present: 0, absent: 0, excused: 0, unmarked: 0 };
    kids.forEach((s) => {
      const a = weekEntry(currentWeek, s.id).attendance;
      counts[a || "unmarked"]++;
    });
    const unpaid = kids.filter((s) => (feeEntry(month, s.id).status || "unpaid") !== "paid").length;
    $("#weekSummary").innerHTML = kids.length ? `
      <span class="stat"><b>${counts.present}</b>present</span>
      <span class="stat"><b>${counts.absent}</b>absent</span>
      <span class="stat"><b>${counts.excused}</b>excused</span>
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
    const rows = [["Week of", "Kid", "Instrument", "Attendance", "Lesson learnt", "Practice lesson", "Notes", "Missed this month", "Missed total", "Fee status"]];
    activeStudents().forEach((s) => {
      const e = weekEntry(currentWeek, s.id);
      rows.push([
        currentWeek, s.name, s.instrument, e.attendance || "", e.lessonLearnt, e.practice, e.notes,
        missedCount(s.id, month).missed, missedCount(s.id).missed,
        FEE_STATUS[feeEntry(month, s.id).status || "unpaid"],
      ]);
    });
    download(`music-class-week-${currentWeek}.csv`, rows.map((r) => r.map(csvCell).join(",")).join("\n"), "text/csv");
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
    const all = [...data.students].sort((a, b) => (a.archived - b.archived) || a.name.localeCompare(b.name));
    $("#studentRows").innerHTML = all.length ? all.map((s) => `
      <tr data-id="${s.id}" class="${s.archived ? "archived" : ""}">
        <td><input data-student="name" value="${esc(s.name)}" aria-label="Name"></td>
        <td><input data-student="instrument" value="${esc(s.instrument)}" aria-label="Instrument"></td>
        <td><input data-student="contact" value="${esc(s.contact)}" aria-label="Parent contact"></td>
        <td class="missed">${missedCount(s.id).missed}</td>
        <td><div class="row-actions">
          <button type="button" class="btn small ghost" data-action="history">History</button>
          <button type="button" class="btn small ghost" data-action="archive">${s.archived ? "Restore" : "Archive"}</button>
          <button type="button" class="btn small ghost danger" data-action="delete">Delete</button>
        </div></td>
      </tr>`).join("")
      : `<tr><td colspan="5" class="empty">No kids yet. Add your first one above.</td></tr>`;
  }

  function deleteStudent(id) {
    const s = studentById(id);
    if (!s || !confirm(`Delete ${s.name} and all their history? This can't be undone. (Tip: Archive keeps their history.)`)) return;
    data.students = data.students.filter((x) => x.id !== id);
    Object.values(data.weeks).forEach((w) => delete w[id]);
    Object.values(data.fees).forEach((m) => delete m[id]);
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

    $("#historyTitle").textContent = `${s.name}${s.instrument ? ` · ${s.instrument}` : ""}`;
    $("#historyBody").innerHTML = `
      <div class="summary">
        <span class="stat"><b>${weeks.filter((w) => data.weeks[w][id].attendance === "present").length}</b>classes attended</span>
        <span class="stat"><b>${t.missed}</b>missed${t.excused ? ` (${t.excused} excused)` : ""}</span>
        ${s.contact ? `<span class="stat">Parent: ${esc(s.contact)}</span>` : ""}
      </div>
      <h3>Weekly progress</h3>
      ${weeks.length ? `<div class="table-scroll"><table class="grid">
        <thead><tr><th>Week of</th><th>Attendance</th><th>Lesson learnt</th><th>Practice lesson</th><th>Notes</th></tr></thead>
        <tbody>${weeks.map((w) => {
          const e = data.weeks[w][id];
          return `<tr class="${e.attendance === "absent" ? "is-absent" : ""}"><td>${esc(fmtDay(parseKey(w)))}</td><td>${attLabel(e.attendance)}</td><td>${esc(e.lessonLearnt)}</td><td>${esc(e.practice)}</td><td>${esc(e.notes)}</td></tr>`;
        }).join("")}</tbody></table></div>` : `<p class="empty">No weeks recorded yet.</p>`}
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
        toast("That file doesn't look like a Music Class backup");
      }
    };
    reader.readAsText(file);
  }

  // ---------- Render ----------
  function render() {
    renderBanners();
    if (currentTab === "week") renderWeek();
    if (currentTab === "fees") renderFees();
    if (currentTab === "students") renderStudents();
  }

  // ---------- Events ----------
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  document.addEventListener("click", (ev) => {
    const go = ev.target.closest("[data-goto]");
    if (go) { ev.preventDefault(); showTab(go.dataset.goto); }
    if (ev.target.closest('[data-action="backup"]')) downloadBackup();
  });

  $("#prevWeek").addEventListener("click", () => { currentWeek = dateKey(addDays(parseKey(currentWeek), -7)); renderWeek(); });
  $("#nextWeek").addEventListener("click", () => { currentWeek = dateKey(addDays(parseKey(currentWeek), 7)); renderWeek(); });
  $("#thisWeek").addEventListener("click", () => { currentWeek = dateKey(mondayOf(new Date())); renderWeek(); });
  $("#copyPractice").addEventListener("click", copyLastWeekPractice);
  $("#exportCsv").addEventListener("click", exportCsv);
  $("#printWeek").addEventListener("click", () => window.print());
  $("#prevMonth").addEventListener("click", () => { currentMonth = addMonths(currentMonth, -1); renderFees(); });
  $("#nextMonth").addEventListener("click", () => { currentMonth = addMonths(currentMonth, 1); renderFees(); });

  // Weekly table: attendance toggles and text fields
  $("#weekRows").addEventListener("click", (ev) => {
    const row = ev.target.closest("tr[data-id]");
    if (!row) return;
    const id = row.dataset.id;
    if (ev.target.closest('[data-action="history"]')) return openHistory(id);
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
    save();
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
    data.students.push({ id: uid(), name, instrument: form.instrument.value.trim(), contact: form.contact.value.trim(), archived: false });
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
  });
  $("#studentRows").addEventListener("click", (ev) => {
    const row = ev.target.closest("tr[data-id]");
    const action = ev.target.closest("[data-action]")?.dataset.action;
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

  $("#downloadBackup").addEventListener("click", downloadBackup);
  $("#restoreBackup").addEventListener("change", (ev) => {
    const file = ev.target.files[0];
    if (file) restoreBackup(file);
    ev.target.value = "";
  });
  $("#closeHistory").addEventListener("click", () => $("#historyDialog").close());
  $("#historyDialog").addEventListener("click", (ev) => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });

  // ---------- Start ----------
  let startTab = data.students.length ? "week" : "students";
  try { startTab = sessionStorage.getItem("musicClass.tab") || startTab; } catch {}
  showTab(startTab);
})();
