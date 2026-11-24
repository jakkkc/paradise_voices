// ==========================================================
// Paradise Voices - paper-entry.js  (temporary)
// One-page form for reception to type in paper feedback under the
// date written on it. Only offered while management has it switched
// on. Loaded after app.js and loyalty-reception.js (uses state, db,
// showView, RATING_CATEGORIES, generateUUID, deskPin, deskEsc, setDeskMsg).
// ==========================================================

const PAPER_REFERRALS = [
  { value: "online", label: "Online" },
  { value: "referral", label: "Referral" },
  { value: "repeat_guest", label: "Repeat Guest" },
  { value: "other", label: "Other" },
];

// Kept apart from `state` so the guest wizard is never affected.
// `team` is null until the staff list has loaded.
const paper = { id: null, ratings: {}, nps: null, referral: null, mentions: new Set(), team: null };

function paperEl(id) {
  return document.getElementById(id);
}

// YYYY-MM-DD in Nairobi, whatever the tablet's own time zone is.
function paperToday() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Africa/Nairobi" });
}

function paperMinDate() {
  const today = paperToday();
  return Number(today.slice(0, 4)) - 2 + today.slice(4);
}

function paperNiceDate(day) {
  return new Date(day + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function ensurePaperViews() {
  if (paperEl("view-paper")) return;
  const main = document.querySelector(".app-main");
  const optional = '<span class="paper-optional">(optional)</span>';
  const required = '<span class="required-mark">*</span>';

  const add = (id, html) => {
    const view = document.createElement("div");
    view.id = id;
    view.className = "view card paper-card";
    view.innerHTML = html;
    main.appendChild(view);
  };

  add(
    "view-paper",
    `
    <h2>Paper Form</h2>
    <p class="subtitle" id="paper-branch"></p>
    <div id="paper-saved" class="status-line" style="display:none;"></div>

    <div class="paper-grid">
      <div><label for="paper-date">Date on the paper ${required}</label><input type="date" id="paper-date" /></div>
      <div><label for="paper-room">Room ${required}</label><select id="paper-room"></select></div>
    </div>

    <div id="paper-ratings">
      ${RATING_CATEGORIES.map(
        (cat) => `
        <div class="paper-rating-row">
          <span>${deskEsc(cat.label)} ${cat.required ? required : ""}</span>
          <div class="stars" data-key="${cat.key}">
            ${[1, 2, 3, 4, 5]
              .map((i) => `<button type="button" class="star" data-value="${i}" aria-label="${deskEsc(cat.label)}: ${i} of 5">★</button>`)
              .join("")}
          </div>
        </div>`
      ).join("")}
    </div>
    <p class="rating-hint">Tap a selected star again to clear it.</p>

    <label>Likely to recommend us, 0 to 10 ${optional}</label>
    <div class="chip-group paper-chips" id="paper-nps">
      ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<button type="button" class="chip" data-value="${n}">${n}</button>`).join("")}
    </div>

    <label>How did they hear about us? ${required}</label>
    <div class="chip-group paper-chips" id="paper-referral">
      ${PAPER_REFERRALS.map((r) => `<button type="button" class="chip" data-value="${r.value}">${r.label}</button>`).join("")}
    </div>

    <label>Who made their stay special? ${optional}</label>
    <div id="paper-mentions"></div>

    <label for="paper-comment">Comment ${optional}</label>
    <textarea id="paper-comment" rows="3"></textarea>

    <div class="paper-grid">
      <div><label for="paper-name">Guest name ${optional}</label><input type="text" id="paper-name" autocomplete="off" /></div>
      <div><label for="paper-contact">Phone or email ${optional}</label><input type="text" id="paper-contact" autocomplete="off" /></div>
    </div>

    <div id="paper-msg" class="status-line error" style="display:none;"></div>
    <button class="btn btn-primary" id="paper-review-btn">Review</button>
    <button class="btn-link" id="paper-back-btn">Back</button>
  `
  );

  add(
    "view-paper-review",
    `
    <h2>Check Before Saving</h2>
    <p class="subtitle">Does this match the paper?</p>
    <div id="paper-summary"></div>
    <div id="paper-review-msg" class="status-line" style="display:none;"></div>
    <div class="step-nav">
      <button class="btn btn-secondary" id="paper-edit-btn">Edit</button>
      <button class="btn btn-primary" id="paper-save-btn">Save</button>
    </div>
  `
  );
}

// ---------- Switch ----------

// Shows the button only if the database says paper entry is on. Called after
// a PIN is accepted and again (to hide it) when the screen is reset.
async function refreshPaperButton() {
  const btn = paperEl("paper-open-btn");
  btn.style.display = "none";
  const pin = deskPin();
  if (!pin) return;
  const { data, error } = await db.rpc("paper_entry_status", { input_pin: pin });
  if (!error && data === true && deskPin() === pin) btn.style.display = "";
}

// ---------- Form ----------

function paintPaperChoices() {
  document.querySelectorAll("#paper-ratings .stars").forEach((row) => {
    const value = paper.ratings[row.dataset.key] || 0;
    [...row.children].forEach((s) => s.classList.toggle("filled", Number(s.dataset.value) <= value));
  });
  document
    .querySelectorAll("#paper-nps .chip")
    .forEach((c) => c.classList.toggle("active", Number(c.dataset.value) === paper.nps));
  document
    .querySelectorAll("#paper-referral .chip")
    .forEach((c) => c.classList.toggle("active", c.dataset.value === paper.referral));
}

function resetPaperForm(keepDate) {
  paper.id = generateUUID();
  paper.ratings = {};
  RATING_CATEGORIES.forEach((cat) => (paper.ratings[cat.key] = null));
  paper.nps = null;
  paper.referral = null;
  paper.mentions = new Set();
  if (!keepDate) paperEl("paper-date").value = "";
  paperEl("paper-room").selectedIndex = 0;
  ["paper-comment", "paper-name", "paper-contact"].forEach((id) => (paperEl(id).value = ""));
  document.querySelectorAll("#paper-mentions input").forEach((box) => (box.checked = false));
  setDeskMsg("paper-msg", "", "");
  paintPaperChoices();
}

function paperIsDirty() {
  return (
    Object.values(paper.ratings).some((v) => v !== null) ||
    paper.nps !== null ||
    paper.referral !== null ||
    paper.mentions.size > 0 ||
    paperEl("paper-room").value !== "" ||
    ["paper-comment", "paper-name", "paper-contact"].some((id) => paperEl(id).value.trim() !== "")
  );
}

async function loadPaperTeam() {
  const box = paperEl("paper-mentions");
  const branchId = state.branchId;
  paper.team = null;
  box.innerHTML = '<p class="rating-hint">Loading…</p>';

  const { data, error } = await db
    .from("team_members")
    .select("id, name, department")
    .eq("branch_id", branchId)
    .eq("active", true)
    .order("department")
    .order("name");
  if (branchId !== state.branchId) return;

  if (error) {
    box.innerHTML =
      '<p class="rating-hint">Couldn\'t load the staff list. <button type="button" class="paper-retry" id="paper-team-retry">Try again</button></p>';
    paperEl("paper-team-retry").onclick = loadPaperTeam;
    return;
  }

  paper.team = data || [];
  const byDept = new Map();
  paper.team.forEach((m) => {
    if (!byDept.has(m.department)) byDept.set(m.department, []);
    byDept.get(m.department).push(m);
  });
  box.innerHTML = paper.team.length
    ? [...byDept]
        .map(
          ([dept, members]) => `
      <div class="dept-title">${deskEsc(dept)}</div>
      <div class="paper-staff">
        ${members
          .map((m) => `<label class="checkbox-item"><input type="checkbox" value="${m.id}" /><span>${deskEsc(m.name)}</span></label>`)
          .join("")}
      </div>`
        )
        .join("")
    : '<p class="rating-hint">No team members listed yet.</p>';
}

async function openPaperForm() {
  if (!deskPin()) return;
  paperEl("paper-branch").textContent = BRANCH_NAMES[state.branchCode] || "";
  paperEl("paper-room").innerHTML = paperEl("room-select").innerHTML;
  const date = paperEl("paper-date");
  date.min = paperMinDate();
  date.max = paperToday();
  resetPaperForm(false);
  setDeskMsg("paper-saved", "", "");
  showView("view-paper");
  window.scrollTo(0, 0);
  await loadPaperTeam();
}

function closePaperForm() {
  if (paperIsDirty() && !window.confirm("Leave without saving this paper form?")) return;
  resetPaperForm(false);
  showView("view-room");
}

// Returns a message if something is missing or wrong, otherwise "".
function paperProblem() {
  const day = paperEl("paper-date").value;
  if (!day) return "Enter the date on the paper.";
  if (day > paperToday()) return "The date cannot be in the future.";
  if (day < paperMinDate()) return "The date cannot be more than 2 years ago.";
  if (!paperEl("paper-room").value) return "Choose the room.";
  const missing = RATING_CATEGORIES.find((c) => c.required && paper.ratings[c.key] === null);
  if (missing) return "Rate: " + missing.label + ".";
  if (!paper.referral) return "Choose how they heard about us.";
  if (paper.team === null) return "The staff list hasn't loaded. Check your connection and try again.";
  return "";
}

// ---------- Review and save ----------

function openPaperReview() {
  const problem = paperProblem();
  setDeskMsg("paper-msg", problem, "error");
  if (problem) return;

  const room = paperEl("paper-room");
  const text = (id) => paperEl(id).value.trim();
  const row = (label, value) =>
    `<div class="paper-sum-row"><span>${deskEsc(label)}</span><strong>${deskEsc(value)}</strong></div>`;
  const served = paper.team.filter((m) => paper.mentions.has(m.id)).map((m) => m.name);

  paperEl("paper-summary").innerHTML = `
    <div class="room-summary">
      <strong>${deskEsc(paperNiceDate(paperEl("paper-date").value))}</strong><br>
      Room ${deskEsc(room.options[room.selectedIndex].textContent)}
    </div>
    ${RATING_CATEGORIES.map((c) => row(c.label, paper.ratings[c.key] === null ? "–" : paper.ratings[c.key] + " / 5")).join("")}
    ${row("Recommend", paper.nps === null ? "–" : paper.nps + " / 10")}
    ${row("Heard about us", PAPER_REFERRALS.find((r) => r.value === paper.referral).label)}
    ${row("Staff", served.join(", ") || "–")}
    ${row("Comment", text("paper-comment") || "–")}
    ${row("Guest", [text("paper-name"), text("paper-contact")].filter(Boolean).join(" · ") || "–")}
  `;
  setDeskMsg("paper-review-msg", "", "");
  setPaperSaveMode(false);
  showView("view-paper-review");
  window.scrollTo(0, 0);
}

// `force` is true once reception has been warned about a possible duplicate.
function setPaperSaveMode(force) {
  const btn = paperEl("paper-save-btn");
  btn.dataset.force = force ? "1" : "";
  btn.textContent = force ? "Save anyway" : "Save";
}

async function submitPaper() {
  const pin = deskPin();
  if (!pin) return;
  const btn = paperEl("paper-save-btn");
  const editBtn = paperEl("paper-edit-btn");
  const force = btn.dataset.force === "1";
  btn.disabled = editBtn.disabled = true;
  btn.textContent = "Saving…";

  const { data, error } = await db.rpc("submit_paper_feedback", {
    input_pin: pin,
    payload: {
      id: paper.id, // the same id on a retry, so a form can't be saved twice
      visit_date: paperEl("paper-date").value,
      room_id: paperEl("paper-room").value,
      ...paper.ratings,
      nps: paper.nps,
      referral_source: paper.referral,
      mentions: [...paper.mentions],
      comment: paperEl("paper-comment").value.trim() || null,
      guest_name: paperEl("paper-name").value.trim() || null,
      guest_contact: paperEl("paper-contact").value.trim() || null,
      force,
    },
  });

  btn.disabled = editBtn.disabled = false;
  setPaperSaveMode(force);

  if (error) {
    const offline = /failed to fetch|networkerror|load failed/i.test(error.message || "");
    setDeskMsg(
      "paper-review-msg",
      offline ? "Couldn't save. Check your connection and try again." : error.message || "Couldn't save. Try again.",
      "error"
    );
    return;
  }
  if (data === "duplicate") {
    setPaperSaveMode(true);
    setDeskMsg(
      "paper-review-msg",
      "A paper form with the same date, room, ratings and comment is already saved. Is this a different guest?",
      "error"
    );
    return;
  }
  if (data !== "saved" && data !== "already_saved") {
    setDeskMsg("paper-review-msg", "Couldn't confirm the save. Try again.", "error");
    return;
  }

  const day = paperNiceDate(paperEl("paper-date").value);
  resetPaperForm(true);
  setDeskMsg(
    "paper-saved",
    data === "saved"
      ? `Saved ✓ under ${day}. Ready for the next form.`
      : "Your earlier attempt had already saved this form. Any changes made after it were not saved.",
    data === "saved" ? "ok" : "error"
  );
  showView("view-paper");
  window.scrollTo(0, 0);
}

// ---------- Wiring ----------

document.addEventListener("DOMContentLoaded", () => {
  ensurePaperViews();

  paperEl("paper-open-btn").addEventListener("click", openPaperForm);
  paperEl("paper-back-btn").addEventListener("click", closePaperForm);
  paperEl("paper-review-btn").addEventListener("click", openPaperReview);
  paperEl("paper-edit-btn").addEventListener("click", () => showView("view-paper"));
  paperEl("paper-save-btn").addEventListener("click", submitPaper);

  paperEl("paper-ratings").addEventListener("click", (e) => {
    const star = e.target.closest(".star");
    if (!star) return;
    const key = star.parentElement.dataset.key;
    const value = Number(star.dataset.value);
    paper.ratings[key] = paper.ratings[key] === value ? null : value;
    paintPaperChoices();
  });
  paperEl("paper-nps").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const value = Number(chip.dataset.value);
    paper.nps = paper.nps === value ? null : value;
    paintPaperChoices();
  });
  paperEl("paper-referral").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    paper.referral = paper.referral === chip.dataset.value ? null : chip.dataset.value;
    paintPaperChoices();
  });
  paperEl("paper-mentions").addEventListener("change", (e) => {
    if (e.target.checked) paper.mentions.add(e.target.value);
    else paper.mentions.delete(e.target.value);
  });
});
