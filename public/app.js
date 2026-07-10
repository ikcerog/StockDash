const fmtMoney = (n) =>
  n === null || n === undefined || Number.isNaN(n)
    ? "—"
    : n.toLocaleString(undefined, { style: "currency", currency: "USD" });

const fmtPercent = (n) => (n === null || n === undefined ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);

const fmtAxisDate = (value) =>
  new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const uniqueTicks = (values) => [...new Set(values.map((v) => v.toFixed(6)))].map(parseFloat);

// Catmull-Rom-to-Bezier spline through every point (tension 1/6, the
// standard uniform factor) so chart lines read as smooth curves instead of
// straight day-to-day segments, without pulling in a charting library.
function smoothPath(points) {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)} L${points[1].x.toFixed(2)},${points[1].y.toFixed(2)}`;
  }
  let d = `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

const APP_VERSION = "1.10.1";
const CHANGELOG = [
  {
    version: "1.10.1",
    date: "2026-07-10",
    notes: [
      "News ticker now shows the full headline (wrapped, not truncated) plus outlet and timestamp, instead of a single ellipsized line.",
    ],
  },
  {
    version: "1.10.0",
    date: "2026-07-10",
    notes: [
      "Chart now has a Price / % change toggle, available for any number of symbols (previously price-only for one symbol, % change-only for multiple).",
      "Chart lines are now smoothed (Catmull-Rom spline) instead of straight day-to-day segments.",
      "Added a fuller grid backdrop: a shaded plot background plus vertical gridlines at each date tick, alongside the existing horizontal gridlines.",
    ],
  },
  {
    version: "1.9.1",
    date: "2026-07-10",
    notes: [
      "Fixed the news ticker sometimes not appearing on first load (auto-retries once, and a manual Retry link on failure).",
    ],
  },
  {
    version: "1.9.0",
    date: "2026-07-10",
    notes: [
      "Replaced the Portfolio value summary card with RKT's live price and day change.",
      "Replaced the Day change summary card with a rotating ticker of recent mortgage-industry headlines.",
    ],
  },
  {
    version: "1.8.0",
    date: "2026-07-09",
    notes: [
      "% day-change alerts now accept a comma-separated list of thresholds (e.g. 1, 3, 5, 10), each firing its own email when crossed.",
      "Chart now shows axis labels/gridlines and a hover dot with a guide line on the hovered point.",
    ],
  },
  {
    version: "1.6.0",
    date: "2026-07-09",
    notes: [
      "Fixed the theme toggle's sun/moon icons not showing.",
      "Added a Compact view (fewer columns, tighter rows; symbol names move to a hover tooltip).",
      "New favicon.",
      "Added a (?) button with a What is this? / FAQ modal.",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-07-09",
    notes: [
      "Email alerts now go through Brevo (free tier) with a verified sender, so any signed-in user can receive them — not just the account owner.",
      "Falls back to the previous Resend setup automatically if Brevo isn't configured.",
    ],
  },
  {
    version: "1.4.1",
    date: "2026-07-09",
    notes: [
      "Fixed the Columns dropdown staying open / not hiding.",
      "Chart pane now supports overlaying multiple symbols, normalized as % change so different price levels compare cleanly.",
    ],
  },
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
  compactView: "stockdash:compactView",
  chartVisible: "stockdash:chartVisible",
  chartSymbols: "stockdash:chartSymbols",
  chartRange: "stockdash:chartRange",
  chartMode: "stockdash:chartMode",
};

const CHART_COLORS = ["#2563eb", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#0ea5e9", "#ec4899", "#84cc16"];

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

// Compact view shows only these columns, overriding individual prefs, so
// everything fits without horizontal scrolling on most screens.
const COMPACT_COLUMNS = new Set(["price", "change", "value"]);
let compactView = lsGet(LS_KEYS.compactView) === "true";

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

let chartVisible = lsGet(LS_KEYS.chartVisible) === "true";
let chartSymbols = readJSON(LS_KEYS.chartSymbols, null);
if (chartSymbols === null) {
  // Migrate from the old single-symbol preference.
  const legacy = lsGet("stockdash:chartSymbol");
  chartSymbols = legacy ? [legacy] : [];
}
let chartRange = lsGet(LS_KEYS.chartRange) || "6mo";
let chartMode = lsGet(LS_KEYS.chartMode) === "percent" ? "percent" : "price";
let chartSeries = [];

function colorForSymbol(symbol) {
  const idx = chartSymbols.indexOf(symbol);
  return CHART_COLORS[(idx < 0 ? 0 : idx) % CHART_COLORS.length];
}

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

// percent_change_threshold is a comma-separated list, e.g. "1,3,5,10".
function percentThresholdCell(value) {
  if (value === null || value === undefined || value === "") return `<span class="threshold-unset">—</span>`;
  const parts = String(value)
    .split(",")
    .map((s) => `${s.trim()}%`)
    .join(", ");
  return `<span class="threshold-set">${parts}</span>`;
}

// Card DOM is built once and updated in place on refresh, so the
// independently-driven news ticker (see below) never gets clobbered by a
// summary re-render.
function renderSummary() {
  const container = document.getElementById("summary-cards");
  if (!container.dataset.built) {
    container.innerHTML = `
      <div class="stat-card">
        <div class="label">Tracked stocks</div>
        <div class="value" id="stat-tracked">—</div>
      </div>
      <div class="stat-card">
        <div class="label">RKT price</div>
        <div class="value" id="stat-rkt">—</div>
      </div>
      <div class="stat-card news-card">
        <div class="label">Mortgage news</div>
        <div class="news-ticker" id="news-ticker"><span class="muted">Loading…</span></div>
      </div>
    `;
    container.dataset.built = "true";
    // loadNews() may have already resolved (and no-opped, since this
    // skeleton didn't exist yet) before this ran; if so, show its result
    // now instead of waiting on the next rotation tick or 15-min refresh.
    // If it hasn't resolved yet, leave the "Loading…" placeholder alone —
    // loadNews() will render into #news-ticker itself once it settles.
    if (newsItems.length > 0) renderNewsTicker();
  }

  document.getElementById("stat-tracked").textContent = rows.length;

  const rkt = rows.find((r) => r.symbol === "RKT");
  const rktQuote = rkt?.quote;
  const rktEl = document.getElementById("stat-rkt");
  rktEl.textContent = rktQuote ? `${fmtMoney(rktQuote.price)} (${fmtPercent(rktQuote.changePercent)})` : "—";
  rktEl.className = `value${rktQuote ? (rktQuote.changePercent >= 0 ? " up" : " down") : ""}`;
}

// --- Mortgage news ticker ---

let newsItems = [];
let newsIndex = 0;

async function loadNews(isRetry = false) {
  try {
    const data = await api("/api/news");
    newsItems = data.items ?? [];
    newsIndex = 0;
    renderNewsTicker();
  } catch (err) {
    if (!isRetry) {
      // A page-load-time fetch can lose a race with Access session setup;
      // one delayed retry covers that without waiting on the 15-min refresh.
      setTimeout(() => loadNews(true), 3000);
      return;
    }
    newsItems = [];
    renderNewsTicker(err.message);
  }
}

// Google News RSS doesn't include a byline/reporter field (Google
// aggregates from many publishers and rarely surfaces author data in the
// feed extract), so only outlet and timestamp are shown alongside the
// headline.
function fmtNewsTime(pubDate) {
  if (!pubDate) return null;
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function renderNewsTicker(errorMessage) {
  const el = document.getElementById("news-ticker");
  if (!el) return; // summary cards not built yet
  if (newsItems.length === 0) {
    el.innerHTML = errorMessage
      ? `<span class="muted">News unavailable. <a href="#" id="news-retry-link">Retry</a></span>`
      : `<span class="muted">No news available.</span>`;
    document.getElementById("news-retry-link")?.addEventListener("click", (e) => {
      e.preventDefault();
      loadNews();
    });
    return;
  }
  const item = newsItems[newsIndex % newsItems.length];
  const time = fmtNewsTime(item.pubDate);
  el.innerHTML = `
    <a class="news-headline" href="${escapeAttr(item.link)}" target="_blank" rel="noopener noreferrer">${escapeAttr(item.title)}</a>
    <div class="news-meta">
      ${item.source ? `<span class="news-outlet">${escapeAttr(item.source)}</span>` : ""}
      ${item.source && time ? `<span class="news-sep">·</span>` : ""}
      ${time ? `<time class="news-time">${time}</time>` : ""}
    </div>
  `;
}

setInterval(() => {
  if (newsItems.length === 0) return;
  newsIndex = (newsIndex + 1) % newsItems.length;
  renderNewsTicker();
}, 9000);

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
      const titleAttr = r.label ? ` title="${escapeAttr(r.label)}"` : "";
      return `
        <tr data-id="${r.id}">
          <td class="symbol-cell"${titleAttr}>${r.symbol}${!compactView && r.label ? `<span class="name">${r.label}</span>` : ""}</td>
          <td data-col="price">${q ? fmtMoney(q.price) : "—"}</td>
          <td data-col="change" class="${q ? changeClass : ""}">${q ? fmtPercent(q.changePercent) : "—"}</td>
          <td data-col="shares">${r.shares ?? "—"}</td>
          <td data-col="value">${fmtMoney(r.market_value)}</td>
          <td data-col="high">${thresholdCell(r.price_high, " " + (q?.currency ?? "USD"))}</td>
          <td data-col="low">${thresholdCell(r.price_low, " " + (q?.currency ?? "USD"))}</td>
          <td data-col="pct">${percentThresholdCell(r.percent_change_threshold)}</td>
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
      toggleChartSymbol(row.symbol);
    });
  });

  applyColumnVisibility();
}

function applyColumnVisibility() {
  COLUMNS.forEach(({ key }) => {
    const visible = compactView ? COMPACT_COLUMNS.has(key) : columnPrefs[key] !== false;
    document.querySelectorAll(`#watchlist-table [data-col="${key}"]`).forEach((el) => {
      el.style.display = visible ? "" : "none";
    });
  });
}

function applyCompactView() {
  document.getElementById("watchlist-table").classList.toggle("compact-view", compactView);
  document.getElementById("compact-toggle-btn").textContent = compactView ? "Full view" : "Compact view";
  document.getElementById("columns-btn").disabled = compactView;
  if (compactView) document.getElementById("columns-menu").hidden = true;
  applyColumnVisibility();
}

document.getElementById("compact-toggle-btn").addEventListener("click", () => {
  compactView = !compactView;
  lsSet(LS_KEYS.compactView, String(compactView));
  applyCompactView();
  renderTable();
});

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
  populateChartSymbolsMenu();
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
    form.elements.percent_change_threshold.value = row.percent_change_threshold
      ? row.percent_change_threshold.split(",").join(", ")
      : "";
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
  // Inline styles beat any stylesheet rule, so this can't be re-broken by a
  // future CSS rule that sets display: on these elements (as [hidden] was).
  document.getElementById("theme-icon-sun").style.display = dark ? "block" : "none";
  document.getElementById("theme-icon-moon").style.display = dark ? "none" : "block";
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

applyCompactView();

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

const faqDialog = document.getElementById("faq-dialog");
document.getElementById("faq-btn").addEventListener("click", () => faqDialog.showModal());
document.getElementById("faq-close-btn").addEventListener("click", () => faqDialog.close());

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
    populateChartSymbolsMenu();
    loadChart();
  }
});

function toggleChartSymbol(symbol) {
  const idx = chartSymbols.indexOf(symbol);
  if (idx === -1) {
    chartSymbols.push(symbol);
  } else {
    chartSymbols.splice(idx, 1);
  }
  lsSet(LS_KEYS.chartSymbols, JSON.stringify(chartSymbols));
  populateChartSymbolsMenu();
  loadChart();
}

function populateChartSymbolsMenu() {
  // Drop symbols that are no longer tracked (deleted from the watchlist).
  const tracked = new Set(rows.map((r) => r.symbol));
  chartSymbols = chartSymbols.filter((s) => tracked.has(s));

  const menu = document.getElementById("chart-symbols-menu");
  if (rows.length === 0) {
    menu.innerHTML = `<span class="chart-symbols-menu-empty muted">No symbols tracked yet.</span>`;
    return;
  }
  menu.innerHTML = rows
    .map(
      (r) => `
        <label>
          <input type="checkbox" data-symbol="${r.symbol}" ${chartSymbols.includes(r.symbol) ? "checked" : ""} />
          <span class="legend-dot" style="background:${colorForSymbol(r.symbol)}"></span>
          ${r.symbol}
        </label>
      `,
    )
    .join("");
  menu.querySelectorAll("input[type=checkbox]").forEach((input) => {
    input.addEventListener("change", () => {
      toggleChartSymbol(input.dataset.symbol);
    });
  });
}

document.getElementById("chart-symbols-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  const menu = document.getElementById("chart-symbols-menu");
  menu.hidden = !menu.hidden;
});
document.addEventListener("click", (e) => {
  const dropdown = document.getElementById("chart-symbols-dropdown");
  const menu = document.getElementById("chart-symbols-menu");
  if (!menu.hidden && !dropdown.contains(e.target)) menu.hidden = true;
});

document.getElementById("chart-range-select").value = chartRange;
document.getElementById("chart-range-select").addEventListener("change", (e) => {
  chartRange = e.target.value;
  lsSet(LS_KEYS.chartRange, chartRange);
  loadChart();
});

function applyChartModeButtons() {
  document.querySelectorAll(".chart-mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === chartMode);
  });
}

document.querySelectorAll(".chart-mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.mode === chartMode) return;
    chartMode = btn.dataset.mode;
    lsSet(LS_KEYS.chartMode, chartMode);
    applyChartModeButtons();
    renderChartBody();
  });
});
applyChartModeButtons();

function renderChartLegend(series) {
  const legend = document.getElementById("chart-legend");
  legend.innerHTML = series
    .map(
      (s) => `
        <span class="legend-item" data-symbol="${s.symbol}">
          <span class="legend-dot" style="background:${s.color}"></span>${s.symbol}
        </span>
      `,
    )
    .join("");
  legend.querySelectorAll(".legend-item").forEach((el) => {
    el.addEventListener("click", () => toggleChartSymbol(el.dataset.symbol));
  });
}

async function loadChart() {
  if (!chartVisible || chartSymbols.length === 0) {
    chartSeries = [];
    renderChartBody("Pick one or more symbols to view their chart.");
    return;
  }

  try {
    const results = await Promise.all(
      chartSymbols.map(async (symbol) => {
        const data = await api(`/api/history/${encodeURIComponent(symbol)}?range=${chartRange}`);
        return { symbol, points: data.points ?? [] };
      }),
    );
    chartSeries = results
      .filter((s) => s.points.length >= 2)
      .map((s) => ({ ...s, color: colorForSymbol(s.symbol) }));
    renderChartBody(chartSeries.length === 0 ? "No chart data available for the selected symbol(s)." : null);
  } catch (err) {
    chartSeries = [];
    renderChartBody(`Chart unavailable: ${err.message}`);
  }
}

// Renders (or re-renders, e.g. on a price/% mode toggle) from whatever is
// currently in chartSeries, without refetching from the API.
function renderChartBody(emptyMessage) {
  const svg = document.getElementById("chart-svg");
  const empty = document.getElementById("chart-empty");
  const footer = document.getElementById("chart-footer");
  const legend = document.getElementById("chart-legend");

  if (emptyMessage) {
    svg.innerHTML = "";
    hideTooltip();
    legend.innerHTML = "";
    footer.textContent = "";
    empty.hidden = false;
    empty.textContent = emptyMessage;
    return;
  }

  empty.hidden = true;
  renderChartLegend(chartSeries);
  drawChart(svg, chartSeries, chartMode);

  if (chartMode === "percent") {
    footer.innerHTML = `<span>% change over the selected range, normalized to each symbol's starting price</span>`;
  } else if (chartSeries.length === 1) {
    const points = chartSeries[0].points;
    const first = points[0];
    const last = points[points.length - 1];
    const change = last.close - first.close;
    const changePct = first.close ? (change / first.close) * 100 : null;
    footer.innerHTML = `
      <span>${first.date} — ${last.date}</span>
      <span class="${change >= 0 ? "up" : "down"}">${fmtMoney(last.close)} (${fmtPercent(changePct)})</span>
    `;
  } else {
    footer.innerHTML = `<span>Price over the selected range</span>`;
  }
}

// Draws either raw price or normalized %-change for one or more symbols,
// sharing one axis/grid/hover implementation between both modes and symbol
// counts. mode: "price" | "percent".
function drawChart(svg, series, mode) {
  const width = 600;
  const height = 260;
  const padding = { top: 16, right: 16, bottom: 30, left: mode === "percent" ? 50 : 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const allTimes = series.flatMap((s) => s.points.map((p) => new Date(p.date).getTime()));
  const minTime = Math.min(...allTimes);
  const maxTime = Math.max(...allTimes);
  const timeRange = maxTime - minTime || 1;

  const normalized = series.map((s) => {
    const first = s.points[0].close;
    return {
      ...s,
      values: s.points.map((p) => ({
        t: new Date(p.date).getTime(),
        v: mode === "percent" ? (first ? ((p.close - first) / first) * 100 : 0) : p.close,
        date: p.date,
        close: p.close,
      })),
    };
  });

  const allValues = normalized.flatMap((s) => s.values.map((v) => v.v));
  if (mode === "percent") allValues.push(0);
  const minV = Math.min(...allValues);
  const maxV = Math.max(...allValues);
  const vRange = maxV - minV || 1;

  const x = (t) => padding.left + ((t - minTime) / timeRange) * plotWidth;
  const y = (v) => padding.top + (1 - (v - minV) / vRange) * plotHeight;
  const fmtValue = (v) => (mode === "percent" ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}%` : fmtMoney(v));
  const fmtAxisValue = (v) => (mode === "percent" ? `${v.toFixed(1)}%` : fmtMoney(v));

  const plotBg = `<rect class="chart-plot-bg" x="${padding.left}" y="${padding.top}" width="${plotWidth.toFixed(2)}" height="${plotHeight.toFixed(2)}"></rect>`;

  const yTickValues = mode === "percent" ? [minV, 0, maxV] : [minV, minV + vRange / 2, maxV];
  const yGrid = uniqueTicks(yTickValues)
    .map(
      (v) => `
        <line class="chart-grid-line" x1="${padding.left}" y1="${y(v).toFixed(2)}" x2="${width - padding.right}" y2="${y(v).toFixed(2)}"></line>
        <text class="chart-axis-label" x="${padding.left - 6}" y="${y(v).toFixed(2)}" text-anchor="end" dominant-baseline="middle">${fmtAxisValue(v)}</text>
      `,
    )
    .join("");

  const longestSeries = normalized.reduce((a, b) => (a.values.length >= b.values.length ? a : b));
  const xTickCount = Math.min(5, longestSeries.values.length);
  const xTickTimes = Array.from({ length: xTickCount }, (_, i) => minTime + (i / (xTickCount - 1)) * timeRange);
  const xGrid = xTickTimes
    .map((t) => `<line class="chart-grid-line-v" x1="${x(t).toFixed(2)}" y1="${padding.top}" x2="${x(t).toFixed(2)}" y2="${height - padding.bottom}"></line>`)
    .join("");
  const xLabels = xTickTimes
    .map((t, i) => {
      const anchor = i === 0 ? "start" : i === xTickTimes.length - 1 ? "end" : "middle";
      return `<text class="chart-axis-label" x="${x(t).toFixed(2)}" y="${height - 8}" text-anchor="${anchor}">${fmtAxisDate(t)}</text>`;
    })
    .join("");

  const zeroLine =
    mode === "percent"
      ? `<line x1="${padding.left}" y1="${y(0).toFixed(2)}" x2="${width - padding.right}" y2="${y(0).toFixed(2)}" class="chart-zero-line"></line>`
      : "";

  const lines = normalized
    .map((s) => {
      const d = smoothPath(s.values.map((v) => ({ x: x(v.t), y: y(v.v) })));
      return `<path class="chart-line" style="stroke:${s.color}" d="${d}"></path>`;
    })
    .join("");

  // Area fill only reads well for a single price-mode line; with multiple
  // series (or normalized % values crossing zero) it just muddies things.
  let areaPath = "";
  if (mode === "price" && normalized.length === 1) {
    const pts = normalized[0].values.map((v) => ({ x: x(v.t), y: y(v.v) }));
    const baseline = (height - padding.bottom).toFixed(2);
    const d = `${smoothPath(pts)} L${pts[pts.length - 1].x.toFixed(2)},${baseline} L${pts[0].x.toFixed(2)},${baseline} Z`;
    areaPath = `<path class="chart-area" style="fill:${normalized[0].color}" d="${d}"></path>`;
  }

  const dots = normalized
    .map((s) => `<circle class="chart-dot" data-symbol="${s.symbol}" r="4" style="fill:${s.color}" hidden></circle>`)
    .join("");

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.innerHTML = `
    ${plotBg}
    ${xGrid}
    ${yGrid}
    ${zeroLine}
    ${areaPath}
    ${lines}
    ${xLabels}
    <line class="chart-hover-line" x1="0" y1="${padding.top}" x2="0" y2="${height - padding.bottom}" hidden></line>
    ${dots}
  `;

  const hoverLine = svg.querySelector(".chart-hover-line");
  const dotEls = new Map([...svg.querySelectorAll(".chart-dot")].map((el) => [el.dataset.symbol, el]));

  svg.onmousemove = (e) => {
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const t = minTime + ((relX - padding.left) / plotWidth) * timeRange;
    const cx = Math.max(padding.left, Math.min(width - padding.right, relX));

    let singleY = padding.top;
    const lines = normalized.map((s) => {
      let nearest = s.values[0];
      let bestDiff = Infinity;
      for (const v of s.values) {
        const diff = Math.abs(v.t - t);
        if (diff < bestDiff) {
          bestDiff = diff;
          nearest = v;
        }
      }
      const dot = dotEls.get(s.symbol);
      if (dot) {
        dot.setAttribute("cx", x(nearest.t).toFixed(2));
        dot.setAttribute("cy", y(nearest.v).toFixed(2));
        dot.hidden = false;
      }
      if (normalized.length === 1) singleY = y(nearest.v);
      return normalized.length > 1 ? `${s.symbol}: ${fmtValue(nearest.v)}` : `${nearest.date}: ${fmtValue(nearest.v)}`;
    });
    hoverLine.setAttribute("x1", cx.toFixed(2));
    hoverLine.setAttribute("x2", cx.toFixed(2));
    hoverLine.hidden = false;
    showTooltip(svg, lines.join("\n"), cx, singleY);
  };
  svg.onmouseleave = () => {
    hoverLine.hidden = true;
    dotEls.forEach((dot) => (dot.hidden = true));
    hideTooltip();
  };
}

let tooltipEl = null;

function showTooltip(svg, text, cx, cy) {
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
  tooltipEl.style.whiteSpace = "pre-line";
  tooltipEl.textContent = text;
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

loadNews();
setInterval(loadNews, 15 * 60_000);
