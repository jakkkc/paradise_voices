// ==========================================================
// Paradise Voices — dashboard-qr.js
// QR code sheet (one per room + one per reception) and the
// "How Feedback Was Collected" breakdown. Loaded after dashboard.js.
// ==========================================================

const SOURCE_LABELS = {
  tablet: "Reception tablet",
  room_qr: "Room QR code",
  reception_qr: "Reception QR code",
};

function renderSourceBreakdown(rows) {
  const container = document.getElementById("source-breakdown");
  container.innerHTML = "";

  if (rows.length === 0) {
    container.innerHTML = '<p class="empty-note">No responses in this period.</p>';
    return;
  }

  const counts = { tablet: 0, room_qr: 0, reception_qr: 0 };
  rows.forEach((r) => {
    const key = r.source in counts ? r.source : "tablet"; // older responses have no source: they were tablet
    counts[key]++;
  });

  Object.keys(counts).forEach((key) => {
    const pct = Math.round((counts[key] / rows.length) * 100);
    const row = document.createElement("div");
    row.className = "referral-bar-row";
    row.innerHTML = `
      <div class="referral-bar-name">${SOURCE_LABELS[key]} (${counts[key]})</div>
      <div class="referral-bar-track"><div class="referral-bar-fill" style="width:${pct}%"></div></div>
      <div class="referral-bar-pct">${pct}%</div>
    `;
    container.appendChild(row);
  });
}

function ensureQrView() {
  if (document.getElementById("view-qr")) return;
  const view = document.createElement("div");
  view.id = "view-qr";
  view.className = "view dashboard-wrap";
  view.innerHTML = `
    <div class="dashboard-header">
      <h2 style="margin:0;">QR Codes</h2>
      <button class="btn btn-primary" id="qr-print-btn" style="width:auto; padding:10px 18px;">Print Sheet</button>
    </div>
    <p class="empty-note" style="margin-bottom:16px;">
      Each room code opens the form with that room already selected. Each reception code lets guests pick their own room (for anyone who forgot to rate in their room).
    </p>
    <label for="qr-base-url">Website address used in the codes</label>
    <input type="text" id="qr-base-url" placeholder="https://your-app.vercel.app/" />
    <div id="qr-warning" class="status-line error" style="display:none;"></div>
    <div id="qr-sheet"></div>
    <button class="btn-link" id="qr-back-btn">Back to Analytics</button>
  `;
  document.querySelector(".app-main").appendChild(view);
}

function defaultQrBaseUrl() {
  if (window.location.protocol === "file:") return "";
  return window.location.origin + window.location.pathname.replace(/[^/]*$/, "");
}

function currentQrBaseUrl() {
  let base = document.getElementById("qr-base-url").value.trim();
  if (!base) return "";
  if (!base.endsWith("/")) base += "/";
  return base;
}

function naturalRoomSort(a, b) {
  const numA = parseInt((a.room_number.match(/\d+/) || ["0"])[0], 10);
  const numB = parseInt((b.room_number.match(/\d+/) || ["0"])[0], 10);
  return numA - numB;
}

function makeQrCard({ title, subtitle, cta, url }) {
  const card = document.createElement("div");
  card.className = "qr-card";
  card.innerHTML = `
    <div class="qr-card-brand">Hunters Paradise</div>
    <div class="qr-card-title">${title}</div>
    <div class="qr-card-sub">${subtitle}</div>
    <div class="qr-code-box"></div>
    <div class="qr-card-cta">${cta}</div>
  `;
  // Drawn large so it stays sharp when printed; CSS sets the displayed size.
  new QRCode(card.querySelector(".qr-code-box"), {
    text: url,
    width: 320,
    height: 320,
    correctLevel: QRCode.CorrectLevel.M,
  });
  return card;
}

// A4 page with four A6 cells (2 x 2). Dashed lines between the cells are the cutting lines.
function appendQrPages(sheet, cards) {
  for (let i = 0; i < cards.length; i += 4) {
    const page = document.createElement("div");
    page.className = "qr-page";
    for (let slot = 0; slot < 4; slot++) {
      const cell = document.createElement("div");
      cell.className = "qr-cell";
      if (cards[i + slot]) cell.appendChild(cards[i + slot]);
      page.appendChild(cell);
    }
    sheet.appendChild(page);
  }
}

function buildQrSheet() {
  const sheet = document.getElementById("qr-sheet");
  const warning = document.getElementById("qr-warning");
  sheet.innerHTML = "";

  if (typeof QRCode === "undefined") {
    warning.textContent = "The QR code library didn't load. Check your internet connection and reload the page.";
    warning.style.display = "block";
    return;
  }

  const base = currentQrBaseUrl();
  if (!base) {
    warning.textContent =
      "Enter your live website address above (for example https://your-app.vercel.app) — codes can't be made from a local file.";
    warning.style.display = "block";
    return;
  }
  warning.style.display = "none";

  const addSection = (text, cards) => {
    const heading = document.createElement("h3");
    heading.className = "qr-section-title";
    heading.textContent = text;
    sheet.appendChild(heading);
    appendQrPages(sheet, cards);
  };

  // Reception codes: guests pick their own room
  addSection(
    "Reception",
    mgmtState.branches.map((b) =>
      makeQrCard({
        title: "Reception",
        subtitle: BRANCH_NAMES[b.code] || b.name,
        cta: "Forgot to rate your stay? Scan to share your feedback",
        url: `${base}?b=${encodeURIComponent(b.code)}`,
      })
    )
  );

  // Room codes: room is pre-filled. Each branch starts on a fresh page.
  const { roomCatMap, catNameMap } = roomCategoryMaps();
  mgmtState.branches.forEach((b) => {
    const rooms = mgmtState.rooms
      .filter((r) => r.branch_id === b.id && r.active !== false)
      .sort((a, c) => {
        const catA = catNameMap[roomCatMap[a.id]] || "";
        const catC = catNameMap[roomCatMap[c.id]] || "";
        return catA.localeCompare(catC) || naturalRoomSort(a, c);
      });
    if (rooms.length === 0) return;

    addSection(
      `${BRANCH_NAMES[b.code] || b.name} — Rooms (${rooms.length})`,
      rooms.map((r) =>
        makeQrCard({
          title: `Room ${r.room_number}`,
          subtitle: catNameMap[roomCatMap[r.id]] || "",
          cta: "Scan to share your feedback",
          url: `${base}?b=${encodeURIComponent(b.code)}&room=${encodeURIComponent(r.room_number)}`,
        })
      )
    );
  });
}

function openQrView() {
  const input = document.getElementById("qr-base-url");
  if (!input.value.trim()) input.value = defaultQrBaseUrl();
  showView("view-qr");
  buildQrSheet();
}

function printQrSheet() {
  const sheet = document.getElementById("qr-sheet");
  if (!sheet.children.length) return;
  const target = document.getElementById("print-report");
  target.className = "qr-print";
  target.innerHTML = sheet.innerHTML;
  // Full A4, no margin: the cells are exactly A6 and the dashed lines are the cuts.
  printWithPageRule("size: A4 portrait; margin: 0;");
}

document.addEventListener("DOMContentLoaded", () => {
  ensureQrView();
  document.getElementById("qr-codes-btn").addEventListener("click", openQrView);
  document.getElementById("qr-back-btn").addEventListener("click", () => showView("view-dashboard"));
  document.getElementById("qr-print-btn").addEventListener("click", printQrSheet);
  document.getElementById("qr-base-url").addEventListener("change", buildQrSheet);
});
