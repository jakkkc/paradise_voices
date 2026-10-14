// ==========================================================
// Paradise Voices — guest-mode.js
// QR guest mode. Links look like  ?b=HPC&room=K5  (room QR)
// or  ?b=HPC  (reception QR). Guests use their own phone:
// no PIN and no receptionist screens. Loaded after app.js.
// ==========================================================

const guestSelfParams = new URLSearchParams(window.location.search);
const guestSelfBranch = (guestSelfParams.get("b") || "").trim().toUpperCase();
const guestSelfRoom = (guestSelfParams.get("room") || "").trim();
const guestSelfMode = guestSelfBranch !== "";

function ensureGuestView(id, html) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    el.className = "view card";
    el.innerHTML = html;
    document.querySelector(".app-main").appendChild(el);
  }
  return el;
}

// Used by app.js at the end of the flow. Tablet users get the Done button;
// QR guests are on their own phone, so they just see a closing note.
function showThankYou() {
  const doneBtn = document.getElementById("thankyou-done-btn");
  let note = document.getElementById("thankyou-qr-note");
  if (!note) {
    note = document.createElement("p");
    note.id = "thankyou-qr-note";
    note.className = "subtitle";
    note.textContent = "You can close this page now.";
    doneBtn.parentNode.insertBefore(note, doneBtn);
  }
  doneBtn.style.display = guestSelfMode ? "none" : "";
  note.style.display = guestSelfMode ? "block" : "none";
  showView("view-thankyou");
}

function showQrError(message) {
  const view = ensureGuestView(
    "view-qr-error",
    '<h2>Oops</h2><p class="subtitle" id="qr-error-text"></p>'
  );
  view.querySelector("#qr-error-text").textContent = message;
  showView("view-qr-error");
}

async function initGuestSelfMode() {
  state.source = guestSelfRoom ? "room_qr" : "reception_qr";

  const { data: branch, error: branchError } = await db
    .from("branches")
    .select("id, code")
    .eq("code", guestSelfBranch)
    .maybeSingle();

  if (branchError || !branch) {
    showQrError("This link doesn't look right. Please ask our reception for help.");
    return;
  }

  state.branchId = branch.id;
  state.branchCode = branch.code;

  // Guests must never reach staff screens, so hide every "go back to PIN" link.
  document.getElementById("welcome-back-btn").style.display = "none";
  document.getElementById("room-back-btn").style.display = "none";

  if (guestSelfRoom) {
    // Room QR: the room is already known, so go straight to the welcome screen.
    const { data: room, error: roomError } = await db
      .from("rooms")
      .select("id, room_number")
      .eq("branch_id", branch.id)
      .eq("room_number", guestSelfRoom)
      .maybeSingle();

    if (roomError || !room) {
      showQrError("We couldn't find that room. Please ask our reception for help.");
      return;
    }

    state.roomId = room.id;
    state.roomLabel = room.room_number;
    document.getElementById("welcome-branch").textContent = BRANCH_NAMES[state.branchCode] || state.branchCode;
    document.getElementById("welcome-room").textContent = state.roomLabel;
    showView("view-welcome");
  } else {
    // Reception QR: the guest picks their own room.
    await loadRoomsForBranch(branch.id, branch.code);
    document.querySelector("#view-room .subtitle").textContent = "Which room did you stay in?";
    document.getElementById("room-continue-btn").textContent = "Continue";
    showView("view-room");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!guestSelfMode) return;
  document.body.classList.add("guest-self");
  ensureGuestView("view-loading", '<p class="subtitle" style="margin:0;">Loading…</p>');
  showView("view-loading");
  await initGuestSelfMode();
});
