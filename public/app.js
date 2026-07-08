const fmtMoney = (n) =>
  n === null || n === undefined || Number.isNaN(n)
    ? "—"
    : n.toLocaleString(undefined, { style: "currency", currency: "USD" });

const fmtPercent = (n) => (n === null || n === undefined ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);

const dialog = document.getElementById("stock-dialog");
const form = document.getElementById("stock-form");
const dialogTitle = document.getElementById("dialog-title");

let rows = [];

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

function thresholdCell(value, suffix = "") {
  if (value === null || value === undefined) return `<span class="threshold-unset">—</span>`;
  return `<span class="threshold-set">${value}${suffix}</span>`;
}

function renderSummary() {
  const withValue = rows.filter((r) => r.market_value !== null);
  const totalValue = withValue.reduce((sum, r) => sum + r.market_value, 0);
  const totalPrevValue = withValue.reduce(
    (sum, r) => sum + (r.quote ? r.quote.previousClose * r.shares : 0),
    0,
  );
  const dayChange = totalValue - totalPrevValue;
  const dayChangePct = totalPrevValue ? (dayChange / totalPrevValue) * 100 : null;

  const container = document.getElementById("summary-cards");
  container.innerHTML = `
    <div class="stat-card">
      <div class="label">Tracked stocks</div>
      <div class="value">${rows.length}</div>
    </div>
    <div class="stat-card">
      <div class="label">Portfolio value</div>
      <div class="value">${withValue.length ? fmtMoney(totalValue) : "—"}</div>
    </div>
    <div class="stat-card">
      <div class="label">Day change</div>
      <div class="value ${dayChange >= 0 ? "up" : "down"}">${
        withValue.length ? `${fmtMoney(dayChange)} (${fmtPercent(dayChangePct)})` : "—"
      }</div>
    </div>
  `;
}

function renderTable() {
  const body = document.getElementById("watchlist-body");
  if (rows.length === 0) {
    body.innerHTML = `<tr><td colspan="9" class="muted">No stocks tracked yet. Click "Add stock" to get started.</td></tr>`;
    return;
  }

  body.innerHTML = rows
    .map((r) => {
      const q = r.quote;
      const changeClass = q && q.changePercent >= 0 ? "up" : "down";
      return `
        <tr data-id="${r.id}">
          <td class="symbol-cell">${r.symbol}${r.label ? `<span class="name">${r.label}</span>` : ""}</td>
          <td>${q ? fmtMoney(q.price) : "—"}</td>
          <td class="${q ? changeClass : ""}">${q ? fmtPercent(q.changePercent) : "—"}</td>
          <td>${r.shares ?? "—"}</td>
          <td>${fmtMoney(r.market_value)}</td>
          <td>${thresholdCell(r.price_high, " " + (q?.currency ?? "USD"))}</td>
          <td>${thresholdCell(r.price_low, " " + (q?.currency ?? "USD"))}</td>
          <td>${thresholdCell(r.percent_change_threshold, "%")}</td>
          <td class="row-actions">
            <button class="btn btn-ghost edit-btn">Edit</button>
            <button class="btn btn-ghost btn-danger delete-btn">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");

  body.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      openDialog(rows.find((r) => r.id === id));
    });
  });

  body.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.target.closest("tr").dataset.id);
      const row = rows.find((r) => r.id === id);
      if (!confirm(`Remove ${row.symbol} from your watchlist?`)) return;
      await api(`/api/watchlist/${id}`, { method: "DELETE" });
      await loadWatchlist();
    });
  });
}

async function renderAlertLog() {
  const list = document.getElementById("alert-log");
  const entries = await api("/api/alerts?limit=20");
  if (entries.length === 0) {
    list.innerHTML = `<li class="muted">No alerts sent yet.</li>`;
    return;
  }
  list.innerHTML = entries
    .map(
      (e) => `
        <li>
          ${e.message}
          <span class="alert-time">${new Date(e.sent_at.replace(" ", "T") + "Z").toLocaleString()}</span>
        </li>
      `,
    )
    .join("");
}

async function renderRates() {
  const container = document.getElementById("rates-cards");
  try {
    const rates = await api("/api/rates");
    if (rates.length === 0) {
      container.innerHTML = `<span class="muted">No rate data available.</span>`;
      return;
    }
    container.innerHTML = rates
      .map((r) => {
        const change = r.previous !== null ? r.value - r.previous : null;
        const changeClass = change !== null && change < 0 ? "down" : "up";
        return `
          <div class="stat-card">
            <div class="label">${r.label}</div>
            <div class="value">${r.value.toFixed(2)}%</div>
            <div class="rate-meta">
              ${
                change !== null
                  ? `<span class="${changeClass}">${change >= 0 ? "+" : ""}${change.toFixed(2)}</span>`
                  : ""
              }
              <span class="muted">as of ${new Date(r.date + "T00:00:00").toLocaleDateString()}</span>
            </div>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    container.innerHTML = `<span class="muted">Rates unavailable: ${err.message}</span>`;
  }
}

async function loadWatchlist() {
  rows = await api("/api/quotes");
  renderSummary();
  renderTable();
  document.getElementById("last-updated").textContent = `Updated ${new Date().toLocaleTimeString()}`;
}

async function refreshAll() {
  await Promise.all([loadWatchlist(), renderAlertLog(), renderRates()]);
}

function openDialog(row) {
  form.reset();
  form.elements.id.value = row?.id ?? "";
  dialogTitle.textContent = row ? `Edit ${row.symbol}` : "Add stock";
  form.elements.symbol.disabled = Boolean(row);
  if (row) {
    form.elements.symbol.value = row.symbol;
    form.elements.label.value = row.label ?? "";
    form.elements.shares.value = row.shares ?? "";
    form.elements.price_high.value = row.price_high ?? "";
    form.elements.price_low.value = row.price_low ?? "";
    form.elements.percent_change_threshold.value = row.percent_change_threshold ?? "";
  }
  dialog.showModal();
}

document.getElementById("add-stock-btn").addEventListener("click", () => openDialog(null));
document.getElementById("cancel-btn").addEventListener("click", () => dialog.close());
document.getElementById("refresh-btn").addEventListener("click", () => refreshAll());

document.getElementById("test-email-btn").addEventListener("click", async (e) => {
  const btn = e.target;
  btn.disabled = true;
  btn.textContent = "Sending…";
  try {
    const result = await api("/api/alerts/test", { method: "POST" });
    btn.textContent = `Sent to ${result.to}`;
  } catch (err) {
    btn.textContent = "Send test email";
    alert(`Test email failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    setTimeout(() => (btn.textContent = "Send test email"), 5000);
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const id = data.id;
  delete data.id;
  ["shares", "price_high", "price_low", "percent_change_threshold"].forEach((key) => {
    if (data[key] === "") delete data[key];
  });

  try {
    if (id) {
      await api(`/api/watchlist/${id}`, { method: "PATCH", body: JSON.stringify(data) });
    } else {
      await api("/api/watchlist", { method: "POST", body: JSON.stringify(data) });
    }
    dialog.close();
    await loadWatchlist();
  } catch (err) {
    alert(err.message);
  }
});

refreshAll();
setInterval(refreshAll, 60_000);
