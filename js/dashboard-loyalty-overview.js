// ==========================================================
// Paradise Voices - dashboard-loyalty-overview.js
// Loyalty programme, stage 3: management overview, point
// corrections and CSV downloads. Loaded after dashboard-loyalty.js
// and inserts itself at the top of the Loyalty page.
// ==========================================================

const lo = { data: null, selected: null, branchesFilled: false };

function loEl(id) {
  return document.getElementById(id);
}

function loEsc(text) {
  return String(text === null || text === undefined ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loFmt(n) {
  return Math.round(Number(n) || 0).toLocaleString("en-US");
}

function loDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Africa/Nairobi",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function loStamp(iso) {
  return iso ? new Date(iso).toLocaleString("sv-SE", { timeZone: "Africa/Nairobi" }) : "";
}

function setLoMsg(id, text, kind) {
  const el = loEl(id);
  if (!text) {
    el.style.display = "none";
    return;
  }
  el.textContent = text;
  el.className = "status-line" + (kind ? " " + kind : "");
  el.style.display = "block";
}

function loBounds() {
  const period = loEl("lo-period").value;
  const now = new Date();
  let from = null;
  if (period === "7" || period === "30") {
    from = new Date(now);
    from.setDate(from.getDate() - Number(period));
  } else if (period === "month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return { from: from ? from.toISOString() : null, to: null };
}

function loBranch() {
  return loEl("lo-branch").value || null;
}

function ensureLoyaltyOverview() {
  const anchor = loEl("loyalty-status");
  if (!anchor || loEl("loyalty-overview")) return;

  anchor.insertAdjacentHTML(
    "afterend",
    `
    <div id="loyalty-overview">
      <h3 class="section-title">Overview</h3>
      <div class="filter-bar" style="margin-bottom:14px;">
        <select id="lo-branch"><option value="">All branches</option></select>
        <select id="lo-period">
          <option value="all">All time</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="month">This month</option>
        </select>
      </div>
      <div id="lo-msg" class="status-line" style="display:none; margin-top:0; margin-bottom:12px;"></div>
      <div class="stat-grid" id="lo-stats"></div>
      <p class="empty-note" id="lo-note" style="margin-top:8px;"></p>

      <h3 class="section-title">Large Redemptions</h3>
      <div id="lo-flagged"></div>

      <h3 class="section-title">Top Members</h3>
      <div class="card" style="max-width:100%;" id="lo-top"></div>

      <h3 class="section-title">Recent Activity</h3>
      <div class="card" style="max-width:100%;" id="lo-recent"></div>

      <h3 class="section-title">Correct a Member's Points</h3>
      <div class="card" style="max-width:100%;">
        <p class="empty-note" style="margin-bottom:10px;">Search by name or phone number. Every correction is saved with your reason.</p>
        <div style="display:flex; gap:10px;">
          <input type="text" id="lo-search" placeholder="Name or phone number" style="margin-bottom:0;" />
          <button class="btn btn-secondary" id="lo-search-btn" style="width:auto; padding:10px 18px;">Search</button>
        </div>
        <div id="lo-results" style="margin-top:12px;"></div>
        <div id="lo-adjust" style="display:none; margin-top:6px;">
          <div class="desk-card" id="lo-selected"></div>
          <label for="lo-adj-dir">What do you want to do?</label>
          <select id="lo-adj-dir">
            <option value="add">Add points</option>
            <option value="remove">Remove points</option>
          </select>
          <label for="lo-adj-points">Number of points</label>
          <input type="text" inputmode="numeric" id="lo-adj-points" />
          <label for="lo-adj-reason">Reason <span class="loyalty-muted">(required, saved with the correction)</span></label>
          <input type="text" id="lo-adj-reason" placeholder="e.g. Nights entered wrongly on 2 Nov" />
          <div id="lo-adj-msg" class="status-line" style="display:none;"></div>
          <button class="btn btn-primary" id="lo-adj-btn">Apply correction</button>
        </div>
      </div>

      <h3 class="section-title">Download Data</h3>
      <div class="card" style="max-width:100%;">
        <p class="empty-note" style="margin-bottom:12px;">The transactions file follows the branch and period chosen above. The members file lists every member with their current balance.</p>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn btn-secondary" id="lo-dl-members" style="width:auto; padding:10px 18px;">Download members (CSV)</button>
          <button class="btn btn-secondary" id="lo-dl-tx" style="width:auto; padding:10px 18px;">Download transactions (CSV)</button>
        </div>
        <div id="lo-dl-msg" class="status-line" style="display:none;"></div>
      </div>

      <h3 class="section-title">Settings</h3>
    </div>
  `
  );
}

function fillLoBranches() {
  if (lo.branchesFilled || !mgmtState.branches || !mgmtState.branches.length) return;
  const select = loEl("lo-branch");
  mgmtState.branches.forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = BRANCH_NAMES[b.code] || b.name;
    select.appendChild(opt);
  });
  lo.branchesFilled = true;
}

function loDescribe(t) {
  if (t.type === "earn") return "Stay" + (t.room_number ? ": Room " + t.room_number : "") + (t.nights ? ", " + t.nights + (t.nights === 1 ? " night" : " nights") : "");
  if (t.type === "redeem") return "Redeemed: " + (t.reward_label || "points") + (t.flagged ? " (large)" : "");
  if (t.type === "adjust") return "Correction: " + (t.note || "");
  if (t.type === "bonus") return "Bonus points";
  if (t.type === "expire") return "Expired points";
  return t.type;
}

async function loLoad() {
  if (!mgmtState.pin || !loEl("loyalty-overview")) return;
  fillLoBranches();
  setLoMsg("lo-msg", "Loading…", "");

  const { from, to } = loBounds();
  const { data, error } = await db.rpc("loyalty_overview", {
    input_pin: mgmtState.pin,
    input_branch: loBranch(),
    input_from: from,
    input_to: to,
  });

  if (error) {
    const missing = /could not find the function/i.test(error.message || "");
    setLoMsg(
      "lo-msg",
      missing ? "The loyalty overview setup hasn't been run in Supabase yet." : "Couldn't load the overview: " + error.message,
      "error"
    );
    return;
  }

  setLoMsg("lo-msg", "", "");
  lo.data = data;
  renderLoOverview();
}

function renderLoOverview() {
  const d = lo.data;
  const pv = d.settings.point_value_kes || 1;

  const cards = [
    { v: loFmt(d.members_total), l: `Members (${loFmt(d.members_new)} new)` },
    { v: loFmt(d.issued), l: "Points issued" },
    { v: loFmt(d.redeemed), l: "Points redeemed" },
    { v: loFmt(d.outstanding), l: `Outstanding (KES ${loFmt(d.outstanding * pv)})` },
    { v: loFmt(d.expiring_soon), l: "Expiring in 60 days" },
  ];
  loEl("lo-stats").innerHTML = cards
    .map((c) => `<div class="stat-card"><div class="stat-value">${c.v}</div><div class="stat-label">${c.l}</div></div>`)
    .join("");

  const adjusted = Number(d.adjusted) || 0;
  loEl("lo-note").textContent =
    "Members, issued and redeemed follow the branch and period above. Outstanding and expiring are as of today, for all members." +
    (adjusted !== 0 ? ` Manual corrections in this period: ${adjusted > 0 ? "+" : ""}${loFmt(adjusted)} points.` : "");

  // Large redemptions
  const flagged = d.flagged || [];
  if (!flagged.length) {
    loEl("lo-flagged").innerHTML =
      d.settings.large_redemption_points > 0
        ? '<p class="empty-note">No large redemptions in this period.</p>'
        : '<p class="empty-note">Highlighting is off. Set a level under "Highlight redemptions of" in the settings below.</p>';
  } else {
    loEl("lo-flagged").innerHTML = flagged
      .map(
        (f) => `
      <div class="feedback-card bad">
        <div class="feedback-card-header"><span>${loEsc(f.name)} · ${loEsc(f.phone)}</span><span class="feedback-card-date">${loEsc(loDate(f.created_at))}</span></div>
        <div class="feedback-ratings"><span class="low">${loFmt(f.points)} points</span></div>
        <div class="feedback-comment-text">${loEsc(f.reward_label || "Redemption")}</div>
        <div class="feedback-meta">${loEsc(f.branch_code || "")}${f.branch_code && f.staff_role ? " · " : ""}${loEsc(f.staff_role || "")}</div>
      </div>`
      )
      .join("");
  }

  // Top members
  const top = d.top || [];
  loEl("lo-top").innerHTML = top.length
    ? top
        .map(
          (m) =>
            `<div class="desk-activity-row"><span>${loEsc(m.name)} · ${loEsc(m.phone)}</span><span class="desk-plus">${loFmt(m.balance)} pts</span></div>`
        )
        .join("")
    : '<p class="empty-note" style="margin:0;">No members with points yet.</p>';

  // Recent activity
  const recent = d.recent || [];
  loEl("lo-recent").innerHTML = recent.length
    ? recent
        .map((t) => {
          const cls = t.points > 0 ? "desk-plus" : "desk-minus";
          const sign = t.points > 0 ? "+" : "";
          const where = t.branch_code ? " · " + t.branch_code : "";
          return `<div class="desk-activity-row"><span>${loEsc(loDate(t.created_at))} · ${loEsc(t.name)} (${loEsc(t.phone)}) · ${loEsc(loDescribe(t))}${loEsc(where)}</span><span class="${cls}">${sign}${loFmt(t.points)}</span></div>`;
        })
        .join("")
    : '<p class="empty-note" style="margin:0;">No activity in this period.</p>';
}

// ---------- Correct a member's points ----------

async function loSearch() {
  const query = loEl("lo-search").value.trim();
  loEl("lo-adjust").style.display = "none";
  lo.selected = null;

  if (query.length < 2) {
    loEl("lo-results").innerHTML = '<p class="empty-note" style="margin:0;">Type at least 2 letters or digits.</p>';
    return;
  }

  const { data, error } = await db.rpc("loyalty_search_members", { input_pin: mgmtState.pin, input_query: query });
  if (error) {
    loEl("lo-results").innerHTML = `<div class="status-line error">${loEsc(error.message)}</div>`;
    return;
  }

  loEl("lo-results").innerHTML = (data || []).length
    ? data
        .map(
          (m) => `
      <button type="button" class="desk-reward" data-id="${loEsc(m.id)}" data-name="${loEsc(m.name)}" data-phone="${loEsc(m.phone)}" data-balance="${Number(m.balance) || 0}">
        <span>${loEsc(m.name)} · ${loEsc(m.phone)}</span><strong>${loFmt(m.balance)} pts</strong>
      </button>`
        )
        .join("")
    : '<p class="empty-note" style="margin:0;">No member found.</p>';
}

function loShowSelected() {
  const m = lo.selected;
  loEl("lo-selected").innerHTML = `
    <div class="desk-name">${loEsc(m.name)}</div>
    <div class="desk-phone">${loEsc(m.phone)}</div>
    <div class="desk-balance-points">${loFmt(m.balance)}</div>
    <div class="desk-balance-sub">points</div>
  `;
  loEl("lo-adjust").style.display = "block";
}

async function loApplyAdjust() {
  const m = lo.selected;
  if (!m) return;
  const direction = loEl("lo-adj-dir").value;
  const n = Number(loEl("lo-adj-points").value.replace(/,/g, "").trim());
  const reason = loEl("lo-adj-reason").value.trim();

  if (!Number.isInteger(n) || n < 1) return setLoMsg("lo-adj-msg", "Enter a whole number of points.", "error");
  if (direction === "remove" && n > m.balance) return setLoMsg("lo-adj-msg", `The member only has ${loFmt(m.balance)} points.`, "error");
  if (reason.length < 5) return setLoMsg("lo-adj-msg", "Give a reason (at least 5 characters).", "error");

  const btn = loEl("lo-adj-btn");
  btn.disabled = true;
  btn.textContent = "Applying…";

  const { data, error } = await db.rpc("loyalty_adjust", {
    input_mgmt_pin: mgmtState.pin,
    input_member_id: m.id,
    input_points: direction === "remove" ? -n : n,
    input_reason: reason,
  });

  btn.disabled = false;
  btn.textContent = "Apply correction";

  if (error) return setLoMsg("lo-adj-msg", error.message, "error");

  m.balance = data.balance;
  loShowSelected();
  loEl("lo-adj-points").value = "";
  loEl("lo-adj-reason").value = "";
  setLoMsg("lo-adj-msg", `Done ✓ ${direction === "remove" ? "Removed" : "Added"} ${loFmt(n)} points. New balance: ${loFmt(data.balance)}.`, "ok");
  loLoad();
}

// ---------- CSV downloads ----------

function csvQuote(s) {
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Text cells: stop spreadsheet programs treating typed text as a formula.
function csvText(v) {
  if (v === null || v === undefined || v === "") return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return csvQuote(s);
}

function csvNum(v) {
  return v === null || v === undefined ? "" : String(v);
}

// Phone numbers keep their leading + when opened in Excel.
function csvPhone(p) {
  return p ? csvQuote('="' + p + '"') : "";
}

function downloadCsv(filename, rows) {
  const text = "\uFEFF" + rows.map((r) => r.join(",")).join("\r\n");
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function loDownload(kind) {
  setLoMsg("lo-dl-msg", "Preparing…", "");
  const { from, to } = loBounds();
  const { data, error } = await db.rpc("loyalty_export", {
    input_pin: mgmtState.pin,
    input_branch: loBranch(),
    input_from: from,
    input_to: to,
  });

  if (error) {
    const missing = /could not find the function/i.test(error.message || "");
    return setLoMsg("lo-dl-msg", missing ? "The loyalty export setup hasn't been run in Supabase yet." : error.message, "error");
  }

  const today = new Date().toISOString().slice(0, 10);

  if (kind === "members") {
    const rows = [["Name", "Phone", "Email", "Joined", "Enrolled at", "Points balance", "Total earned", "Total redeemed"]];
    (data.members || []).forEach((m) =>
      rows.push([csvText(m.name), csvPhone(m.phone), csvText(m.email), loStamp(m.joined), csvText(m.enrolled_branch), csvNum(m.balance), csvNum(m.total_earned), csvNum(m.total_redeemed)])
    );
    downloadCsv(`paradise-voices-loyalty-members-${today}.csv`, rows);
    return setLoMsg("lo-dl-msg", `Downloaded ${(data.members || []).length} members.`, "ok");
  }

  const rows = [["Date", "Member", "Phone", "Type", "Points", "Branch", "Room", "Room category", "Nights", "Rate per night (KES)", "Earn %", "Staff role", "Reward or reason", "Large redemption"]];
  (data.transactions || []).forEach((t) =>
    rows.push([
      loStamp(t.created_at),
      csvText(t.name),
      csvPhone(t.phone),
      csvText(t.type),
      csvNum(t.points),
      csvText(t.branch_code),
      csvText(t.room_number),
      csvText(t.category),
      csvNum(t.nights),
      csvNum(t.rate_per_night_kes),
      csvNum(t.earn_percent),
      csvText(t.staff_role),
      csvText(t.reward_label || t.note),
      t.flagged ? "yes" : "",
    ])
  );
  downloadCsv(`paradise-voices-loyalty-transactions-${today}.csv`, rows);
  setLoMsg("lo-dl-msg", `Downloaded ${(data.transactions || []).length} transactions.`, "ok");
}

// ---------- Wiring ----------

document.addEventListener("DOMContentLoaded", () => {
  ensureLoyaltyOverview();
  if (!loEl("loyalty-overview")) return;

  loEl("loyalty-btn").addEventListener("click", loLoad);
  loEl("lo-branch").addEventListener("change", loLoad);
  loEl("lo-period").addEventListener("change", loLoad);

  loEl("lo-search-btn").addEventListener("click", loSearch);
  loEl("lo-search").addEventListener("keydown", (e) => {
    if (e.key === "Enter") loSearch();
  });
  loEl("lo-results").addEventListener("click", (e) => {
    const btn = e.target.closest(".desk-reward");
    if (!btn) return;
    document.querySelectorAll("#lo-results .desk-reward").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    lo.selected = { id: btn.dataset.id, name: btn.dataset.name, phone: btn.dataset.phone, balance: Number(btn.dataset.balance) };
    setLoMsg("lo-adj-msg", "", "");
    loShowSelected();
  });
  loEl("lo-adj-btn").addEventListener("click", loApplyAdjust);

  loEl("lo-dl-members").addEventListener("click", () => loDownload("members"));
  loEl("lo-dl-tx").addEventListener("click", () => loDownload("transactions"));
});
