// ==========================================================
// Paradise Voices — app.js
// Step 4: full guest feedback wizard (ratings, NPS/discovery,
// mentions, comments) + submission to Supabase.
// ==========================================================

const RATING_CATEGORIES = [
  { key: "front_office_rating", label: "Front Office / Check-in & Check-out", required: true },
  { key: "housekeeping_rating", label: "Housekeeping / Room Cleanliness", required: true },
  { key: "room_comfort_rating", label: "Room Comfort", hint: "Bed, temperature, noise, condition", required: true },
  { key: "facilities_rating", label: "Facilities & Amenities", required: false },
  { key: "value_rating", label: "Value for Money", required: false },
  { key: "overall_rating", label: "Overall Stay Experience", required: false },
];

const BRANCH_NAMES = {
  HPC: "Hunters Paradise Cottages",
  HPT: "Hunters Paradise Tuuti",
};

// EDIT ME: paste your real Google review links here (Google Maps -> Share ->
// "Ask for reviews" -> copy link). Leave a branch blank/empty to disable the
// prompt for that branch.
const GOOGLE_REVIEW_LINKS = {
  HPC: "https://g.page/r/CRZGx1PtGtqoEBM/review",
  HPT: "https://g.page/r/CVPEsVcvizLmEBM/review",
};

const state = {
  pinDigits: "",
  role: null,
  branchId: null,
  branchCode: null,
  roomId: null,
  roomLabel: null,
  ratings: {},
  npsValue: 5,
  npsAnswered: false,
  referralSource: null,
  selectedMentions: new Set(),
};

function showView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// ---------- PIN screen ----------

function renderPinDots() {
  const dots = document.querySelectorAll("#pin-dots .dot");
  dots.forEach((d, i) => d.classList.toggle("filled", i < state.pinDigits.length));
}

function resetPin() {
  state.pinDigits = "";
  renderPinDots();
  const errEl = document.getElementById("pin-error");
  errEl.style.display = "none";
  errEl.textContent = "";
}

function showPinError(message) {
  const errEl = document.getElementById("pin-error");
  errEl.textContent = message;
  errEl.style.display = "block";
  state.pinDigits = "";
  renderPinDots();
}

async function handlePinComplete() {
  const { data, error } = await db.rpc("verify_pin", { input_pin: state.pinDigits });

  if (error) {
    showPinError("Something went wrong. Check your connection.");
    return;
  }
  if (!data || data.length === 0) {
    showPinError("Incorrect PIN. Try again.");
    return;
  }

  const match = data[0];
  state.role = match.role_key;
  state.branchId = match.branch_id;
  state.branchCode = match.branch_code;

  if (state.role === "management") {
    try {
      sessionStorage.setItem("pv_mgmt_pin", state.pinDigits);
    } catch (e) {
      // sessionStorage unavailable — dashboard will just prompt for the PIN instead
    }
    window.location.href = "dashboard.html";
    return;
  }

  await loadRoomsForBranch(state.branchId, state.branchCode);
  showView("view-room");
}

function naturalRoomSort(a, b) {
  const numA = parseInt((a.room_number.match(/\d+/) || ["0"])[0], 10);
  const numB = parseInt((b.room_number.match(/\d+/) || ["0"])[0], 10);
  return numA - numB;
}

async function loadRoomsForBranch(branchId, branchCode) {
  document.getElementById("room-branch-name").textContent = BRANCH_NAMES[branchCode] || branchCode;

  const [{ data: categories, error: catError }, { data: rooms, error: roomError }] = await Promise.all([
    db.from("room_categories").select("id, name").eq("branch_id", branchId).order("name"),
    db.from("rooms").select("id, room_number, category_id").eq("branch_id", branchId).eq("active", true),
  ]);

  const select = document.getElementById("room-select");
  select.innerHTML = '<option value="" disabled selected>Choose a room…</option>';

  if (catError || roomError || !categories || !rooms) return;

  categories.forEach((cat) => {
    const roomsInCat = rooms.filter((r) => r.category_id === cat.id).sort(naturalRoomSort);
    if (roomsInCat.length === 0) return;

    const group = document.createElement("optgroup");
    group.label = cat.name;
    roomsInCat.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.room_number;
      group.appendChild(opt);
    });
    select.appendChild(group);
  });

  document.getElementById("room-continue-btn").disabled = true;
  state.roomId = null;
  state.roomLabel = null;
}

function fullReset() {
  state.role = null;
  state.branchId = null;
  state.branchCode = null;
  state.roomId = null;
  state.roomLabel = null;
  state.ratings = {};
  state.npsValue = 5;
  state.npsAnswered = false;
  state.referralSource = null;
  state.selectedMentions = new Set();
  resetPin();
  showView("view-pin");
}

// ---------- Ratings (guest step 1/4) ----------

function renderRatings() {
  const container = document.getElementById("ratings-container");
  container.innerHTML = "";
  state.ratings = {};

  RATING_CATEGORIES.forEach((cat) => {
    state.ratings[cat.key] = null;

    const block = document.createElement("div");
    block.className = "rating-block";

    const label = document.createElement("label");
    label.innerHTML = cat.label + (cat.required ? ' <span class="required-mark">*</span>' : "");
    block.appendChild(label);

    if (cat.hint) {
      const hint = document.createElement("p");
      hint.className = "rating-hint";
      hint.textContent = cat.hint;
      block.appendChild(hint);
    }

    const stars = document.createElement("div");
    stars.className = "stars";
    for (let i = 1; i <= 5; i++) {
      const star = document.createElement("button");
      star.type = "button";
      star.className = "star";
      star.textContent = "★";
      star.dataset.value = i;
      star.addEventListener("click", () => {
        state.ratings[cat.key] = i;
        [...stars.children].forEach((s, idx) => s.classList.toggle("filled", idx < i));
        validateRatingsStep();
      });
      stars.appendChild(star);
    }
    block.appendChild(stars);
    container.appendChild(block);
  });

  validateRatingsStep();
}

function validateRatingsStep() {
  const allRequiredSet = RATING_CATEGORIES.filter((c) => c.required).every((c) => state.ratings[c.key] !== null);
  document.getElementById("ratings-next-btn").disabled = !allRequiredSet;
}

// ---------- Recommend & Discovery (guest step 2/4) ----------

function setupRecommendView() {
  const slider = document.getElementById("nps-slider");
  const valueEl = document.getElementById("nps-value");

  slider.addEventListener("input", () => {
    state.npsValue = parseInt(slider.value, 10);
    state.npsAnswered = true;
    valueEl.textContent = state.npsValue;
  });

  document.querySelectorAll("#referral-chips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#referral-chips .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.referralSource = chip.dataset.value;
      document.getElementById("recommend-next-btn").disabled = false;
    });
  });
}

function resetRecommendView() {
  state.npsValue = 5;
  state.npsAnswered = false;
  state.referralSource = null;
  document.getElementById("nps-slider").value = 5;
  document.getElementById("nps-value").textContent = "–";
  document.querySelectorAll("#referral-chips .chip").forEach((c) => c.classList.remove("active"));
  document.getElementById("recommend-next-btn").disabled = true;
}

// ---------- Who Made Your Stay Special (guest step 3/4) ----------

async function loadMentions(branchId) {
  const container = document.getElementById("mentions-container");
  container.innerHTML = "<p>Loading…</p>";
  state.selectedMentions = new Set();

  const { data: members, error } = await db
    .from("team_members")
    .select("id, name, department")
    .eq("branch_id", branchId)
    .eq("active", true)
    .order("department");

  container.innerHTML = "";

  if (error || !members || members.length === 0) {
    container.innerHTML = "<p>No team members listed yet.</p>";
    return;
  }

  const byDept = {};
  members.forEach((m) => {
    if (!byDept[m.department]) byDept[m.department] = [];
    byDept[m.department].push(m);
  });

  Object.keys(byDept).forEach((dept) => {
    const group = document.createElement("div");
    group.className = "dept-group";

    const title = document.createElement("div");
    title.className = "dept-title";
    title.textContent = dept;
    group.appendChild(title);

    byDept[dept].forEach((member) => {
      const item = document.createElement("label");
      item.className = "checkbox-item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = member.id;
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          state.selectedMentions.add(member.id);
        } else {
          state.selectedMentions.delete(member.id);
        }
      });

      const span = document.createElement("span");
      span.textContent = member.name;

      item.appendChild(checkbox);
      item.appendChild(span);
      group.appendChild(item);
    });

    container.appendChild(group);
  });
}

// ---------- Comments & Submit (guest step 4/4) ----------

function generateUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function guestGaveOnlyGoodRatings() {
  const vals = Object.values(state.ratings).filter((v) => v !== null && v !== undefined);
  if (vals.length === 0) return false;
  return vals.every((v) => v >= 4);
}

async function submitFeedback() {
  const submitBtn = document.getElementById("submit-btn");
  const errorEl = document.getElementById("submit-error");
  errorEl.style.display = "none";
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting…";

  const feedbackId = generateUUID();

  const payload = {
    id: feedbackId,
    branch_id: state.branchId,
    room_id: state.roomId,
    front_office_rating: state.ratings.front_office_rating,
    housekeeping_rating: state.ratings.housekeeping_rating,
    room_comfort_rating: state.ratings.room_comfort_rating,
    facilities_rating: state.ratings.facilities_rating,
    value_rating: state.ratings.value_rating,
    overall_rating: state.ratings.overall_rating,
    nps: state.npsAnswered ? state.npsValue : null,
    referral_source: state.referralSource,
    comment: document.getElementById("comment-input").value.trim() || null,
    guest_name: document.getElementById("name-input").value.trim() || null,
    guest_contact: document.getElementById("contact-input").value.trim() || null,
  };

  const { error } = await db.from("feedback").insert(payload);

  if (error) {
    errorEl.textContent = "Couldn't submit — check your connection and try again.";
    errorEl.style.display = "block";
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Feedback";
    return;
  }

  if (state.selectedMentions.size > 0) {
    const rows = Array.from(state.selectedMentions).map((teamMemberId) => ({
      feedback_id: feedbackId,
      team_member_id: teamMemberId,
    }));
    await db.from("feedback_mentions").insert(rows);
  }

  submitBtn.disabled = false;
  submitBtn.textContent = "Submit Feedback";

  const reviewLink = GOOGLE_REVIEW_LINKS[state.branchCode];
  if (reviewLink && guestGaveOnlyGoodRatings()) {
    document.getElementById("google-review-btn").href = reviewLink;
    showView("view-review-prompt");
  } else {
    showView("view-thankyou");
  }
}

function resetCommentsView() {
  document.getElementById("comment-input").value = "";
  document.getElementById("name-input").value = "";
  document.getElementById("contact-input").value = "";
  document.getElementById("submit-error").style.display = "none";
}

// ---------- Wiring ----------

function setupPinPad() {
  document.querySelectorAll(".pin-key[data-key]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.pinDigits.length >= 4) return;
      document.getElementById("pin-error").style.display = "none";
      state.pinDigits += btn.dataset.key;
      renderPinDots();
      if (state.pinDigits.length === 4) handlePinComplete();
    });
  });

  document.getElementById("pin-backspace").addEventListener("click", () => {
    state.pinDigits = state.pinDigits.slice(0, -1);
    renderPinDots();
  });
}

function setupRoomView() {
  const select = document.getElementById("room-select");
  select.addEventListener("change", (e) => {
    state.roomId = e.target.value;
    state.roomLabel = e.target.options[e.target.selectedIndex].textContent;
    document.getElementById("room-continue-btn").disabled = !state.roomId;
  });

  document.getElementById("room-continue-btn").addEventListener("click", () => {
    document.getElementById("welcome-branch").textContent = BRANCH_NAMES[state.branchCode] || state.branchCode;
    document.getElementById("welcome-room").textContent = state.roomLabel;
    showView("view-welcome");
  });

  document.getElementById("room-back-btn").addEventListener("click", fullReset);
}

function setupWelcomeView() {
  document.getElementById("welcome-start-btn").addEventListener("click", () => {
    renderRatings();
    showView("view-ratings");
  });
  document.getElementById("welcome-back-btn").addEventListener("click", fullReset);
}

function setupWizardNav() {
  document.getElementById("ratings-next-btn").addEventListener("click", () => {
    resetRecommendView();
    showView("view-recommend");
  });

  document.getElementById("recommend-back-btn").addEventListener("click", () => showView("view-ratings"));
  document.getElementById("recommend-next-btn").addEventListener("click", async () => {
    await loadMentions(state.branchId);
    showView("view-mentions");
  });

  document.getElementById("mentions-back-btn").addEventListener("click", () => showView("view-recommend"));
  document.getElementById("mentions-next-btn").addEventListener("click", () => {
    resetCommentsView();
    showView("view-comments");
  });

  document.getElementById("comments-back-btn").addEventListener("click", () => showView("view-mentions"));
  document.getElementById("submit-btn").addEventListener("click", submitFeedback);

  document.getElementById("google-review-btn").addEventListener("click", () => {
    setTimeout(() => showView("view-thankyou"), 300);
  });
  document.getElementById("review-skip-btn").addEventListener("click", () => showView("view-thankyou"));

  document.getElementById("thankyou-done-btn").addEventListener("click", fullReset);
}

document.addEventListener("DOMContentLoaded", () => {
  setupPinPad();
  setupRoomView();
  setupWelcomeView();
  setupRecommendView();
  setupWizardNav();
  showView("view-pin");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

// ---------- Install prompt ----------

let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById("install-btn");
  if (btn) btn.style.display = "block";
});

document.addEventListener("DOMContentLoaded", () => {
  const installBtn = document.getElementById("install-btn");
  if (!installBtn) return;

  installBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installBtn.style.display = "none";
  });
});

window.addEventListener("appinstalled", () => {
  const btn = document.getElementById("install-btn");
  if (btn) btn.style.display = "none";
});
