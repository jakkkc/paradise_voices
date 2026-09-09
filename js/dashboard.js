// ==========================================================
// Paradise Voices — dashboard.js
// Step 8a: date-range filter, all-time overview, branch
// comparison chart, room category performance chart.
// ==========================================================

const mgmtState = {
  pinDigits: "",
  pin: null,
  feedback: [],
  branches: [],
  rooms: [],
  roomCategories: [],
};

let branchChartInstance = null;
let categoryChartInstance = null;

const BRANCH_NAMES = {
  HPC: "Hunters Paradise Cottages",
  HPT: "Hunters Paradise Tuuti",
};

const RATING_FIELDS = [
  { key: "front_office_rating", label: "Front Office" },
  { key: "housekeeping_rating", label: "Housekeeping" },
  { key: "room_comfort_rating", label: "Room Comfort" },
  { key: "facilities_rating", label: "Facilities" },
  { key: "value_rating", label: "Value for Money" },
  { key: "overall_rating", label: "Overall Stay" },
];

const BRAND_COLORS = { hpc: "#B76542", hpt: "#432A17" };

function showView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// ---------- PIN gate ----------

function renderMgmtPinDots() {
  const dots = document.querySelectorAll("#mgmt-pin-dots .dot");
  dots.forEach((d, i) => d.classList.toggle("filled", i < mgmtState.pinDigits.length));
}

function showMgmtPinError(message) {
  const errEl = document.getElementById("mgmt-pin-error");
  errEl.textContent = message;
  errEl.style.display = "block";
  mgmtState.pinDigits = "";
  renderMgmtPinDots();
}

async function handleMgmtPinComplete() {
  const { data, error } = await db.rpc("verify_pin", { input_pin: mgmtState.pinDigits });

  if (error) {
    showMgmtPinError("Something went wrong. Check your connection.");
    return;
  }
  if (!data || data.length === 0 || data[0].role_key !== "management") {
    showMgmtPinError("Incorrect PIN.");
    return;
  }

  mgmtState.pin = mgmtState.pinDigits;
  mgmtState.pinDigits = "";
  renderMgmtPinDots();

  await loadDashboard();
  showView("view-dashboard");
}

function setupMgmtPinPad() {
  document.querySelectorAll("#mgmt-pin-keypad .pin-key[data-key]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (mgmtState.pinDigits.length >= 4) return;
      document.getElementById("mgmt-pin-error").style.display = "none";
      mgmtState.pinDigits += btn.dataset.key;
      renderMgmtPinDots();
      if (mgmtState.pinDigits.length === 4) handleMgmtPinComplete();
    });
  });

  document.getElementById("mgmt-pin-backspace").addEventListener("click", () => {
    mgmtState.pinDigits = mgmtState.pinDigits.slice(0, -1);
    renderMgmtPinDots();
  });
}

// ---------- Data loading ----------

async function loadDashboard() {
  const [{ data: feedback, error: fbError }, { data: branches }, { data: rooms }, { data: roomCategories }] =
    await Promise.all([
      db.rpc("get_management_feedback", { input_pin: mgmtState.pin }),
      db.from("branches").select("id, code, name"),
      db.from("rooms").select("id, room_number, category_id, branch_id"),
      db.from("room_categories").select("id, name, branch_id"),
    ]);

  mgmtState.feedback = fbError ? [] : feedback || [];
  mgmtState.branches = branches || [];
  mgmtState.rooms = rooms || [];
  mgmtState.roomCategories = roomCategories || [];

  populateBranchFilter();
  renderDashboard();
}

function populateBranchFilter() {
  const select = document.getElementById("branch-filter");
  select.innerHTML = '<option value="all">All Branches</option>';
  mgmtState.branches.forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = BRANCH_NAMES[b.code] || b.name;
    select.appendChild(opt);
  });
}

// ---------- Filtering ----------

function getDateBounds() {
  const filter = document.getElementById("date-filter").value;
  const now = new Date();
  let from = null;
  let to = null;

  if (filter === "7") {
    from = new Date(now);
    from.setDate(from.getDate() - 7);
  } else if (filter === "30") {
    from = new Date(now);
    from.setDate(from.getDate() - 30);
  } else if (filter === "month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (filter === "custom") {
    const fromVal = document.getElementById("date-from").value;
    const toVal = document.getElementById("date-to").value;
    from = fromVal ? new Date(fromVal + "T00:00:00") : null;
    to = toVal ? new Date(toVal + "T23:59:59") : null;
  }

  return { from, to };
}

function branchFilteredRows() {
  const filterValue = document.getElementById("branch-filter").value;
  return filterValue === "all" ? mgmtState.feedback : mgmtState.feedback.filter((r) => r.branch_id === filterValue);
}

function applyDateBounds(rows) {
  const { from, to } = getDateBounds();
  return rows.filter((r) => {
    const created = new Date(r.created_at);
    if (from && created < from) return false;
    if (to && created > to) return false;
    return true;
  });
}

function periodFilteredRows() {
  return applyDateBounds(branchFilteredRows());
}

function dateOnlyFilteredRows() {
  return applyDateBounds(mgmtState.feedback);
}

// ---------- Stats ----------

function average(rows, key) {
  const vals = rows.map((r) => r[key]).filter((v) => v !== null && v !== undefined);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function formatAvg(val) {
  return val === null ? "–" : val.toFixed(1);
}

function computeNps(rows) {
  const answered = rows.filter((r) => r.nps !== null && r.nps !== undefined);
  if (answered.length === 0) return null;
  const promoters = answered.filter((r) => r.nps >= 9).length;
  const detractors = answered.filter((r) => r.nps <= 6).length;
  return Math.round(((promoters - detractors) / answered.length) * 100);
}

function computeReferralBreakdown(rows) {
  const counts = { online: 0, referral: 0, repeat_guest: 0, other: 0 };
  rows.forEach((r) => {
    if (r.referral_source in counts) counts[r.referral_source]++;
  });
  const total = rows.length || 1;
  return Object.entries(counts).map(([key, count]) => ({
    key: key.replace("_", " "),
    count,
    pct: Math.round((count / total) * 100),
  }));
}

// ---------- Render: overview + stat grid ----------

function renderDashboard() {
  const allTime = branchFilteredRows();
  const period = periodFilteredRows();

  renderAllTimeOverview(allTime);
  renderStatGrid(period);
  renderReferralBreakdown(period);
  renderComments(period);
  renderBranchComparisonChart();
  renderCategoryChart(period);
}

function renderAllTimeOverview(rows) {
  const grid = document.getElementById("alltime-stat-grid");
  grid.innerHTML = "";

  const nps = computeNps(rows);
  const cards = [
    { label: "Total Responses (All Time)", value: rows.length },
    { label: "All-Time NPS", value: nps === null ? "–" : nps },
    { label: "All-Time Overall Rating", value: formatAvg(average(rows, "overall_rating")) },
  ];

  cards.forEach((c) => {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `<div class="stat-value">${c.value}</div><div class="stat-label">${c.label}</div>`;
    grid.appendChild(card);
  });
}

function renderStatGrid(rows) {
  const grid = document.getElementById("stat-grid");
  grid.innerHTML = "";

  const cards = [
    { label: "Responses (Period)", value: rows.length },
    { label: "NPS Score", value: computeNps(rows) === null ? "–" : computeNps(rows) },
  ];

  RATING_FIELDS.forEach((f) => {
    cards.push({ label: f.label, value: formatAvg(average(rows, f.key)) });
  });

  cards.forEach((c) => {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `<div class="stat-value">${c.value}</div><div class="stat-label">${c.label}</div>`;
    grid.appendChild(card);
  });
}

function renderReferralBreakdown(rows) {
  const container = document.getElementById("referral-breakdown");
  container.innerHTML = "";

  if (rows.length === 0) {
    container.innerHTML = '<p class="empty-note">No responses in this period.</p>';
    return;
  }

  computeReferralBreakdown(rows).forEach((item) => {
    const row = document.createElement("div");
    row.className = "referral-bar-row";
    row.innerHTML = `
      <div class="referral-bar-name">${item.key}</div>
      <div class="referral-bar-track"><div class="referral-bar-fill" style="width:${item.pct}%"></div></div>
      <div class="referral-bar-pct">${item.pct}%</div>
    `;
    container.appendChild(row);
  });
}

function renderComments(rows) {
  const container = document.getElementById("comments-list");
  container.innerHTML = "";

  const withComments = rows
    .filter((r) => r.comment)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 15);

  if (withComments.length === 0) {
    container.innerHTML = '<p class="empty-note">No comments in this period.</p>';
    return;
  }

  const roomMap = {};
  mgmtState.rooms.forEach((r) => (roomMap[r.id] = r.room_number));

  const branchMap = {};
  mgmtState.branches.forEach((b) => (branchMap[b.id] = BRANCH_NAMES[b.code] || b.name));

  withComments.forEach((r) => {
    const date = new Date(r.created_at).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const room = roomMap[r.room_id] || "Unknown room";
    const branch = branchMap[r.branch_id] || "";
    const guest = r.guest_name || "Anonymous";

    const card = document.createElement("div");
    card.className = "comment-card";
    card.innerHTML = `
      <div class="comment-meta">${guest} • ${branch}, Room ${room} • ${date}</div>
      <div>${r.comment.replace(/</g, "&lt;")}</div>
    `;
    container.appendChild(card);
  });
}

// ---------- Charts ----------

function renderBranchComparisonChart() {
  const rows = dateOnlyFilteredRows();
  const hpc = mgmtState.branches.find((b) => b.code === "HPC");
  const hpt = mgmtState.branches.find((b) => b.code === "HPT");
  const hpcRows = hpc ? rows.filter((r) => r.branch_id === hpc.id) : [];
  const hptRows = hpt ? rows.filter((r) => r.branch_id === hpt.id) : [];

  const labels = RATING_FIELDS.map((f) => f.label);
  const hpcData = RATING_FIELDS.map((f) => average(hpcRows, f.key) || 0);
  const hptData = RATING_FIELDS.map((f) => average(hptRows, f.key) || 0);

  if (branchChartInstance) branchChartInstance.destroy();

  const ctx = document.getElementById("branch-comparison-chart").getContext("2d");
  branchChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: `HPC (${hpcRows.length})`, data: hpcData, backgroundColor: BRAND_COLORS.hpc, borderRadius: 4 },
        { label: `HPT (${hptRows.length})`, data: hptData, backgroundColor: BRAND_COLORS.hpt, borderRadius: 4 },
      ],
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true, max: 5 } },
      plugins: { legend: { position: "bottom" } },
    },
  });
}

function compositeScore(row) {
  const vals = RATING_FIELDS.map((f) => row[f.key]).filter((v) => v !== null && v !== undefined);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function renderCategoryChart(rows) {
  const roomCatMap = {};
  mgmtState.rooms.forEach((r) => (roomCatMap[r.id] = r.category_id));

  const catNameMap = {};
  mgmtState.roomCategories.forEach((c) => (catNameMap[c.id] = c.name));

  const byCategory = {};
  rows.forEach((r) => {
    const catId = roomCatMap[r.room_id];
    const catName = catNameMap[catId] || "Unknown";
    if (!byCategory[catName]) byCategory[catName] = [];
    byCategory[catName].push(r);
  });

  const names = Object.keys(byCategory);
  const labels = names.map((n) => `${n} (${byCategory[n].length})`);
  const data = names.map((n) => {
    const scores = byCategory[n].map(compositeScore).filter((v) => v !== null);
    return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  });

  if (categoryChartInstance) categoryChartInstance.destroy();

  const ctx = document.getElementById("category-chart").getContext("2d");
  categoryChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Avg Score", data, backgroundColor: BRAND_COLORS.hpc, borderRadius: 4 }],
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true, max: 5 } },
      plugins: { legend: { display: false } },
    },
  });
}

// ---------- Staff Settings ----------

const STAFF_ROLES_CONFIG = [
  { role_key: "hpc_reception", label: "HPC Reception" },
  { role_key: "hpt_reception", label: "HPT Reception" },
  { role_key: "management", label: "Management" },
];

async function loadStaffRoles() {
  const { data, error } = await db.rpc("get_staff_roles", { input_pin: mgmtState.pin });
  return error ? [] : data;
}

function renderStaffList(staffRows) {
  const container = document.getElementById("staff-list");
  container.innerHTML = "";

  STAFF_ROLES_CONFIG.forEach((cfg) => {
    const row = staffRows.find((s) => s.role_key === cfg.role_key);
    const displayName = row ? row.display_name : cfg.label;

    const card = document.createElement("div");
    card.className = "card";
    card.style.marginBottom = "16px";
    card.style.maxWidth = "100%";
    card.innerHTML = `
      <h3>${cfg.label}</h3>
      <p class="subtitle">Current name: <strong>${displayName}</strong></p>
      <label>New display name <span style="font-weight:400;color:var(--text-muted);">(optional)</span></label>
      <input type="text" class="staff-name-input" placeholder="${displayName}" />
      <label>New PIN <span style="font-weight:400;color:var(--text-muted);">(optional, 4 digits)</span></label>
      <input type="text" inputmode="numeric" maxlength="4" class="staff-pin-input" placeholder="••••" />
      <div class="status-line save-status" style="display:none;"></div>
      <button class="btn btn-primary staff-save-btn">Save</button>
    `;

    const nameInput = card.querySelector(".staff-name-input");
    const pinInput = card.querySelector(".staff-pin-input");
    const statusEl = card.querySelector(".save-status");
    const saveBtn = card.querySelector(".staff-save-btn");

    pinInput.addEventListener("input", () => {
      pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 4);
    });

    saveBtn.addEventListener("click", async () => {
      const newName = nameInput.value.trim();
      const newPin = pinInput.value.trim();

      if (newPin && newPin.length !== 4) {
        statusEl.textContent = "PIN must be exactly 4 digits.";
        statusEl.className = "status-line save-status error";
        statusEl.style.display = "block";
        return;
      }
      if (!newName && !newPin) {
        statusEl.textContent = "Enter a new name or PIN to save.";
        statusEl.className = "status-line save-status error";
        statusEl.style.display = "block";
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";

      const { error } = await db.rpc("update_staff_credentials", {
        input_mgmt_pin: mgmtState.pin,
        target_role_key: cfg.role_key,
        new_pin: newPin || null,
        new_display_name: newName || null,
      });

      saveBtn.disabled = false;
      saveBtn.textContent = "Save";

      if (error) {
        statusEl.textContent = "Save failed — try again.";
        statusEl.className = "status-line save-status error";
        statusEl.style.display = "block";
        return;
      }

      statusEl.textContent = "Saved ✓";
      statusEl.className = "status-line save-status ok";
      statusEl.style.display = "block";

      if (cfg.role_key === "management" && newPin) {
        mgmtState.pin = newPin;
      }

      nameInput.value = "";
      pinInput.value = "";

      const rows = await loadStaffRoles();
      renderStaffList(rows);
    });

    container.appendChild(card);
  });
}

async function openStaffView() {
  const rows = await loadStaffRoles();
  renderStaffList(rows);
  showView("view-staff");
}

// ---------- Downloadable report ----------

function currentFilterLabel() {
  const branchSelect = document.getElementById("branch-filter");
  const branchLabel = branchSelect.options[branchSelect.selectedIndex].textContent;
  const dateSelect = document.getElementById("date-filter");
  const dateLabel = dateSelect.options[dateSelect.selectedIndex].textContent;
  return `${branchLabel} • ${dateLabel}`;
}

function generateAndPrintReport() {
  const rows = periodFilteredRows();
  const label = currentFilterLabel();
  const generatedAt = new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  const nps = computeNps(rows);
  const referral = computeReferralBreakdown(rows);

  const roomMap = {};
  mgmtState.rooms.forEach((r) => (roomMap[r.id] = r.room_number));
  const branchMap = {};
  mgmtState.branches.forEach((b) => (branchMap[b.id] = BRANCH_NAMES[b.code] || b.name));

  const commentsRows = rows.filter((r) => r.comment).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  let html = `
    <h1>Paradise Voices — Guest Feedback Report</h1>
    <div class="report-meta">${label} • Generated ${generatedAt} • ${rows.length} response${rows.length === 1 ? "" : "s"}</div>

    <div class="report-section-title">Summary</div>
    <table>
      <tr><th>Metric</th><th>Value</th></tr>
      <tr><td>Total Responses</td><td>${rows.length}</td></tr>
      <tr><td>NPS Score</td><td>${nps === null ? "–" : nps}</td></tr>
      ${RATING_FIELDS.map((f) => `<tr><td>${f.label}</td><td>${formatAvg(average(rows, f.key))}</td></tr>`).join("")}
    </table>

    <div class="report-section-title">How Guests Heard About Us</div>
    <table>
      <tr><th>Source</th><th>Count</th><th>Percent</th></tr>
      ${referral.map((r) => `<tr><td style="text-transform:capitalize;">${r.key}</td><td>${r.count}</td><td>${r.pct}%</td></tr>`).join("")}
    </table>

    <div class="report-section-title">Guest Comments (${commentsRows.length})</div>
  `;

  if (commentsRows.length === 0) {
    html += `<p>No comments for this selection.</p>`;
  } else {
    commentsRows.forEach((r) => {
      const date = new Date(r.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const room = roomMap[r.room_id] || "Unknown room";
      const branch = branchMap[r.branch_id] || "";
      const guest = r.guest_name || "Anonymous";
      const contact = r.guest_contact ? ` • ${r.guest_contact}` : "";
      html += `
        <div class="report-comment">
          <div class="report-comment-meta">${guest}${contact} • ${branch}, Room ${room} • ${date}</div>
          <div>${r.comment.replace(/</g, "&lt;")}</div>
        </div>
      `;
    });
  }

  document.getElementById("print-report").innerHTML = html;
  window.print();
}

// ---------- Auto-login (PIN handed off from index.html) ----------

async function tryAutoLogin() {
  let storedPin;
  try {
    storedPin = sessionStorage.getItem("pv_mgmt_pin");
    sessionStorage.removeItem("pv_mgmt_pin");
  } catch (e) {
    return false;
  }

  if (!storedPin) return false;

  const { data, error } = await db.rpc("verify_pin", { input_pin: storedPin });
  if (error || !data || data.length === 0 || data[0].role_key !== "management") {
    return false;
  }

  mgmtState.pin = storedPin;
  await loadDashboard();
  showView("view-dashboard");
  return true;
}

// ---------- Wiring ----------

document.addEventListener("DOMContentLoaded", async () => {
  setupMgmtPinPad();

  document.getElementById("branch-filter").addEventListener("change", renderDashboard);

  document.getElementById("date-filter").addEventListener("change", (e) => {
    document.getElementById("custom-date-range").style.display = e.target.value === "custom" ? "flex" : "none";
    renderDashboard();
  });
  document.getElementById("date-from").addEventListener("change", renderDashboard);
  document.getElementById("date-to").addEventListener("change", renderDashboard);

  document.getElementById("dashboard-logout-btn").addEventListener("click", () => {
    mgmtState.pin = null;
    showView("view-mgmt-pin");
  });
  document.getElementById("staff-settings-btn").addEventListener("click", openStaffView);
  document.getElementById("staff-back-btn").addEventListener("click", () => showView("view-dashboard"));
  document.getElementById("download-report-btn").addEventListener("click", generateAndPrintReport);

  const loggedIn = await tryAutoLogin();
  if (!loggedIn) showView("view-mgmt-pin");
});
