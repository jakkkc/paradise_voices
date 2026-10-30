// ==========================================================
// Paradise Voices - dashboard-loyalty.js
// Loyalty programme: management settings (stage 1).
// Loaded after dashboard.js (uses its mgmtState, db, showView).
// ==========================================================

const loyaltyState = { rates: [] };

function loyaltyEl(id) {
  return document.getElementById(id);
}

function loyaltyEsc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loyaltyNum(value) {
  const text = String(value === null || value === undefined ? "" : value).replace(/,/g, "").trim();
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
}

function loyaltyFmt(n) {
  return Math.round(n).toLocaleString("en-US");
}

function ensureLoyaltyView() {
  if (loyaltyEl("view-loyalty")) return;
  const view = document.createElement("div");
  view.id = "view-loyalty";
  view.className = "view dashboard-wrap";
  view.innerHTML = `
    <div class="dashboard-header">
      <h2 style="margin:0;">Loyalty Programme</h2>
      <button class="btn btn-primary" id="loyalty-save-btn" style="width:auto; padding:10px 18px;">Save Settings</button>
    </div>
    <div id="loyalty-status" class="status-line" style="display:none; margin-top:0; margin-bottom:12px;"></div>

    <h3 class="section-title">Earning Points</h3>
    <div class="card" style="max-width:100%; margin-bottom:16px;">
      <div class="loyalty-grid">
        <div>
          <label for="loyalty-earn-percent">Earn percentage <span class="loyalty-muted">(% of the room rate)</span></label>
          <input type="text" inputmode="decimal" id="loyalty-earn-percent" />
        </div>
        <div>
          <label for="loyalty-point-value">Value of one point <span class="loyalty-muted">(KES)</span></label>
          <input type="text" inputmode="decimal" id="loyalty-point-value" />
        </div>
        <div>
          <label for="loyalty-expiry">Points expire after <span class="loyalty-muted">(months, 0 = never)</span></label>
          <input type="text" inputmode="numeric" id="loyalty-expiry" />
        </div>
        <div>
          <label for="loyalty-large">Highlight redemptions of <span class="loyalty-muted">(points or more, 0 = off)</span></label>
          <input type="text" inputmode="numeric" id="loyalty-large" />
        </div>
      </div>
      <div class="loyalty-preview" id="loyalty-preview"></div>
    </div>

    <h3 class="section-title">Nightly Rate by Room Category</h3>
    <p class="empty-note" style="margin-bottom:10px;">Points are worked out from these rates, not from what a guest actually paid. Leave a rate blank to give no points for that category.</p>
    <div class="card" style="max-width:100%; margin-bottom:16px;" id="loyalty-rates"></div>

    <h3 class="section-title">Rewards</h3>
    <p class="empty-note" style="margin-bottom:10px;">Fixed rewards offered at the desk. Reception can also redeem a custom number of points.</p>
    <div class="card" style="max-width:100%; margin-bottom:16px;">
      <div id="loyalty-rewards"></div>
      <button class="btn btn-secondary" id="loyalty-add-reward" style="width:auto; padding:10px 18px; margin-top:12px;">+ Add Reward</button>
    </div>

    <button class="btn-link" id="loyalty-back-btn">Back to Analytics</button>
  `;
  document.querySelector(".app-main").appendChild(view);
}

function setLoyaltyStatus(message, kind) {
  const el = loyaltyEl("loyalty-status");
  if (!message) {
    el.style.display = "none";
    return;
  }
  el.textContent = message;
  el.className = "status-line" + (kind ? " " + kind : "");
  el.style.display = "block";
}

function rewardRowHtml(points, label) {
  return `
    <div class="loyalty-reward-row">
      <input type="text" inputmode="numeric" class="reward-points" placeholder="Points" value="${loyaltyEsc(points)}" />
      <input type="text" class="reward-label" placeholder="What the guest gets" value="${loyaltyEsc(label)}" />
      <button type="button" class="btn-remove-member loyalty-remove-reward">Remove</button>
    </div>
  `;
}

function renderLoyaltyRewards(rewards) {
  loyaltyEl("loyalty-rewards").innerHTML = rewards.map((r) => rewardRowHtml(r.points, r.label)).join("");
}

function renderLoyaltyRates() {
  const container = loyaltyEl("loyalty-rates");
  const byBranch = {};
  loyaltyState.rates.forEach((r) => {
    if (!byBranch[r.branch_code]) byBranch[r.branch_code] = [];
    byBranch[r.branch_code].push(r);
  });

  const codes = Object.keys(byBranch);
  container.innerHTML = codes.length
    ? codes
        .map(
          (code) => `
      <div class="loyalty-branch-title">${loyaltyEsc(BRANCH_NAMES[code] || code)}</div>
      ${byBranch[code]
        .map(
          (r) => `
        <div class="loyalty-rate-row">
          <span>${loyaltyEsc(r.category_name)}</span>
          <input type="text" inputmode="decimal" class="loyalty-rate-input" data-category="${r.category_id}"
                 placeholder="KES per night" value="${r.rate_per_night_kes === null ? "" : loyaltyEsc(r.rate_per_night_kes)}" />
        </div>
      `
        )
        .join("")}
    `
        )
        .join("")
    : '<p class="empty-note">No room categories found.</p>';
}

function updateLoyaltyPreview() {
  const preview = loyaltyEl("loyalty-preview");
  const earn = loyaltyNum(loyaltyEl("loyalty-earn-percent").value);
  const pointValue = loyaltyNum(loyaltyEl("loyalty-point-value").value);

  let sample = null;
  document.querySelectorAll(".loyalty-rate-input").forEach((input) => {
    const rate = loyaltyNum(input.value);
    if (!sample && rate && !Number.isNaN(rate)) {
      const found = loyaltyState.rates.find((r) => r.category_id === input.dataset.category);
      sample = { rate, name: found ? found.category_name : "a room" };
    }
  });

  if (earn === null || Number.isNaN(earn) || !pointValue || Number.isNaN(pointValue) || !sample) {
    preview.textContent = "Fill in the earn percentage, the value of a point and at least one nightly rate to see an example.";
    return;
  }

  const points = Math.round((sample.rate * 2 * (earn / 100)) / pointValue);
  preview.innerHTML = `Example: 2 nights in <strong>${loyaltyEsc(sample.name)}</strong> (KES ${loyaltyFmt(sample.rate)} per night) earns <strong>${loyaltyFmt(points)} points</strong>, worth KES ${loyaltyFmt(points * pointValue)}.`;
}

async function openLoyaltyView() {
  showView("view-loyalty");
  setLoyaltyStatus("Loading…", "");

  const { data, error } = await db.rpc("get_loyalty_settings", { input_pin: mgmtState.pin });

  if (error) {
    const missing = /could not find the function/i.test(error.message || "");
    setLoyaltyStatus(
      missing
        ? "The loyalty database setup hasn't been run in Supabase yet."
        : "Couldn't load loyalty settings: " + error.message,
      "error"
    );
    return;
  }

  const s = data.settings || {};
  loyaltyEl("loyalty-earn-percent").value = s.earn_percent ?? "";
  loyaltyEl("loyalty-point-value").value = s.point_value_kes ?? "";
  loyaltyEl("loyalty-expiry").value = s.expiry_months ?? "";
  loyaltyEl("loyalty-large").value = s.large_redemption_points ?? "";

  loyaltyState.rates = data.rates || [];
  renderLoyaltyRates();
  renderLoyaltyRewards(data.rewards || []);
  updateLoyaltyPreview();
  setLoyaltyStatus("", "");
}

async function saveLoyaltySettings() {
  const fail = (message) => setLoyaltyStatus(message, "error");

  const earn = loyaltyNum(loyaltyEl("loyalty-earn-percent").value);
  const pointValue = loyaltyNum(loyaltyEl("loyalty-point-value").value);
  const expiry = loyaltyNum(loyaltyEl("loyalty-expiry").value);
  const large = loyaltyNum(loyaltyEl("loyalty-large").value);

  if (earn === null || Number.isNaN(earn) || earn < 0 || earn > 100) return fail("Earn percentage must be a number from 0 to 100.");
  if (pointValue === null || Number.isNaN(pointValue) || pointValue <= 0) return fail("The value of one point must be more than 0.");
  if (expiry === null || Number.isNaN(expiry) || expiry < 0 || !Number.isInteger(expiry)) return fail("Expiry must be a whole number of months (0 = never).");
  if (large === null || Number.isNaN(large) || large < 0 || !Number.isInteger(large)) return fail("The highlight level must be a whole number of points (0 = off).");

  const rates = [];
  let rateError = null;
  document.querySelectorAll(".loyalty-rate-input").forEach((input) => {
    const rate = loyaltyNum(input.value);
    if (rate !== null && (Number.isNaN(rate) || rate < 0)) rateError = "Nightly rates must be numbers (or left blank).";
    rates.push({ category_id: input.dataset.category, rate: rate === null ? "" : rate });
  });
  if (rateError) return fail(rateError);

  const rewards = [];
  let rewardError = null;
  document.querySelectorAll(".loyalty-reward-row").forEach((row) => {
    const pointsText = row.querySelector(".reward-points").value.trim();
    const label = row.querySelector(".reward-label").value.trim();
    if (pointsText === "" && label === "") return;
    const points = loyaltyNum(pointsText);
    if (points === null || Number.isNaN(points) || points <= 0 || !Number.isInteger(points) || label === "") {
      rewardError = "Each reward needs a whole number of points and a description.";
      return;
    }
    rewards.push({ points, label });
  });
  if (rewardError) return fail(rewardError);
  rewards.sort((a, b) => a.points - b.points);

  const saveBtn = loyaltyEl("loyalty-save-btn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  const { error } = await db.rpc("save_loyalty_settings", {
    input_mgmt_pin: mgmtState.pin,
    payload: {
      earn_percent: earn,
      point_value_kes: pointValue,
      expiry_months: expiry,
      large_redemption_points: large,
      rates,
      rewards,
    },
  });

  saveBtn.disabled = false;
  saveBtn.textContent = "Save Settings";

  if (error) {
    fail("Couldn't save: " + error.message);
    return;
  }

  await openLoyaltyView();
  setLoyaltyStatus("Saved ✓", "ok");
}

document.addEventListener("DOMContentLoaded", () => {
  ensureLoyaltyView();

  loyaltyEl("loyalty-btn").addEventListener("click", openLoyaltyView);
  loyaltyEl("loyalty-back-btn").addEventListener("click", () => showView("view-dashboard"));
  loyaltyEl("loyalty-save-btn").addEventListener("click", saveLoyaltySettings);

  loyaltyEl("view-loyalty").addEventListener("input", updateLoyaltyPreview);

  loyaltyEl("loyalty-add-reward").addEventListener("click", () => {
    loyaltyEl("loyalty-rewards").insertAdjacentHTML("beforeend", rewardRowHtml("", ""));
  });

  loyaltyEl("loyalty-rewards").addEventListener("click", (event) => {
    const btn = event.target.closest(".loyalty-remove-reward");
    if (btn) btn.closest(".loyalty-reward-row").remove();
  });
});
