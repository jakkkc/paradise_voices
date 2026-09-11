// ==========================================================
// Paradise Voices — dashboard.js
// Step 8b: icons, all-time overview with branch/outlet
// breakdown, rating trend chart, CSAT, and Good/Bad comment
// grouping with "Served by" staff attribution.
// ==========================================================

const mgmtState = {
  pinDigits: "",
  pin: null,
  feedback: [],
  branches: [],
  rooms: [],
  roomCategories: [],
  mentions: [],
  teamMembers: [],
};

let branchChartInstance = null;
let categoryChartInstance = null;
let trendChartInstance = null;

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

const ICONS = {
  chat: '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4H12l-5 2 .9-3.6A8.4 8.4 0 1 1 21 11.5z"/></svg>',
  star: '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9"/></svg>',
  thumbsUp: '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.3a2 2 0 0 0 2-1.7l1.4-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>',
  smiley: '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
  users: '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  trend: '<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 6"/><polyline points="14 6 21 6 21 13"/></svg>',
};

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
  const [
    { data: feedback, error: fbError },
    { data: branches },
    { data: rooms },
    { data: roomCategories },
    { data: mentions, error: mentionsError },
    { data: teamMembers },
  ] = await Promise.all([
    db.rpc("get_management_feedback", { input_pin: mgmtState.pin }),
    db.from("branches").select("id, code, name"),
    db.from("rooms").select("id, room_number, category_id, branch_id"),
    db.from("room_categories").select("id, name, branch_id"),
    db.rpc("get_management_mentions", { input_pin: mgmtState.pin }),
    db.from("team_members").select("id, name, department"),
  ]);

  mgmtState.feedback = fbError ? [] : feedback || [];
  mgmtState.branches = branches || [];
  mgmtState.rooms = rooms || [];
  mgmtState.roomCategories = roomCategories || [];
  mgmtState.mentions = mentionsError ? [] : mentions || [];
  mgmtState.teamMembers = teamMembers || [];

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

function pooledRatingValues(rows) {
  const vals = [];
  rows.forEach((r) => RATING_FIELDS.forEach((f) => {
    const v = r[f.key];
    if (v !== null && v !== undefined) vals.push(v);
  }));
  return vals;
}

function pooledAverage(rows) {
  const vals = pooledRatingValues(rows);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function computeCsat(rows) {
  const vals = pooledRatingValues(rows);
  if (vals.length === 0) return null;
  const satisfied = vals.filter((v) => v >= 4).length;
  return { pct: Math.round((satisfied / vals.length) * 1000) / 10, count: vals.length };
}

function computeNps(rows) {
  const answered = rows.filter((r) => r.nps !== null && r.nps !== undefined);
  if (answered.length === 0) return null;
  const promoters = answered.filter((r) => r.nps >= 9).length;
  const detractors = answered.filter((r) => r.nps <= 6).length;
  return { score: Math.round(((promoters - detractors) / answered.length) * 100), count: answered.length };
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

// ---------- Render: main flow ----------

function renderDashboard() {
  const allTime = branchFilteredRows();
  const period = periodFilteredRows();

  renderIconStatRow(period);
  renderStatGrid(period);
  renderAllTimeOverview(allTime);
  renderTrendChart(period);
  renderReferralBreakdown(period);
  renderBranchComparisonChart();
  renderCategoryChart(period);
  renderCommentGroups(period);
}

function renderIconStatRow(rows) {
  const container = document.getElementById("icon-stat-row");
  const nps = computeNps(rows);
  const csat = computeCsat(rows);
  const repeatCount = rows.filter((r) => r.referral_source === "repeat_guest").length;
  const overallAvg = pooledAverage(rows);

  const cards = [
    { icon: ICONS.chat, value: rows.length, label: "Total Feedback" },
    { icon: ICONS.star, value: formatAvg(overallAvg), label: "Overall Avg" },
    { icon: ICONS.thumbsUp, value: nps ? nps.score : "–", label: `NPS (${nps ? nps.count : 0} resp.)` },
    { icon: ICONS.smiley, value: csat ? csat.pct + "%" : "–", label: `CSAT (${csat ? csat.count : 0} ratings)` },
    { icon: ICONS.users, value: repeatCount, label: "Repeat Guests" },
  ];

  container.innerHTML = cards
    .map(
      (c) => `
      <div class="icon-stat-card">
        ${c.icon}
        <div class="icon-stat-value">${c.value}</div>
        <div class="icon-stat-label">${c.label}</div>
      </div>
    `
    )
    .join("");
}

function renderStatGrid(rows) {
  const grid = document.getElementById("stat-grid");
  grid.innerHTML = "";

  RATING_FIELDS.forEach((f) => {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `<div class="stat-value">${formatAvg(average(rows, f.key))}</div><div class="stat-label">${f.label}</div>`;
    grid.appendChild(card);
  });
}

function roomCategoryMaps() {
  const roomCatMap = {};
  mgmtState.rooms.forEach((r) => (roomCatMap[r.id] = r.category_id));
  const catNameMap = {};
  mgmtState.roomCategories.forEach((c) => (catNameMap[c.id] = c.name));
  return { roomCatMap, catNameMap };
}

function renderAllTimeOverview(rows) {
  const panel = document.getElementById("alltime-panel");
  const overallAvg = pooledAverage(rows);

  const byBranch = {};
  rows.forEach((r) => {
    if (!byBranch[r.branch_id]) byBranch[r.branch_id] = [];
    byBranch[r.branch_id].push(r);
  });

  const branchRowsHtml = mgmtState.branches
    .map((b) => {
      const branchRows = byBranch[b.id] || [];
      if (branchRows.length === 0) return "";
      const avg = pooledAverage(branchRows);
      return `<div class="overview-row"><span>${BRANCH_NAMES[b.code] || b.name}</span><span>${formatAvg(avg)} <span class="count">(${branchRows.length})</span></span></div>`;
    })
    .join("");

  const { roomCatMap, catNameMap } = roomCategoryMaps();
  const byCat = {};
  rows.forEach((r) => {
    const catId = roomCatMap[r.room_id];
    const catName = catNameMap[catId] || "Unknown";
    if (!byCat[catName]) byCat[catName] = [];
    byCat[catName].push(r);
  });

  const catRowsHtml = Object.keys(byCat)
    .map((name) => {
      const catRows = byCat[name];
      const avg = pooledAverage(catRows);
      return `<div class="overview-row"><span>${name}</span><span>${formatAvg(avg)} <span class="count">(${catRows.length})</span></span></div>`;
    })
    .join("");

  panel.innerHTML = `
    <h3>All-Time Overall Experience</h3>
    <p class="overview-desc">Combines all 6 rating categories, across every submission ever received. Not affected by the filters above.</p>
    <div>
      <span class="overview-big">${formatAvg(overallAvg)}</span>
      <span class="overview-big-sub">/ 5 — ${rows.length} review${rows.length === 1 ? "" : "s"}</span>
    </div>
    <div class="overview-columns">
      <div>
        <div class="overview-col-title">By Branch</div>
        ${branchRowsHtml || '<p class="overview-desc">No data yet.</p>'}
      </div>
      <div>
        <div class="overview-col-title">By Room Category</div>
        ${catRowsHtml || '<p class="overview-desc">No data yet.</p>'}
      </div>
    </div>
  `;
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
  const { roomCatMap, catNameMap } = roomCategoryMaps();

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

function renderTrendChart(rows) {
  const byDay = {};
  rows.forEach((r) => {
    const day = new Date(r.created_at).toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(r);
  });

  const days = Object.keys(byDay).sort();
  const titleHtml = `${ICONS.trend} Rating Trend`;
  document.getElementById("trend-title").innerHTML = titleHtml;

  if (trendChartInstance) trendChartInstance.destroy();

  if (days.length === 0) {
    document.getElementById("trend-chart-canvas-wrap").style.display = "none";
    document.getElementById("trend-chart-empty").style.display = "block";
    return;
  }
  document.getElementById("trend-chart-canvas-wrap").style.display = "block";
  document.getElementById("trend-chart-empty").style.display = "none";

  const labels = days.map((d) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  const data = days.map((d) => pooledAverage(byDay[d]) || 0);

  const ctx = document.getElementById("trend-chart").getContext("2d");
  trendChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Avg Rating",
          data,
          borderColor: BRAND_COLORS.hpc,
          backgroundColor: BRAND_COLORS.hpc,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: BRAND_COLORS.hpc,
        },
      ],
    },
    options: {
      responsive: true,
      scales: { y: { min: 0, max: 5 } },
      plugins: { legend: { display: false } },
    },
  });
}

// ---------- Good / Bad comment grouping ----------

function getBadTriggers(row) {
  const triggers = [];
  RATING_FIELDS.forEach((f) => {
    const val = row[f.key];
    if (val !== null && val !== undefined && val <= 3) {
      triggers.push({ key: f.key, label: f.label, value: val });
    }
  });
  if (row.nps !== null && row.nps !== undefined && row.nps <= 6) {
    triggers.push({ key: "nps", label: "NPS", value: row.nps });
  }
  return triggers;
}

function getMentionNames(feedbackId) {
  const ids = mgmtState.mentions.filter((m) => m.feedback_id === feedbackId).map((m) => m.team_member_id);
  return ids.map((id) => {
    const t = mgmtState.teamMembers.find((tm) => tm.id === id);
    return t ? t.name : null;
  }).filter(Boolean);
}

function buildRatingsRowHtml(row, badKeys) {
  const parts = [];
  RATING_FIELDS.forEach((f) => {
    const val = row[f.key];
    if (val === null || val === undefined) return;
    const cls = badKeys.has(f.key) ? "low" : "";
    parts.push(`<span class="${cls}">${f.label} ${val}★</span>`);
  });
  if (row.nps !== null && row.nps !== undefined) {
    const cls = badKeys.has("nps") ? "low" : "";
    parts.push(`<span class="${cls}">NPS ${row.nps}</span>`);
  }
  return parts.join("");
}

function renderCommentCard(row, badKeys, type, roomMap, branchMap) {
  const date = new Date(row.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const room = roomMap[row.room_id] || "Unknown room";
  const branch = branchMap[row.branch_id] || "";
  const servedBy = getMentionNames(row.id);

  let metaLine = "";
  if (servedBy.length > 0 && row.guest_name) {
    metaLine = `Served by ${servedBy.join(", ")} — ${row.guest_name}`;
  } else if (servedBy.length > 0) {
    metaLine = `Served by ${servedBy.join(", ")}`;
  } else if (row.guest_name) {
    metaLine = row.guest_name;
  }

  return `
    <div class="feedback-card ${type}">
      <div class="feedback-card-header">
        <span>${branch} · Room ${room}</span>
        <span class="feedback-card-date">${date}</span>
      </div>
      <div class="feedback-ratings">${buildRatingsRowHtml(row, badKeys)}</div>
      <div class="feedback-comment-text">${row.comment.replace(/</g, "&lt;")}</div>
      ${metaLine ? `<div class="feedback-meta">${metaLine}</div>` : ""}
    </div>
  `;
}

function renderCommentGroups(rows) {
  const roomMap = {};
  mgmtState.rooms.forEach((r) => (roomMap[r.id] = r.room_number));
  const branchMap = {};
  mgmtState.branches.forEach((b) => (branchMap[b.id] = BRANCH_NAMES[b.code] || b.name));

  const withComments = rows.filter((r) => r.comment).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const good = [];
  const bad = [];
  withComments.forEach((r) => {
    const triggers = getBadTriggers(r);
    if (triggers.length === 0) good.push(r);
    else bad.push({ row: r, triggers });
  });

  document.getElementById("good-comments-title").innerHTML = `✓ Best Feedback (${good.length})`;
  document.getElementById("bad-comments-title").innerHTML = `⚠ Needs Attention (${bad.length})`;

  const goodContainer = document.getElementById("good-comments-list");
  goodContainer.innerHTML =
    good.length === 0
      ? '<p class="empty-note">No standout comments in this period.</p>'
      : good.slice(0, 20).map((r) => renderCommentCard(r, new Set(), "good", roomMap, branchMap)).join("");

  const badContainer = document.getElementById("bad-comments-list");
  badContainer.innerHTML =
    bad.length === 0
      ? '<p class="empty-note">Nothing flagged in this period.</p>'
      : bad
          .slice(0, 20)
          .map(({ row, triggers }) => renderCommentCard(row, new Set(triggers.map((t) => t.key)), "bad", roomMap, branchMap))
          .join("");
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
  await refreshTeamMembersUI();
  showView("view-staff");
}

// ---------- Team Members (Front Office / Housekeeping / etc) ----------

async function fetchTeamMembers() {
  const { data, error } = await db
    .from("team_members")
    .select("department, name")
    .order("department")
    .order("name");
  return error ? [] : data || [];
}

function dedupeByDeptName(rows) {
  const seen = new Set();
  const result = [];
  rows.forEach((r) => {
    const key = r.department + "|" + r.name;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ department: r.department, name: r.name });
    }
  });
  return result;
}

async function refreshTeamMembersUI() {
  const rows = dedupeByDeptName(await fetchTeamMembers());
  renderTeamMembersList(rows);
  populateDeptDropdown(rows);
}

function renderTeamMembersList(members) {
  const container = document.getElementById("team-members-list");

  const byDept = {};
  members.forEach((m) => {
    if (!byDept[m.department]) byDept[m.department] = [];
    byDept[m.department].push(m.name);
  });

  const deptNames = Object.keys(byDept);
  container.innerHTML =
    deptNames.length === 0
      ? '<p class="empty-note">No team members yet.</p>'
      : deptNames
          .map(
            (dept) => `
        <div class="card" style="margin-bottom:16px; max-width:100%;">
          <h3>${dept}</h3>
          ${byDept[dept]
            .map(
              (name) => `
            <div class="team-member-row">
              <div class="team-member-display">
                <span>${name}</span>
                <div class="team-member-actions">
                  <button class="btn-edit-member" data-dept="${dept}" data-name="${name}">Edit</button>
                  <button class="btn-remove-member" data-dept="${dept}" data-name="${name}">Remove</button>
                </div>
              </div>
              <div class="team-member-edit-form" style="display:none;">
                <label>Name</label>
                <input type="text" class="edit-name-input" value="${name}" />
                <label>Department</label>
                <select class="edit-dept-select"></select>
                <input type="text" class="edit-dept-new-input" placeholder="New department name" style="display:none;" />
                <div class="team-member-edit-actions">
                  <button class="btn btn-primary btn-save-member" style="width:auto;">Save</button>
                  <button class="btn-link btn-cancel-member" style="width:auto;">Cancel</button>
                </div>
              </div>
            </div>
          `
            )
            .join("")}
        </div>
      `
          )
          .join("");

  container.querySelectorAll(".btn-edit-member").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".team-member-row");
      row.querySelector(".team-member-display").style.display = "none";
      const form = row.querySelector(".team-member-edit-form");
      form.style.display = "block";

      const deptSelect = form.querySelector(".edit-dept-select");
      deptSelect.innerHTML =
        deptNames.map((d) => `<option value="${d}" ${d === btn.dataset.dept ? "selected" : ""}>${d}</option>`).join("") +
        '<option value="__new__">+ New Department</option>';

      const newDeptInput = form.querySelector(".edit-dept-new-input");
      deptSelect.addEventListener("change", () => {
        newDeptInput.style.display = deptSelect.value === "__new__" ? "block" : "none";
      });
    });
  });

  container.querySelectorAll(".btn-cancel-member").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".team-member-row");
      row.querySelector(".team-member-edit-form").style.display = "none";
      row.querySelector(".team-member-display").style.display = "flex";
    });
  });

  container.querySelectorAll(".btn-save-member").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".team-member-row");
      const editBtn = row.querySelector(".btn-edit-member");
      const oldDept = editBtn.dataset.dept;
      const oldName = editBtn.dataset.name;
      const form = row.querySelector(".team-member-edit-form");
      const newName = form.querySelector(".edit-name-input").value.trim();
      const deptSelect = form.querySelector(".edit-dept-select");
      const newDept = deptSelect.value === "__new__" ? form.querySelector(".edit-dept-new-input").value.trim() : deptSelect.value;

      if (!newName || !newDept) {
        alert("Name and department cannot be empty.");
        return;
      }

      btn.disabled = true;
      btn.textContent = "Saving…";

      const { error } = await db.rpc("update_team_member", {
        input_mgmt_pin: mgmtState.pin,
        input_department: oldDept,
        input_name: oldName,
        new_department: newDept,
        new_name: newName,
      });

      btn.disabled = false;
      btn.textContent = "Save";

      if (error) {
        alert("Couldn't save changes: " + error.message);
        return;
      }

      await refreshTeamMembersUI();
    });
  });

  container.querySelectorAll(".btn-remove-member").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const dept = btn.dataset.dept;
      const name = btn.dataset.name;
      if (!confirm(`Remove ${name} from ${dept}? This applies to both branches.`)) return;

      btn.disabled = true;
      btn.textContent = "Removing…";

      const { error } = await db.rpc("remove_team_member", {
        input_mgmt_pin: mgmtState.pin,
        input_department: dept,
        input_name: name,
      });

      if (error) {
        btn.disabled = false;
        btn.textContent = "Remove";
        alert("Couldn't remove: " + error.message);
        return;
      }

      await refreshTeamMembersUI();
    });
  });
}

function populateDeptDropdown(members) {
  const select = document.getElementById("new-member-dept-select");
  const depts = [...new Set(members.map((m) => m.department))];

  select.innerHTML =
    depts.map((d) => `<option value="${d}">${d}</option>`).join("") +
    '<option value="__new__">+ New Department</option>';

  syncNewDeptInputVisibility();
}

function syncNewDeptInputVisibility() {
  const deptSelect = document.getElementById("new-member-dept-select");
  const newDeptInput = document.getElementById("new-member-dept-new");
  const isNew = deptSelect.value === "__new__";
  newDeptInput.style.display = isNew ? "block" : "none";
  if (!isNew) newDeptInput.value = "";
}

function setupAddTeamMember() {
  const deptSelect = document.getElementById("new-member-dept-select");
  const newDeptInput = document.getElementById("new-member-dept-new");
  const nameInput = document.getElementById("new-member-name-input");
  const statusEl = document.getElementById("add-member-status");
  const addBtn = document.getElementById("add-member-btn");

  deptSelect.addEventListener("change", () => {
    syncNewDeptInputVisibility();
  });

  addBtn.addEventListener("click", async () => {
    const dept = deptSelect.value === "__new__" ? newDeptInput.value.trim() : deptSelect.value;
    const name = nameInput.value.trim();

    if (!dept || !name) {
      statusEl.textContent = "Enter both a department and a name.";
      statusEl.className = "status-line error";
      statusEl.style.display = "block";
      return;
    }

    addBtn.disabled = true;
    addBtn.textContent = "Adding…";

    const { error } = await db.rpc("add_team_member", {
      input_mgmt_pin: mgmtState.pin,
      input_department: dept,
      input_name: name,
    });

    addBtn.disabled = false;
    addBtn.textContent = "Add";

    if (error) {
      statusEl.textContent = "Couldn't add — try again.";
      statusEl.className = "status-line error";
      statusEl.style.display = "block";
      return;
    }

    statusEl.textContent = "Added ✓";
    statusEl.className = "status-line ok";
    statusEl.style.display = "block";
    nameInput.value = "";
    newDeptInput.value = "";
    newDeptInput.style.display = "none";

    await refreshTeamMembersUI();
  });
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
  const csat = computeCsat(rows);
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
      <tr><td>NPS Score</td><td>${nps ? nps.score : "–"}</td></tr>
      <tr><td>CSAT</td><td>${csat ? csat.pct + "%" : "–"}</td></tr>
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

// ---------- Wiring ----------

document.addEventListener("DOMContentLoaded", async () => {
  setupMgmtPinPad();
  setupAddTeamMember();

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

  // Decide the correct view BEFORE showing anything, so there's no
  // flash of the PIN screen when arriving with a valid handed-off PIN.
  let storedPin = null;
  try {
    storedPin = sessionStorage.getItem("pv_mgmt_pin");
    sessionStorage.removeItem("pv_mgmt_pin");
  } catch (e) {
    storedPin = null;
  }

  if (storedPin) {
    const { data, error } = await db.rpc("verify_pin", { input_pin: storedPin });
    if (!error && data && data.length > 0 && data[0].role_key === "management") {
      mgmtState.pin = storedPin;
      await loadDashboard();
      showView("view-dashboard");
      return;
    }
  }

  showView("view-mgmt-pin");
});
