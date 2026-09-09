// ==========================================================
// Paradise Voices — app.js
// Step 3: PIN entry -> role/branch lookup -> room selection.
// Step 4 will replace the "ready" checkpoint view with the
// real guest feedback wizard.
// ==========================================================

const state = {
  pinDigits: "",
  role: null,
  branchId: null,
  branchCode: null,
  roomId: null,
  roomLabel: null,
};

const BRANCH_NAMES = {
  HPC: "Hunters Paradise Cottages",
  HPT: "Hunters Paradise Tuuti",
};

function showView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

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

  if (catError || roomError || !categories || !rooms) {
    return;
  }

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
  resetPin();
  showView("view-pin");
}

function setupPinPad() {
  document.querySelectorAll(".pin-key[data-key]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.pinDigits.length >= 4) return;
      document.getElementById("pin-error").style.display = "none";
      state.pinDigits += btn.dataset.key;
      renderPinDots();
      if (state.pinDigits.length === 4) {
        handlePinComplete();
      }
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
    document.getElementById("ready-branch").textContent = BRANCH_NAMES[state.branchCode] || state.branchCode;
    document.getElementById("ready-room").textContent = state.roomLabel;
    showView("view-ready");
  });

  document.getElementById("room-back-btn").addEventListener("click", fullReset);
}

function setupReadyView() {
  document.getElementById("ready-back-btn").addEventListener("click", fullReset);
}

document.addEventListener("DOMContentLoaded", () => {
  setupPinPad();
  setupRoomView();
  setupReadyView();
  showView("view-pin");
});

// Register the service worker (needs to be served over http/https,
// so this will silently fail if you just double-click index.html —
// that's expected until we deploy to Vercel).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      // No-op: expected to fail when opened via file://
    });
  });
}
