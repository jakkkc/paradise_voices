// ==========================================================
// Paradise Voices — dashboard-feedback.js
// "All Feedback" page: every response as a card, with filters,
// sorting, a summary strip and a CSV download.
// Loaded after dashboard-qr.js (uses mgmtState, showView, the
// stat helpers in dashboard.js, naturalRoomSort and SOURCE_LABELS
// from dashboard-qr.js, and downloadCsv/csvText/csvNum/loStamp
// from dashboard-loyalty-overview.js).
// ==========================================================

const FB_PAGE_SIZE = 25;
const fb = { limit: FB_PAGE_SIZE, rows: [], mentionNames: {} };

function fbEl(id) {
  return document.getElementById(id);
}

function fbEsc(text) {
  return String(text === null || text === undefined ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ensureFeedbackView() {
  if (fbEl("view-feedback")) return;
  const view = document.createElement("div");
  view.id = "view-feedback";
  view.className = "view dashboard-wrap";
  view.innerHTML = `
    <div class="dashboard-header">
      <h2 style="margin:0;">All Feedback</h2>
      <button class="btn btn-secondary" id="fb-download-btn" style="width:auto; padding:10px 18px;">Download list (CSV)</button>
    </div>

    <div class="card fb-filters-card">
      <div class="fb-filters">
        <div><label for="fb-branch">Branch</label><select id="fb-branch"><option value="">All branches</option></select></div>
        <div>
          <label for="fb-date">Date</label>
          <select id="fb-date">
            <option value="all">All time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="month">This month</option>
            <option value="custom">Custom range</option>
          </select>
        </div>
        <div id="fb-custom-dates" class="fb-custom-dates" style="display:none;">
          <div><label for="fb-from">From</label><input type="date" id="fb-from" /></div>
          <div><label for="fb-to">To</label><input type="date" id="fb-to" /></div>
        </div>
        <div><label for="fb-category">Room category</label><select id="fb-category"></select></div>
        <div><label for="fb-room">Room</label><select id="fb-room"></select></div>
        <div>
          <label for="fb-rating">Average rating</label>
          <select id="fb-rating">
            <option value="">Any</option>
            <option value="high">4 stars and above</option>
            <option value="mid">3 to under 4</option>
            <option value="low">Under 3</option>
          </select>
        </div>
        <div>
          <label for="fb-nps">NPS group</label>
          <select id="fb-nps">
            <option value="">Any</option>
            <option value="promoter">Promoters (9-10)</option>
            <option value="passive">Passives (7-8)</option>
            <option value="detractor">Detractors (0-6)</option>
            <option value="none">Did not answer</option>
          </select>
        </div>
        <div>
          <label for="fb-sentiment">Feedback type</label>
          <select id="fb-sentiment">
            <option value="">All</option>
            <option value="good">Good (no low scores)</option>
            <option value="bad">Needs attention (open)</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
        <div>
          <label for="fb-comment">Comment</label>
          <select id="fb-comment">
            <option value="">With or without</option>
            <option value="yes">Has a comment</option>
            <option value="no">No comment</option>
          </select>
        </div>
        <div><label for="fb-staff">Staff mentioned</label><select id="fb-staff"></select></div>
        <div>
          <label for="fb-source">Collected via</label>
          <select id="fb-source">
            <option value="">Any</option>
            <option value="tablet">Reception tablet</option>
            <option value="room_qr">Room QR code</option>
            <option value="reception_qr">Reception QR code</option>
          </select>
        </div>
        <div>
          <label for="fb-sort">Sort by</label>
          <select id="fb-sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="lowest">Lowest rating first</option>
            <option value="highest">Highest rating first</option>
          </select>
        </div>
      </div>
      <div class="fb-search-row">
        <input type="text" id="fb-search" placeholder="Search comments, guest name or contact" />
        <button class="btn btn-secondary" id="fb-reset-btn" style="width:auto; padding:10px 18px;">Reset filters</button>
      </div>
    </div>

    <div class="stat-grid" id="fb-summary"></div>
    <div id="fb-msg" class="status-line" style="display:none;"></div>
    <div id="fb-list"></div>
    <button class="btn btn-secondary" id="fb-more-btn" style="display:none;">Load more</button>

    <button class="btn-link" id="fb-back-btn">Back to Analytics</button>
  `;
  document.querySelector(".app-main").appendChild(view);
}

// ---------- Filter menus ----------

function fbSetOptions(select, options, placeholder) {
  const previous = select.value;
  select.innerHTML =
    `<option value="">${fbEsc(placeholder)}</option>` +
    options.map((o) => `<option value="${fbEsc(o.value)}">${fbEsc(o.label)}</option>`).join("");
  if (options.some((o) => o.value === previous)) select.value = previous;
}

function fbPopulateBranches() {
  const select = fbEl("fb-branch");
  const previous = select.value;
  select.innerHTML =
    '<option value="">All branches</option>' +
    mgmtState.branches.map((b) => `<option value="${fbEsc(b.id)}">${fbEsc(BRANCH_NAMES[b.code] || b.name)}</option>`).join("");
  select.value = mgmtState.branches.some((b) => b.id === previous) ? previous : "";
}

// Category names can repeat across branches ("Kibeu"), so the menu lists names.
function fbPopulateCategories() {
  const branch = fbEl("fb-branch").value;
  const names = new Set();
  mgmtState.roomCategories.forEach((c) => {
    if (!branch || c.branch_id === branch) names.add(c.name);
  });
  fbSetOptions(
    fbEl("fb-category"),
    [...names].sort().map((n) => ({ value: n, label: n })),
    "All categories"
  );
  fbPopulateRooms();
}

function fbPopulateRooms() {
  const branch = fbEl("fb-branch").value;
  const category = fbEl("fb-category").value;
  const catName = {};
  mgmtState.roomCategories.forEach((c) => (catName[c.id] = c.name));
  const branchCode = {};
  mgmtState.branches.forEach((b) => (branchCode[b.id] = b.code));

  const rooms = mgmtState.rooms
    .filter((r) => (!branch || r.branch_id === branch) && (!category || catName[r.category_id] === category))
    .sort((a, b) => (branchCode[a.branch_id] || "").localeCompare(branchCode[b.branch_id] || "") || naturalRoomSort(a, b));

  fbSetOptions(
    fbEl("fb-room"),
    rooms.map((r) => ({ value: r.id, label: branch ? r.room_number : `${branchCode[r.branch_id] || ""} ${r.room_number}`.trim() })),
    "All rooms"
  );
}

// Each branch has its own copy of a team member, so the menu lists names.
function fbPopulateStaff() {
  const names = [...new Set(mgmtState.teamMembers.map((t) => t.name))].sort();
  fbSetOptions(fbEl("fb-staff"), names.map((n) => ({ value: n, label: n })), "Anyone");
}

// ---------- Filtering ----------

function fbBounds() {
  const filter = fbEl("fb-date").value;
  const now = new Date();
  let from = null;
  let to = null;
  if (filter === "7" || filter === "30") {
    from = new Date(now);
    from.setDate(from.getDate() - Number(filter));
  } else if (filter === "month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (filter === "custom") {
    const f = fbEl("fb-from").value;
    const t = fbEl("fb-to").value;
    from = f ? new Date(f + "T00:00:00") : null;
    to = t ? new Date(t + "T23:59:59") : null;
  }
  return { from, to };
}

function fbBuildMentionMap() {
  const names = {};
  const byId = {};
  mgmtState.teamMembers.forEach((t) => (byId[t.id] = t.name));
  mgmtState.mentions.forEach((m) => {
    const name = byId[m.team_member_id];
    if (!name) return;
    if (!names[m.feedback_id]) names[m.feedback_id] = [];
    if (!names[m.feedback_id].includes(name)) names[m.feedback_id].push(name);
  });
  fb.mentionNames = names;
}

function fbSourceOf(row) {
  return row.source in SOURCE_LABELS ? row.source : "tablet"; // older responses have no source: they were tablet
}

function fbFiltered() {
  const branch = fbEl("fb-branch").value;
  const category = fbEl("fb-category").value;
  const room = fbEl("fb-room").value;
  const rating = fbEl("fb-rating").value;
  const nps = fbEl("fb-nps").value;
  const sentiment = fbEl("fb-sentiment").value;
  const comment = fbEl("fb-comment").value;
  const staff = fbEl("fb-staff").value;
  const source = fbEl("fb-source").value;
  const search = fbEl("fb-search").value.trim().toLowerCase();
  const { from, to } = fbBounds();

  const catByRoom = {};
  mgmtState.rooms.forEach((r) => (catByRoom[r.id] = r.category_id));
  const catName = {};
  mgmtState.roomCategories.forEach((c) => (catName[c.id] = c.name));

  return mgmtState.feedback.filter((r) => {
    if (branch && r.branch_id !== branch) return false;
    if (room && r.room_id !== room) return false;
    if (category && catName[catByRoom[r.room_id]] !== category) return false;

    const created = new Date(r.created_at);
    if (from && created < from) return false;
    if (to && created > to) return false;

    if (rating) {
      const avg = compositeScore(r);
      if (avg === null) return false;
      if (rating === "high" && avg < 4) return false;
      if (rating === "mid" && (avg < 3 || avg >= 4)) return false;
      if (rating === "low" && avg >= 3) return false;
    }

    if (nps) {
      const n = r.nps;
      const answered = n !== null && n !== undefined;
      if (nps === "none" && answered) return false;
      if (nps !== "none" && !answered) return false;
      if (nps === "promoter" && n < 9) return false;
      if (nps === "passive" && (n < 7 || n > 8)) return false;
      if (nps === "detractor" && n > 6) return false;
    }

    if (sentiment) {
      const isBad = getBadTriggers(r).length > 0;
      const done = isResolved(r);
      if (sentiment === "bad" && !(isBad && !done)) return false;
      if (sentiment === "good" && (isBad || done)) return false;
      if (sentiment === "resolved" && !done) return false;
    }

    if (comment === "yes" && !r.comment) return false;
    if (comment === "no" && r.comment) return false;

    if (staff && !(fb.mentionNames[r.id] || []).includes(staff)) return false;
    if (source && fbSourceOf(r) !== source) return false;

    if (search) {
      const haystack = `${r.comment || ""} ${r.guest_name || ""} ${r.guest_contact || ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function fbSort(rows) {
  const sort = fbEl("fb-sort").value;
  const byDate = (a, b) => new Date(b.created_at) - new Date(a.created_at);
  const score = (r) => {
    const s = compositeScore(r);
    return s === null ? null : s;
  };
  const sorted = [...rows];
  if (sort === "oldest") return sorted.sort((a, b) => -byDate(a, b));
  if (sort === "lowest" || sort === "highest") {
    const dir = sort === "lowest" ? 1 : -1;
    return sorted.sort((a, b) => {
      const sa = score(a);
      const sb = score(b);
      if (sa === null && sb === null) return byDate(a, b);
      if (sa === null) return 1; // unrated rows always last
      if (sb === null) return -1;
      return (sa - sb) * dir || byDate(a, b);
    });
  }
  return sorted.sort(byDate);
}

// ---------- Rendering ----------

function fbLookups() {
  const roomMap = {};
  mgmtState.rooms.forEach((r) => (roomMap[r.id] = r));
  const branchMap = {};
  mgmtState.branches.forEach((b) => (branchMap[b.id] = BRANCH_NAMES[b.code] || b.name));
  const { roomCatMap, catNameMap } = roomCategoryMaps();
  return { roomMap, branchMap, roomCatMap, catNameMap };
}

function fbCardHtml(row, lookups) {
  const triggers = getBadTriggers(row);
  const type = isResolved(row) ? "resolved" : triggers.length ? "bad" : "good";
  const badKeys = new Set(triggers.map((t) => t.key));
  const room = lookups.roomMap[row.room_id];
  const roomLabel = room ? room.room_number : "Unknown room";
  const date = new Date(row.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  const servedBy = fb.mentionNames[row.id] || [];

  const guest = [row.guest_name, row.guest_contact].filter(Boolean).map(fbEsc).join(" · ");
  const metaParts = [];
  if (servedBy.length) metaParts.push(`Served by ${fbEsc(servedBy.join(", "))}`);
  if (guest) metaParts.push(guest);
  metaParts.push(fbEsc(SOURCE_LABELS[fbSourceOf(row)]));

  return `
    <div class="feedback-card ${type}">
      <div class="feedback-card-header">
        <span>${fbEsc(lookups.branchMap[row.branch_id] || "")} · Room ${fbEsc(roomLabel)}</span>
        <span class="feedback-card-date">${fbEsc(date)}</span>
      </div>
      <div class="feedback-ratings">${buildRatingsRowHtml(row, badKeys)}</div>
      ${row.comment ? `<div class="feedback-comment-text">${fbEsc(row.comment)}</div>` : '<div class="feedback-meta">No comment left.</div>'}
      <div class="feedback-meta" style="margin-top:6px;">${metaParts.join(" · ")}</div>
      ${resolveControlsHtml(row)}
    </div>
  `;
}

function fbRenderSummary(rows) {
  const nps = computeNps(rows);
  const cards = [
    { v: rows.length, l: rows.length === 1 ? "Feedback" : "Feedbacks" },
    { v: formatAvg(pooledAverage(rows)), l: "Average rating" },
    { v: nps ? nps.score : "–", l: `NPS (${nps ? nps.count : 0} resp.)` },
    { v: rows.filter((r) => r.comment).length, l: "With comments" },
    { v: rows.filter((r) => getBadTriggers(r).length > 0 && !isResolved(r)).length, l: "Need attention" },
    { v: rows.filter(isResolved).length, l: "Resolved" },
  ];
  fbEl("fb-summary").innerHTML = cards
    .map((c) => `<div class="stat-card"><div class="stat-value">${c.v}</div><div class="stat-label">${c.l}</div></div>`)
    .join("");
}

function fbRender() {
  fb.rows = fbSort(fbFiltered());
  fbRenderSummary(fb.rows);

  const list = fbEl("fb-list");
  const more = fbEl("fb-more-btn");

  if (fb.rows.length === 0) {
    list.innerHTML = '<p class="empty-note">No feedback matches these filters.</p>';
    more.style.display = "none";
    return;
  }

  const lookups = fbLookups();
  const shown = fb.rows.slice(0, fb.limit);
  list.innerHTML = shown.map((r) => fbCardHtml(r, lookups)).join("");

  const remaining = fb.rows.length - shown.length;
  more.style.display = remaining > 0 ? "block" : "none";
  more.textContent = `Load more (${remaining} remaining)`;
}

// ---------- Opening, resetting, downloading ----------

function openFeedbackView() {
  fbBuildMentionMap();
  fbPopulateBranches();
  fbPopulateCategories();
  fbPopulateStaff();
  fb.limit = FB_PAGE_SIZE;
  showView("view-feedback");
  fbRender();
}

function fbResetFilters() {
  ["fb-branch", "fb-category", "fb-room", "fb-rating", "fb-nps", "fb-sentiment", "fb-comment", "fb-staff", "fb-source"].forEach(
    (id) => (fbEl(id).value = "")
  );
  fbEl("fb-date").value = "all";
  fbEl("fb-from").value = "";
  fbEl("fb-to").value = "";
  fbEl("fb-custom-dates").style.display = "none";
  fbEl("fb-sort").value = "newest";
  fbEl("fb-search").value = "";
  fbPopulateCategories();
  fb.limit = FB_PAGE_SIZE;
  fbRender();
}

function fbDownload() {
  const lookups = fbLookups();
  const header = [
    "Date", "Branch", "Room", "Room category",
    ...RATING_FIELDS.map((f) => f.label),
    "NPS", "Collected via", "Comment", "Guest name", "Guest contact", "Served by",
    "Status", "Resolved on", "Resolution note",
  ];
  const rows = [header];
  fb.rows.forEach((r) => {
    const room = lookups.roomMap[r.room_id];
    rows.push([
      loStamp(r.created_at),
      csvText(lookups.branchMap[r.branch_id] || ""),
      csvText(room ? room.room_number : ""),
      csvText(lookups.catNameMap[lookups.roomCatMap[r.room_id]] || ""),
      ...RATING_FIELDS.map((f) => csvNum(r[f.key])),
      csvNum(r.nps),
      csvText(SOURCE_LABELS[fbSourceOf(r)]),
      csvText(r.comment),
      csvText(r.guest_name),
      csvText(r.guest_contact),
      csvText((fb.mentionNames[r.id] || []).join(", ")),
      isResolved(r) ? "Resolved" : getBadTriggers(r).length ? "Needs attention" : "Good",
      loStamp(r.resolved_at),
      csvText(r.resolved_note),
    ]);
  });
  const today = new Date().toISOString().slice(0, 10);
  downloadCsv(`paradise-voices-feedback-${today}.csv`, rows);
  const msg = fbEl("fb-msg");
  msg.textContent = `Downloaded ${fb.rows.length} feedback${fb.rows.length === 1 ? "" : "s"}.`;
  msg.className = "status-line ok";
  msg.style.display = "block";
}

// ---------- Wiring ----------

document.addEventListener("DOMContentLoaded", () => {
  ensureFeedbackView();

  fbEl("feedback-btn").addEventListener("click", openFeedbackView);
  fbEl("fb-back-btn").addEventListener("click", () => showView("view-dashboard"));
  fbEl("fb-reset-btn").addEventListener("click", fbResetFilters);
  fbEl("fb-download-btn").addEventListener("click", fbDownload);
  fbEl("fb-more-btn").addEventListener("click", () => {
    fb.limit += FB_PAGE_SIZE;
    fbRender();
  });

  const refresh = () => {
    fb.limit = FB_PAGE_SIZE;
    fbEl("fb-msg").style.display = "none";
    fbRender();
  };

  fbEl("fb-branch").addEventListener("change", () => {
    fbPopulateCategories();
    refresh();
  });
  fbEl("fb-category").addEventListener("change", () => {
    fbPopulateRooms();
    refresh();
  });
  fbEl("fb-date").addEventListener("change", (e) => {
    fbEl("fb-custom-dates").style.display = e.target.value === "custom" ? "flex" : "none";
    refresh();
  });
  ["fb-room", "fb-from", "fb-to", "fb-rating", "fb-nps", "fb-sentiment", "fb-comment", "fb-staff", "fb-source", "fb-sort"].forEach((id) =>
    fbEl(id).addEventListener("change", refresh)
  );
  fbEl("fb-search").addEventListener("input", refresh);
});

// ---------- Resolve / reopen (used by the Analytics lists and this page) ----------

function afterResolveChange() {
  renderCommentGroups(periodFilteredRows());
  if (fbEl("view-feedback").classList.contains("active")) fbRender();
}

function resolveRpcError(error) {
  const missing = /could not find the function/i.test((error && error.message) || "");
  return missing ? "The resolve setup hasn't been run in Supabase yet." : (error && error.message) || "Something went wrong.";
}

function openResolveForm(btn) {
  const card = btn.closest(".feedback-card");
  if (!card || card.querySelector(".resolve-form")) return;
  const form = document.createElement("div");
  form.className = "resolve-form";
  form.dataset.id = btn.dataset.resolveId;
  form.innerHTML = `
    <label>What was done? <span class="loyalty-muted">(required)</span></label>
    <input type="text" class="resolve-note-input" maxlength="300" placeholder="e.g. Called the guest and offered a discount" />
    <div class="status-line error resolve-error" style="display:none; margin-top:6px;"></div>
    <div class="resolve-form-actions">
      <button type="button" class="btn btn-primary resolve-save" style="width:auto; padding:8px 16px;">Save</button>
      <button type="button" class="btn-link resolve-cancel" style="width:auto;">Cancel</button>
    </div>`;
  card.appendChild(form);
  btn.style.display = "none";
  form.querySelector("input").focus();
}

async function saveResolve(form) {
  const input = form.querySelector(".resolve-note-input");
  const errorEl = form.querySelector(".resolve-error");
  const note = input.value.trim();
  if (note.length < 3) {
    errorEl.textContent = "Please say briefly what was done.";
    errorEl.style.display = "block";
    return;
  }

  const saveBtn = form.querySelector(".resolve-save");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  const { error } = await db.rpc("resolve_feedback", {
    input_mgmt_pin: mgmtState.pin,
    input_feedback_id: form.dataset.id,
    input_note: note,
  });

  if (error) {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save";
    errorEl.textContent = resolveRpcError(error);
    errorEl.style.display = "block";
    return;
  }

  const row = mgmtState.feedback.find((r) => r.id === form.dataset.id);
  if (row) {
    row.resolved_at = new Date().toISOString();
    row.resolved_note = note;
  }
  afterResolveChange();
}

async function reopenFeedback(btn) {
  btn.disabled = true;
  const { error } = await db.rpc("reopen_feedback", {
    input_mgmt_pin: mgmtState.pin,
    input_feedback_id: btn.dataset.reopenId,
  });

  if (error) {
    btn.disabled = false;
    alert(resolveRpcError(error));
    return;
  }

  const row = mgmtState.feedback.find((r) => r.id === btn.dataset.reopenId);
  if (row) {
    row.resolved_at = null;
    row.resolved_note = null;
  }
  afterResolveChange();
}

document.addEventListener("click", (e) => {
  const resolveBtn = e.target.closest("[data-resolve-id]");
  if (resolveBtn) return openResolveForm(resolveBtn);

  const reopenBtn = e.target.closest("[data-reopen-id]");
  if (reopenBtn) return reopenFeedback(reopenBtn);

  const save = e.target.closest(".resolve-save");
  if (save) return saveResolve(save.closest(".resolve-form"));

  const cancel = e.target.closest(".resolve-cancel");
  if (cancel) {
    const card = cancel.closest(".feedback-card");
    card.querySelector(".resolve-form").remove();
    const btn = card.querySelector("[data-resolve-id]");
    if (btn) btn.style.display = "";
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.classList && e.target.classList.contains("resolve-note-input")) {
    saveResolve(e.target.closest(".resolve-form"));
  }
});
