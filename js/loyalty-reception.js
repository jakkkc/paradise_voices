// ==========================================================
// Paradise Voices - loyalty-reception.js
// Loyalty desk for reception: find or enrol a member, award
// points for a stay, redeem points. Loaded after app.js
// (uses its state, db, showView and BRANCH_NAMES).
// ==========================================================

const desk = { info: null, member: null, balance: 0, sel: null };

function deskEl(id) {
  return document.getElementById(id);
}

function deskEsc(text) {
  return String(text === null || text === undefined ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function deskFmt(n) {
  return Math.round(Number(n) || 0).toLocaleString("en-US");
}

function deskDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// The verified staff PIN. Guests on a QR link never have one.
function deskPin() {
  if (typeof guestSelfMode !== "undefined" && guestSelfMode) return null;
  return state.pinDigits && state.pinDigits.length === 4 ? state.pinDigits : null;
}

function deskFriendly(error) {
  const text = (error && error.message) || "Something went wrong.";
  if (/could not find the function/i.test(text)) return "Loyalty isn't set up yet. Please tell management.";
  return text;
}

function setDeskMsg(id, text, kind) {
  const el = deskEl(id);
  if (!text) {
    el.style.display = "none";
    return;
  }
  el.textContent = text;
  el.className = "status-line" + (kind ? " " + kind : "");
  el.style.display = "block";
}

function ensureDeskViews() {
  if (deskEl("view-loyalty-desk")) return;
  const main = document.querySelector(".app-main");

  const add = (id, html) => {
    const view = document.createElement("div");
    view.id = id;
    view.className = "view card";
    view.innerHTML = html;
    main.appendChild(view);
  };

  add(
    "view-loyalty-desk",
    `
    <h2>Loyalty Points</h2>
    <p class="subtitle" id="desk-branch"></p>
    <label for="desk-phone">Guest phone number</label>
    <input type="tel" id="desk-phone" placeholder="0712 345 678" />
    <button class="btn btn-primary" id="desk-find-btn">Find member</button>
    <div id="desk-msg" class="status-line" style="display:none;"></div>
    <div id="desk-result"></div>
    <button class="btn-link" id="desk-back-btn">Back</button>
  `
  );

  add(
    "view-loyalty-award",
    `
    <h2>Award Points</h2>
    <p class="subtitle" id="award-member"></p>
    <label for="award-room">Room the guest stayed in</label>
    <select id="award-room"></select>
    <label for="award-nights">Nights stayed</label>
    <input type="text" inputmode="numeric" id="award-nights" value="1" />
    <div class="loyalty-preview" id="award-preview" style="margin-bottom:16px;"></div>
    <div id="award-msg" class="status-line" style="display:none;"></div>
    <button class="btn btn-primary" id="award-btn" disabled>Award points</button>
    <button class="btn-link" id="award-cancel">Cancel</button>
  `
  );

  add(
    "view-loyalty-redeem",
    `
    <h2>Redeem Points</h2>
    <p class="subtitle" id="redeem-member"></p>
    <div class="desk-card" id="redeem-balance"></div>
    <label>Choose a reward</label>
    <div id="redeem-rewards"></div>
    <label for="redeem-custom">Or a custom amount (points)</label>
    <input type="text" inputmode="numeric" id="redeem-custom" placeholder="e.g. 2000" />
    <div class="loyalty-preview" id="redeem-summary" style="margin-bottom:16px;"></div>
    <div id="redeem-msg" class="status-line" style="display:none;"></div>
    <button class="btn btn-primary" id="redeem-btn" disabled>Redeem</button>
    <button class="btn-link" id="redeem-cancel">Cancel</button>
  `
  );
}

// ---------- Desk: find / enrol ----------

async function loadDeskInfo(pin) {
  const { data, error } = await db.rpc("loyalty_desk_info", { input_pin: pin });
  if (error) {
    desk.info = null;
    setDeskMsg("desk-msg", deskFriendly(error), "error");
    return false;
  }
  desk.info = data;
  return true;
}

async function openLoyaltyDesk() {
  const pin = deskPin();
  if (!pin) return;

  deskEl("desk-branch").textContent = BRANCH_NAMES[state.branchCode] || "";
  deskEl("desk-phone").value = "";
  deskEl("desk-result").innerHTML = "";
  setDeskMsg("desk-msg", "", "");
  desk.member = null;
  showView("view-loyalty-desk");
  await loadDeskInfo(pin);
}

async function deskFindMember() {
  const pin = deskPin();
  if (!pin) return;
  setDeskMsg("desk-msg", "", "");
  deskEl("desk-result").innerHTML = "";

  const raw = deskEl("desk-phone").value.trim();
  if (raw.replace(/\D/g, "").length < 7) {
    setDeskMsg("desk-msg", "Enter the guest's phone number.", "error");
    return;
  }

  if (!desk.info && !(await loadDeskInfo(pin))) return;

  const { data, error } = await db.rpc("loyalty_find_member", { input_pin: pin, input_phone: raw });
  if (error) {
    setDeskMsg("desk-msg", deskFriendly(error), "error");
    return;
  }

  if (data.found) renderDeskMember(data, "");
  else renderDeskNotFound(data.phone);
}

function renderDeskNotFound(phone) {
  desk.member = null;
  deskEl("desk-result").innerHTML = `
    <div class="desk-card">
      <div class="desk-name">Not a member yet</div>
      <div class="desk-phone">${deskEsc(phone)}</div>
      <label for="enrol-name">Guest name</label>
      <input type="text" id="enrol-name" placeholder="Full name" />
      <label for="enrol-email">Email <span class="loyalty-muted">(optional)</span></label>
      <input type="text" id="enrol-email" placeholder="name@example.com" />
      <label class="checkbox-item" style="border-bottom:none; align-items:flex-start;">
        <input type="checkbox" id="enrol-consent" style="margin-top:3px;" />
        <span>The guest agrees to join the loyalty programme and to us keeping their phone number to record their points.</span>
      </label>
      <button class="btn btn-primary" id="enrol-btn" style="margin-top:10px;">Enrol member</button>
    </div>
  `;
  deskEl("enrol-btn").onclick = () => deskEnrol(phone);
}

async function deskEnrol(phone) {
  const pin = deskPin();
  if (!pin) return;
  const name = deskEl("enrol-name").value.trim();
  const email = deskEl("enrol-email").value.trim();
  const consent = deskEl("enrol-consent").checked;

  if (name.length < 2) return setDeskMsg("desk-msg", "Enter the guest's name.", "error");
  if (!consent) return setDeskMsg("desk-msg", "Tick the box to confirm the guest agrees to join.", "error");

  const btn = deskEl("enrol-btn");
  btn.disabled = true;
  const { data, error } = await db.rpc("loyalty_enrol_member", {
    input_pin: pin,
    input_phone: phone,
    input_name: name,
    input_email: email,
    input_consent: true,
  });
  btn.disabled = false;

  if (error) return setDeskMsg("desk-msg", deskFriendly(error), "error");
  renderDeskMember(data, "Enrolled ✓ " + name + " is now a member.");
}

function renderDeskMember(data, banner) {
  desk.member = data.member;
  desk.balance = data.balance;
  const pointValue = (desk.info && desk.info.settings && desk.info.settings.point_value_kes) || 1;

  const recent = (data.recent || [])
    .map((t) => {
      let what = "Activity";
      if (t.type === "earn") what = "Stay" + (t.room_number ? ": Room " + t.room_number : "") + (t.nights ? ", " + t.nights + (t.nights === 1 ? " night" : " nights") : "");
      else if (t.type === "redeem") what = "Redeemed: " + (t.reward_label || "points");
      else if (t.type === "bonus") what = "Bonus points";
      else if (t.type === "adjust") what = "Adjustment";
      else if (t.type === "expire") what = "Expired points";
      const cls = t.points > 0 ? "desk-plus" : "desk-minus";
      const sign = t.points > 0 ? "+" : "";
      return `<div class="desk-activity-row"><span>${deskEsc(deskDate(t.created_at))} · ${deskEsc(what)}</span><span class="${cls}">${sign}${deskFmt(t.points)}</span></div>`;
    })
    .join("");

  const expiry =
    data.expiring_soon > 0
      ? `<div class="desk-expiry">${deskFmt(data.expiring_soon)} points expire by ${deskEsc(deskDate(data.next_expiry))}</div>`
      : "";

  deskEl("desk-result").innerHTML = `
    <div class="desk-card">
      <div class="desk-name">${deskEsc(data.member.name)}</div>
      <div class="desk-phone">${deskEsc(data.member.phone)}</div>
      <div class="desk-balance-points">${deskFmt(data.balance)}</div>
      <div class="desk-balance-sub">points · about KES ${deskFmt(data.balance * pointValue)}</div>
      ${expiry}
      ${recent ? `<div class="desk-activity-title">Recent activity</div>${recent}` : ""}
    </div>
    <div class="desk-actions">
      <button class="btn btn-primary" id="desk-award-btn">Award points for a stay</button>
      <button class="btn btn-secondary" id="desk-redeem-btn"${data.balance < 1 ? " disabled" : ""}>Redeem points</button>
    </div>
  `;
  deskEl("desk-award-btn").onclick = openAward;
  deskEl("desk-redeem-btn").onclick = openRedeem;
  setDeskMsg("desk-msg", banner, banner ? "ok" : "");
}

async function refreshDeskMember(banner) {
  const pin = deskPin();
  const { data, error } = await db.rpc("loyalty_find_member", { input_pin: pin, input_phone: desk.member.phone });
  if (!error && data.found) renderDeskMember(data, banner);
  showView("view-loyalty-desk");
}

// ---------- Award points ----------

function openAward() {
  deskEl("award-member").textContent = desk.member.name + " · " + desk.member.phone;
  const select = deskEl("award-room");
  select.innerHTML = deskEl("room-select").innerHTML;
  select.value = state.roomId || "";
  if (select.value !== (state.roomId || "")) select.selectedIndex = 0;
  deskEl("award-nights").value = "1";
  setDeskMsg("award-msg", "", "");
  updateAwardPreview();
  showView("view-loyalty-award");
}

function updateAwardPreview() {
  const select = deskEl("award-room");
  const preview = deskEl("award-preview");
  const btn = deskEl("award-btn");
  btn.disabled = true;

  if (!select.value) {
    preview.textContent = "Choose the room the guest stayed in.";
    return;
  }
  const nights = Number(deskEl("award-nights").value.trim());
  if (!Number.isInteger(nights) || nights < 1 || nights > 60) {
    preview.textContent = "Enter the number of nights (1 to 60).";
    return;
  }

  const option = select.options[select.selectedIndex];
  const category = option && option.parentElement ? option.parentElement.label : "";
  const rate = ((desk.info && desk.info.rates) || []).find((r) => r.category_name === category);
  if (!rate) {
    preview.textContent = "No nightly rate is set for this room category, so no points can be given. Ask management.";
    return;
  }

  const s = desk.info.settings;
  const points = Math.round((rate.rate_per_night_kes * nights * s.earn_percent) / 100 / s.point_value_kes);
  if (points < 1) {
    preview.textContent = "This stay earns no points.";
    return;
  }

  preview.innerHTML = `This stay earns <strong>${deskFmt(points)} points</strong> (worth KES ${deskFmt(points * s.point_value_kes)}).`;
  btn.disabled = false;
}

async function submitAward() {
  const pin = deskPin();
  if (!pin) return;
  const btn = deskEl("award-btn");
  btn.disabled = true;
  btn.textContent = "Awarding…";

  const { data, error } = await db.rpc("loyalty_award_stay", {
    input_pin: pin,
    input_member_id: desk.member.id,
    input_room_id: deskEl("award-room").value,
    input_nights: Number(deskEl("award-nights").value.trim()),
  });

  btn.textContent = "Award points";
  if (error) {
    setDeskMsg("award-msg", deskFriendly(error), "error");
    btn.disabled = false;
    return;
  }
  await refreshDeskMember(`${deskFmt(data.points)} points awarded. New balance: ${deskFmt(data.balance)}.`);
}

// ---------- Redeem points ----------

function openRedeem() {
  const pointValue = (desk.info && desk.info.settings && desk.info.settings.point_value_kes) || 1;
  desk.sel = null;
  deskEl("redeem-member").textContent = desk.member.name + " · " + desk.member.phone;
  deskEl("redeem-balance").innerHTML = `
    <div class="desk-balance-points">${deskFmt(desk.balance)}</div>
    <div class="desk-balance-sub">points available · about KES ${deskFmt(desk.balance * pointValue)}</div>
  `;

  const rewards = (desk.info && desk.info.rewards) || [];
  deskEl("redeem-rewards").innerHTML = rewards.length
    ? rewards
        .map(
          (r) => `
      <button type="button" class="desk-reward" data-points="${r.points}" data-label="${deskEsc(r.label)}"${r.points > desk.balance ? " disabled" : ""}>
        <span>${deskEsc(r.label)}</span><strong>${deskFmt(r.points)} pts</strong>
      </button>`
        )
        .join("")
    : '<p class="empty-note">No fixed rewards are set up.</p>';

  deskEl("redeem-custom").value = "";
  setDeskMsg("redeem-msg", "", "");
  updateRedeemSummary();
  showView("view-loyalty-redeem");
}

function updateRedeemSummary() {
  const summary = deskEl("redeem-summary");
  const btn = deskEl("redeem-btn");
  const pointValue = (desk.info && desk.info.settings && desk.info.settings.point_value_kes) || 1;
  btn.disabled = true;
  btn.textContent = "Redeem";

  if (!desk.sel) {
    summary.textContent = "Choose a reward or enter an amount.";
    return;
  }
  if (desk.sel.points > desk.balance) {
    summary.textContent = `Not enough points. The balance is ${deskFmt(desk.balance)}.`;
    return;
  }
  summary.innerHTML = `Redeem <strong>${deskFmt(desk.sel.points)} points</strong> (KES ${deskFmt(desk.sel.points * pointValue)}). Balance after: <strong>${deskFmt(desk.balance - desk.sel.points)}</strong>.`;
  btn.textContent = `Redeem ${deskFmt(desk.sel.points)} points`;
  btn.disabled = false;
}

async function submitRedeem() {
  const pin = deskPin();
  if (!pin || !desk.sel) return;
  const btn = deskEl("redeem-btn");
  btn.disabled = true;
  btn.textContent = "Redeeming…";

  const { data, error } = await db.rpc("loyalty_redeem", {
    input_pin: pin,
    input_member_id: desk.member.id,
    input_points: desk.sel.points,
    input_label: desk.sel.label,
  });

  if (error) {
    setDeskMsg("redeem-msg", deskFriendly(error), "error");
    updateRedeemSummary();
    return;
  }
  await refreshDeskMember(`${deskFmt(data.points)} points redeemed. New balance: ${deskFmt(data.balance)}.`);
}

// ---------- Wiring ----------

document.addEventListener("DOMContentLoaded", () => {
  ensureDeskViews();

  deskEl("loyalty-open-btn").addEventListener("click", openLoyaltyDesk);
  deskEl("desk-back-btn").addEventListener("click", () => showView("view-room"));
  deskEl("desk-find-btn").addEventListener("click", deskFindMember);
  deskEl("desk-phone").addEventListener("keydown", (e) => {
    if (e.key === "Enter") deskFindMember();
  });

  deskEl("award-room").addEventListener("change", updateAwardPreview);
  deskEl("award-nights").addEventListener("input", updateAwardPreview);
  deskEl("award-btn").addEventListener("click", submitAward);
  deskEl("award-cancel").addEventListener("click", () => showView("view-loyalty-desk"));

  deskEl("redeem-rewards").addEventListener("click", (e) => {
    const btn = e.target.closest(".desk-reward");
    if (!btn || btn.disabled) return;
    document.querySelectorAll(".desk-reward").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    deskEl("redeem-custom").value = "";
    desk.sel = { points: Number(btn.dataset.points), label: btn.dataset.label };
    updateRedeemSummary();
  });
  deskEl("redeem-custom").addEventListener("input", () => {
    document.querySelectorAll(".desk-reward").forEach((b) => b.classList.remove("active"));
    const n = Number(deskEl("redeem-custom").value.replace(/,/g, "").trim());
    desk.sel = Number.isInteger(n) && n > 0 ? { points: n, label: "Custom redemption" } : null;
    updateRedeemSummary();
  });
  deskEl("redeem-btn").addEventListener("click", submitRedeem);
  deskEl("redeem-cancel").addEventListener("click", () => showView("view-loyalty-desk"));
});
