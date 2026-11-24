// ==========================================================
// Paradise Voices - dashboard-nav.js
// Management top bar, page tabs, refresh, the needs-attention
// count and "click a score to see its feedback". Loaded last.
// ==========================================================

const NAV_BUTTONS = {
  "view-dashboard": "analytics-btn",
  "view-feedback": "feedback-btn",
  "view-loyalty": "loyalty-btn",
  "view-qr": "qr-codes-btn",
  "view-staff": "staff-settings-btn",
};

// True when data was refreshed while Analytics was hidden: charts can't be
// sized on a hidden page, so they are redrawn when it is next shown.
let analyticsStale = false;

// ---------- Top bar ----------

// Called by showView() in dashboard.js.
function onMgmtView(id) {
  document.body.classList.toggle("mgmt-in", id !== "view-mgmt-pin");
  Object.entries(NAV_BUTTONS).forEach(([view, btnId]) => {
    const btn = document.getElementById(btnId);
    if (view === id) {
      btn.setAttribute("aria-current", "page");
      const nav = btn.parentElement;
      nav.scrollLeft = btn.offsetLeft - nav.offsetLeft - (nav.clientWidth - btn.offsetWidth) / 2;
    } else {
      btn.removeAttribute("aria-current");
    }
  });
  window.scrollTo(0, 0);
  if (id === "view-dashboard" && analyticsStale && !document.querySelector("#view-dashboard .resolve-form")) {
    analyticsStale = false;
    renderDashboard();
  }
}

function setMgmtAlert(text) {
  const el = document.getElementById("dashboard-load-error");
  el.textContent = text;
  el.style.display = text ? "block" : "none";
}

function markUpdated() {
  document.getElementById("mgmt-updated").textContent =
    "Updated " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

async function refreshDashboard() {
  // Redrawing would throw away a half-written note.
  if (document.querySelector(".view.active .resolve-form")) {
    setMgmtAlert("Save or cancel the open note first, then refresh.");
    return;
  }
  const btn = document.getElementById("refresh-btn");
  btn.disabled = true;
  btn.textContent = "Refreshing…";
  const ok = await loadDashboard();
  btn.disabled = false;
  btn.textContent = "Refresh";
  if (!ok) return;

  const active = document.querySelector(".view.active").id;
  const editing = document.querySelector(".view.active .resolve-form");
  if (active === "view-dashboard" && !editing) renderDashboard();
  else analyticsStale = true;
  if (active === "view-feedback" && !editing) {
    fbBuildMentionMap();
    fbPopulateStaff();
    fbRender();
  }
  if (active === "view-loyalty") loLoad(); // overview only: settings being edited stay put
}

// ---------- Needs attention ----------

function updateAttention() {
  const count = mgmtState.feedback.filter((r) => getBadTriggers(r).length > 0 && !isResolved(r)).length;
  const badge = document.getElementById("attention-badge");
  badge.textContent = count;
  badge.style.display = count ? "" : "none";
  badge.setAttribute("aria-label", `${count} need attention`);
  const banner = document.getElementById("attention-banner");
  banner.textContent = `⚠ ${count} response${count === 1 ? " needs" : "s need"} attention. View`;
  banner.style.display = count ? "" : "none";
}

// ---------- Tabs ----------
// A view with several .tab-panel[data-tab] sections gets a tab bar inside
// its .tab-bar element.

function selectTab(view, key) {
  view.dataset.tab = key;
  view.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.dataset.tab === key));
  view.querySelectorAll(".tab-btn").forEach((b) => {
    const on = b.dataset.tab === key;
    b.setAttribute("aria-selected", on);
    b.tabIndex = on ? 0 : -1;
  });
}

function initTabs(viewId) {
  const view = document.getElementById(viewId);
  const bar = view.querySelector(".tab-bar");
  const panels = [...view.querySelectorAll(".tab-panel")];
  bar.setAttribute("role", "tablist");
  panels.forEach((panel) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab-btn";
    btn.id = `${viewId}-tab-${panel.dataset.tab}`;
    btn.dataset.tab = panel.dataset.tab;
    btn.textContent = panel.dataset.label;
    btn.setAttribute("role", "tab");
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", btn.id);
    btn.addEventListener("click", () => {
      selectTab(view, btn.dataset.tab);
      window.scrollTo(0, 0);
    });
    bar.appendChild(btn);
  });
  bar.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const btns = [...bar.children];
    const step = e.key === "ArrowRight" ? 1 : -1;
    const next = btns[(btns.indexOf(document.activeElement) + step + btns.length) % btns.length];
    next.focus();
    next.click();
  });
  selectTab(view, panels[0].dataset.tab);
}

// ---------- Click a score to see its feedback ----------

// Opens Feedback with only the given filters. `carry` keeps the branch and
// dates chosen on Analytics.
function openFeedbackWith(filters, carry) {
  openFeedbackView();
  fbResetFilters();
  if (carry) {
    const branch = document.getElementById("branch-filter").value;
    fbEl("fb-branch").value = branch === "all" ? "" : branch;
    fbPopulateCategories();
    fbEl("fb-from").value = document.getElementById("date-from").value;
    fbEl("fb-to").value = document.getElementById("date-to").value;
    fbEl("fb-date").value = document.getElementById("date-filter").value;
    fbEl("fb-date").dispatchEvent(new Event("change")); // shows or hides the custom dates
  }
  Object.entries(filters).forEach(([id, value]) => (fbEl(id).value = value));
  fb.limit = FB_PAGE_SIZE;
  fbEl("fb-msg").style.display = "none";
  fbRender();
}

function followScore(el) {
  const go = el.dataset.go;
  if (go === "period") openFeedbackWith({}, true);
  else if (go === "lowest") openFeedbackWith({ "fb-sort": "lowest" }, true);
  else if (go === "field") openFeedbackWith({ "fb-field": el.dataset.value, "fb-sort": "lowest" }, true);
  else if (go === "staff") openFeedbackWith({ "fb-staff": el.dataset.value }, true);
}

// ---------- Wiring ----------

document.addEventListener("DOMContentLoaded", () => {
  ["view-dashboard", "view-loyalty", "view-staff"].forEach(initTabs);

  // Pressing the page you are already on only scrolls up, so it can't reload
  // a form you are filling in.
  document.getElementById("mgmt-nav").addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest("button");
      if (!btn || !btn.hasAttribute("aria-current")) return;
      e.stopPropagation();
      window.scrollTo(0, 0);
    },
    true
  );
  document.getElementById("analytics-btn").addEventListener("click", () => showView("view-dashboard"));
  document.getElementById("refresh-btn").addEventListener("click", refreshDashboard);
  document.getElementById("attention-banner").addEventListener("click", () => openFeedbackWith({ "fb-sentiment": "bad" }, false));

  const dashboard = document.getElementById("view-dashboard");
  dashboard.addEventListener("click", (e) => {
    const el = e.target.closest("[data-go]");
    if (el) followScore(el);
  });
  dashboard.addEventListener("keydown", (e) => {
    const el = e.target.closest("[data-go]");
    if (!el || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    followScore(el);
  });

  // Sticky filters sit just under the top bar, whatever its height.
  const top = document.getElementById("mgmt-top");
  const measure = () => document.documentElement.style.setProperty("--mgmt-top", top.offsetHeight + "px");
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(measure).observe(top);
  measure();
});
