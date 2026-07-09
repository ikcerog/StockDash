const fmtMoney = (n) =>
  n === null || n === undefined || Number.isNaN(n)
    ? "—"
    : n.toLocaleString(undefined, { style: "currency", currency: "USD" });

const fmtPercent = (n) => (n === null || n === undefined ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);

const APP_VERSION = "1.4.0";
const CHANGELOG = [
  {
    version: "1.4.0",
    date: "2026-07-09",
    notes: [
      "Show/hide watchlist columns, remembered per browser.",
      "Manual light/dark theme toggle.",
      "Optional price chart pane alongside the watchlist.",
      "Version chip with these patch notes.",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-07-08",
    notes: [
      "Sign in with Cloudflare Access; each user gets their own watchlist and alerts.",
      "New users are seeded with a baseline set of tracked stocks.",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-07-08",
    notes: ["Resend email alerts, plus a Send test email button."],
  },
  {
    version: "1.1.0",
    date: "2026-07-08",
    notes: ["Added a Rates panel: 10Y Treasury and 15Y/30Y mortgage rates from FRED."],
  },
  {
    version: "1.0.0",
    date: "2026-07-08",
    notes: ["Initial watchlist tracker with price alerts."],
  },
];

const LS_KEYS = {
  theme: "stockdash:theme",
  columns: "stockdash:columns",
  chartVisible: "stockdash:chartVisible",
  chartSymbol: "stockdash:chartSymbol",
  chartRange: "stockdash:chartRange",
};

function lsGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage unavailable (private mode, quota) — prefs just won't persist
  }
}

function readJSON(key, fallback) {
  const raw = lsGet(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

const COLUMNS = [
  { key: "price", label: "Price" },
  { key: "change", label: "Day change" },
  { key: "shares", label: "Shares" },
  { key: "value", label: "Value" },
  { key: "high", label: "High alert" },
  { key: "low", label: "Low alert" },
  { key: "pct", label: "% change alert" },
];

const columnPrefs = {
  ...Object.fromEntries(COLUMNS.map((c) => [c.key, true])),
  ...readJSON(LS_KEYS.columns, {}),
};

let chartVisible = lsGet(LS_KEYS.chartVisible) === "true";
let chartSymbol = lsGet(LS_KEYS.chartSymbol) || null;
let chartRange = lsGet(LS_KEYS.chartRange) || "6mo";

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
          <td data-col="price">${q ? fmtMoney(q.price) : "—"}</td>
          <td data-col="change" class="${q ? changeClass : ""}">${q ? fmtPercent(q.changePercent) : "—"}</td>
          <td data-col="shares">${r.shares ?? "—"}</td>
          <td data-col="value">${fmtMoney(r.market_value)}</td>
          <td data-col="high">${thresholdCell(r.price_high, " " + (q?.currency ?? "USD"))}</td>
          <td data-col="low">${thresholdCell(r.price_low, " " + (q?.currency ?? "USD"))}</td>
          <td data-col="pct">${thresholdCell(r.percent_change_threshold, "%")}</td>
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

  body.querySelectorAll(".symbol-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      if (!chartVisible) return;
      const id = Number(cell.closest("tr").dataset.id);
      const row = rows.find((r) => r.id === id);
      if (!row) return;
      chartSymbol = row.symbol;
      lsSet(LS_KEYS.chartSymbol, chartSymbol);
      const select = document.getElementById("chart-symbol-select");
      if (select) select.value = chartSymbol;
      loadChart();
    });
  });

  applyColumnVisibility();
}

function applyColumnVisibility() {
  COLUMNS.forEach(({ key }) => {
    const visible = columnPrefs[key] !== false;
    document.querySelectorAll(`#watchlist-table [data-col="${key}"]`).forEach((el) => {
      el.style.display = visible ? "" : "none";
    });
  });
}

function renderColumnsMenu() {
  const menu = document.getElementById("columns-menu");
  menu.innerHTML = COLUMNS.map(
    ({ key, label }) => `
      <label>
        <input type="checkbox" data-col-key="${key}" ${columnPrefs[key] !== false ? "checked" : ""} />
        ${label}
      </label>
    `,
  ).join("");
  menu.querySelectorAll("input[type=checkbox]").forEach((input) => {
    input.addEventListener("change", () => {
      columnPrefs[input.dataset.colKey] = input.checked;
      lsSet(LS_KEYS.columns, JSON.stringify(columnPrefs));
      applyColumnVisibility();
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
  populateChartSymbolSelect();
  if (chartVisible) loadChart();
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

// --- Theme ---

function systemPrefersDark() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function effectiveTheme() {
  const stored = lsGet(LS_KEYS.theme);
  if (stored === "light" || stored === "dark") return stored;
  return systemPrefersDark() ? "dark" : "light";
}

function applyTheme() {
  const stored = lsGet(LS_KEYS.theme);
  if (stored === "light" || stored === "dark") {
    document.documentElement.setAttribute("data-theme", stored);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  const dark = effectiveTheme() === "dark";
  document.getElementById("theme-icon-sun").hidden = !dark;
  document.getElementById("theme-icon-moon").hidden = dark;
}

document.getElementById("theme-toggle").addEventListener("click", () => {
  const next = effectiveTheme() === "dark" ? "light" : "dark";
  lsSet(LS_KEYS.theme, next);
  applyTheme();
});

applyTheme();

// --- Columns dropdown ---

renderColumnsMenu();
document.getElementById("columns-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  const menu = document.getElementById("columns-menu");
  menu.hidden = !menu.hidden;
});
document.addEventListener("click", (e) => {
  const dropdown = document.getElementById("columns-dropdown");
  const menu = document.getElementById("columns-menu");
  if (!menu.hidden && !dropdown.contains(e.target)) menu.hidden = true;
});

// --- Version chip / patch notes ---

document.getElementById("version-chip").textContent = `v${APP_VERSION}`;

function renderPatchNotes() {
  const body = document.getElementById("patchnotes-body");
  body.innerHTML = CHANGELOG.map(
    (entry) => `
      <div class="entry">
        <h3>v${entry.version}<span class="entry-date">${entry.date}</span></h3>
        <ul>${entry.notes.map((n) => `<li>${n}</li>`).join("")}</ul>
      </div>
    `,
  ).join("");
}

const patchnotesDialog = document.getElementById("patchnotes-dialog");
document.getElementById("version-chip").addEventListener("click", () => {
  renderPatchNotes();
  patchnotesDialog.showModal();
});
document.getElementById("patchnotes-close-btn").addEventListener("click", () => patchnotesDialog.close());

// --- Chart pane ---

function applyChartVisibility() {
  const workspace = document.getElementById("workspace");
  const panel = document.getElementById("chart-panel");
  workspace.classList.toggle("chart-visible", chartVisible);
  panel.hidden = !chartVisible;
  document.body.classList.toggle("chart-open", chartVisible);
  document.getElementById("watchlist-table").classList.toggle("chart-mode", chartVisible);
  document.getElementById("chart-toggle-btn").textContent = chartVisible ? "Hide chart" : "Show chart";
}

document.getElementById("chart-toggle-btn").addEventListener("click", () => {
  chartVisible = !chartVisible;
  lsSet(LS_KEYS.chartVisible, String(chartVisible));
  applyChartVisibility();
  if (chartVisible) {
    populateChartSymbolSelect();
    loadChart();
  }
});

function populateChartSymbolSelect() {
  const select = document.getElementById("chart-symbol-select");
  if (rows.length === 0) {
    select.innerHTML = "";
    return;
  }
  select.innerHTML = rows.map((r) => `<option value="${r.symbol}">${r.symbol}</option>`).join("");
  const stillTracked = rows.some((r) => r.symbol === chartSymbol);
  chartSymbol = stillTracked ? chartSymbol : rows[0].symbol;
  select.value = chartSymbol;
}

document.getElementById("chart-symbol-select").addEventListener("change", (e) => {
  chartSymbol = e.target.value;
  lsSet(LS_KEYS.chartSymbol, chartSymbol);
  loadChart();
});

document.getElementById("chart-range-select").value = chartRange;
document.getElementById("chart-range-select").addEventListener("change", (e) => {
  chartRange = e.target.value;
  lsSet(LS_KEYS.chartRange, chartRange);
  loadChart();
});

async function loadChart() {
  if (!chartVisible || !chartSymbol) return;
  const svg = document.getElementById("chart-svg");
  const empty = document.getElementById("chart-empty");
  const footer = document.getElementById("chart-footer");
  try {
    const data = await api(`/api/history/${encodeURIComponent(chartSymbol)}?range=${chartRange}`);
    if (!data.points || data.points.length < 2) {
      svg.innerHTML = "";
      hideTooltip();
      empty.hidden = false;
      empty.textContent = "No chart data available for this symbol.";
      footer.textContent = "";
      return;
    }
    empty.hidden = true;
    drawChart(svg, data.points);
    const first = data.points[0];
    const last = data.points[data.points.length - 1];
    const change = last.close - first.close;
    const changePct = first.close ? (change / first.close) * 100 : null;
    footer.innerHTML = `
      <span>${first.date} — ${last.date}</span>
      <span class="${change >= 0 ? "up" : "down"}">${fmtMoney(last.close)} (${fmtPercent(changePct)})</span>
    `;
  } catch (err) {
    svg.innerHTML = "";
    hideTooltip();
    empty.hidden = false;
    empty.textContent = `Chart unavailable: ${err.message}`;
    footer.textContent = "";
  }
}

function drawChart(svg, points) {
  const width = 600;
  const height = 260;
  const padding = { top: 16, right: 16, bottom: 24, left: 54 };
  const values = points.map((p) => p.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const x = (i) => padding.left + (i / (points.length - 1)) * (width - padding.left - padding.right);
  const y = (v) => padding.top + (1 - (v - min) / range) * (height - padding.top - padding.bottom);

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.close).toFixed(2)}`)
    .join(" ");
  const baseline = (height - padding.bottom).toFixed(2);
  const areaPath = `${linePath} L${x(points.length - 1).toFixed(2)},${baseline} L${x(0).toFixed(2)},${baseline} Z`;

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `
    <path class="chart-area" d="${areaPath}"></path>
    <path class="chart-line" d="${linePath}"></path>
    <text x="${padding.left}" y="12" font-size="10" fill="var(--muted)">${fmtMoney(max)}</text>
    <text x="${padding.left}" y="${height - padding.bottom + 14}" font-size="10" fill="var(--muted)">${fmtMoney(min)}</text>
  `;

  svg.onmousemove = (e) => {
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    let idx = Math.round(((relX - padding.left) / (width - padding.left - padding.right)) * (points.length - 1));
    idx = Math.max(0, Math.min(points.length - 1, idx));
    showTooltip(svg, points[idx], x(idx), y(points[idx].close));
  };
  svg.onmouseleave = () => hideTooltip();
}

let tooltipEl = null;

function showTooltip(svg, point, cx, cy) {
  const container = svg.parentElement;
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "chart-tooltip";
    container.appendChild(tooltipEl);
  }
  const rect = svg.getBoundingClientRect();
  const scaleX = rect.width / 600;
  const scaleY = rect.height / 260;
  tooltipEl.style.left = `${cx * scaleX}px`;
  tooltipEl.style.top = `${cy * scaleY}px`;
  tooltipEl.hidden = false;
  tooltipEl.textContent = `${point.date}: ${fmtMoney(point.close)}`;
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.hidden = true;
}

applyChartVisibility();

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

api("/api/me")
  .then((me) => {
    document.getElementById("user-email").textContent = me.email;
  })
  .catch(() => {});

refreshAll();
setInterval(refreshAll, 60_000);
