import type { MetricWithDelta, PageSpeedResult, ReportSnapshot, WeeklyTrafficRow } from "./types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDelta(metric: MetricWithDelta): string {
  if (metric.deltaPercent === null) {
    return "n/a";
  }
  const sign = metric.deltaPercent > 0 ? "+" : "";
  return `${sign}${metric.deltaPercent.toFixed(1)}%`;
}

function scoreCell(score: number | null): string {
  if (score === null) {
    return "n/a";
  }
  return `${score}`;
}

function renderWeeklyRows(rows: WeeklyTrafficRow[]): string {
  return rows
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(row.label)}</td>
        <td class="num">${formatInteger(row.requests)}</td>
        <td class="num">${formatInteger(row.uniques)}</td>
        <td class="num">${formatBytes(row.bytes)}</td>
      </tr>
    `
    )
    .join("");
}

function renderPerformanceRows(items: PageSpeedResult[]): string {
  if (items.length === 0) {
    return `
      <tr>
        <td colspan="6">No PageSpeed data</td>
      </tr>
    `;
  }

  return items
    .map((item) => {
      const safeUrl = escapeHtml(item.url);
      return `
        <tr>
          <td>${safeUrl}</td>
          <td>Mobile</td>
          <td class="num">${scoreCell(item.mobile.performance)}</td>
          <td class="num">${scoreCell(item.mobile.accessibility)}</td>
          <td class="num">${scoreCell(item.mobile.bestPractices)}</td>
          <td class="num">${scoreCell(item.mobile.seo)}</td>
        </tr>
        <tr>
          <td>${safeUrl}</td>
          <td>Desktop</td>
          <td class="num">${scoreCell(item.desktop.performance)}</td>
          <td class="num">${scoreCell(item.desktop.accessibility)}</td>
          <td class="num">${scoreCell(item.desktop.bestPractices)}</td>
          <td class="num">${scoreCell(item.desktop.seo)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderTopPaths(snapshot: ReportSnapshot): string {
  if (snapshot.traffic.topPaths.length === 0) {
    return "<li>No path data available</li>";
  }
  return snapshot.traffic.topPaths
    .slice(0, 5)
    .map(
      (entry) =>
        `<li><code>${escapeHtml(entry.path)}</code> <strong>${formatInteger(entry.requests)}</strong></li>`
    )
    .join("");
}

function renderTopSecurityCategories(snapshot: ReportSnapshot): string {
  if (snapshot.security.topCategories.length === 0) {
    return "<li>No category data available</li>";
  }
  return snapshot.security.topCategories
    .slice(0, 3)
    .map(
      (entry) =>
        `<li>${escapeHtml(entry.label)} <strong>${formatInteger(entry.count)}</strong></li>`
    )
    .join("");
}

function renderWarningBlock(snapshot: ReportSnapshot): string {
  if (snapshot.warnings.length === 0) {
    return "";
  }
  const rows = snapshot.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
  return `
    <section class="warnings">
      <h2>Warnings</h2>
      <ul>${rows}</ul>
    </section>
  `;
}

export function renderReportHtml(snapshot: ReportSnapshot): string {
  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(snapshot.domain)} Monthly Report</title>
    <style>
      :root {
        --text: #1a1f36;
        --muted: #4e5d78;
        --border: #dbe1ea;
        --card: #f7f9fc;
        --accent: #0057b8;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        padding: 18px;
        font-family: "Avenir Next", "Helvetica Neue", Arial, sans-serif;
        color: var(--text);
        background: #ffffff;
        font-size: 12px;
        line-height: 1.35;
      }
      h1, h2 {
        margin: 0 0 8px;
        line-height: 1.2;
      }
      h1 {
        font-size: 20px;
      }
      h2 {
        font-size: 14px;
        color: var(--accent);
      }
      section {
        margin-top: 14px;
      }
      .meta {
        color: var(--muted);
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      .card {
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--card);
        padding: 10px;
      }
      .card .label {
        color: var(--muted);
      }
      .card .value {
        margin-top: 3px;
        font-size: 18px;
        font-weight: 700;
      }
      .card .delta {
        margin-top: 2px;
        color: var(--muted);
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        border: 1px solid var(--border);
        padding: 6px 7px;
        text-align: left;
        vertical-align: top;
      }
      th {
        background: var(--card);
        font-weight: 600;
      }
      .num {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .two-col {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      ul {
        margin: 6px 0 0;
        padding-left: 18px;
      }
      li {
        margin: 4px 0;
      }
      .warnings {
        border: 1px solid #f2c26b;
        background: #fff8e8;
        border-radius: 8px;
        padding: 8px 10px;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Monthly Website Report</h1>
      <div class="meta">
        <strong>Domain:</strong> ${escapeHtml(snapshot.domain)} |
        <strong>Month:</strong> ${escapeHtml(snapshot.monthLabel)} (${escapeHtml(snapshot.monthKey)}) |
        <strong>Timezone:</strong> ${escapeHtml(snapshot.timezone)} |
        <strong>Generated:</strong> ${escapeHtml(snapshot.generatedAt)}
      </div>
    </header>

    <section>
      <h2>Traffic (Cloudflare)</h2>
      <div class="cards">
        <div class="card">
          <div class="label">Total requests</div>
          <div class="value">${formatInteger(snapshot.traffic.requests.current)}</div>
          <div class="delta">${formatDelta(snapshot.traffic.requests)} vs prior month</div>
        </div>
        <div class="card">
          <div class="label">Unique visitors</div>
          <div class="value">${formatInteger(snapshot.traffic.uniqueVisitors.current)}</div>
          <div class="delta">${formatDelta(snapshot.traffic.uniqueVisitors)} vs prior month</div>
        </div>
        <div class="card">
          <div class="label">Bandwidth served</div>
          <div class="value">${formatBytes(snapshot.traffic.bandwidth.current)}</div>
          <div class="delta">${formatDelta(snapshot.traffic.bandwidth)} vs prior month</div>
        </div>
      </div>
    </section>

    <section class="two-col">
      <div>
        <h2>Weekly Breakdown</h2>
        <table>
          <thead>
            <tr>
              <th>Week</th>
              <th class="num">Requests</th>
              <th class="num">Uniques</th>
              <th class="num">Bandwidth</th>
            </tr>
          </thead>
          <tbody>${renderWeeklyRows(snapshot.traffic.weeklyBreakdown)}</tbody>
        </table>
      </div>
      <div>
        <h2>Top Paths (by requests)</h2>
        <ul>${renderTopPaths(snapshot)}</ul>
      </div>
    </section>

    <section class="two-col">
      <div>
        <h2>Security (Cloudflare)</h2>
        <div class="cards" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
          <div class="card">
            <div class="label">Firewall/WAF actions</div>
            <div class="value">${formatInteger(snapshot.security.totalFirewallActions)}</div>
            <div class="delta">Blocked + challenged actions</div>
          </div>
          <div class="card">
            <div class="label">Bot/rate-limit actions</div>
            <div class="value">${formatInteger(snapshot.security.botRateLimitActions)}</div>
            <div class="delta">Source/action contains bot or rate</div>
          </div>
        </div>
      </div>
      <div>
        <h2>Top Rule/Action Categories</h2>
        <ul>${renderTopSecurityCategories(snapshot)}</ul>
      </div>
    </section>

    <section>
      <h2>Performance (PageSpeed)</h2>
      <table>
        <thead>
          <tr>
            <th>URL</th>
            <th>Device</th>
            <th class="num">Performance</th>
            <th class="num">Accessibility</th>
            <th class="num">Best Practices</th>
            <th class="num">SEO</th>
          </tr>
        </thead>
        <tbody>${renderPerformanceRows(snapshot.performance)}</tbody>
      </table>
    </section>

    ${renderWarningBlock(snapshot)}
  </body>
</html>
`.trim();
}
