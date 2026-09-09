// ==========================================================
// Paradise Voices — app.js
// Step 2 only does a connection test. The PIN screen, the
// room picker, and the guest wizard get built in the next
// steps and will replace this test block.
// ==========================================================

async function testConnection() {
  const statusEl = document.getElementById("status");

  const { data, error } = await db.from("branches").select("code, name");

  if (error) {
    statusEl.textContent = "Connection failed: " + error.message;
    statusEl.className = "status-line error";
    return;
  }

  if (!data || data.length === 0) {
    statusEl.textContent = "Connected, but no branches found — did you run schema.sql?";
    statusEl.className = "status-line error";
    return;
  }

  const names = data.map((b) => b.name).join(", ");
  statusEl.textContent = "Connected ✓ Branches found: " + names;
  statusEl.className = "status-line ok";
}

document.addEventListener("DOMContentLoaded", testConnection);

// Register the service worker (needs to be served over http/https,
// so this will silently fail if you just double-click index.html —
// that's expected until we deploy to Vercel).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // No-op: expected to fail when opened via file://
    });
  });
}
