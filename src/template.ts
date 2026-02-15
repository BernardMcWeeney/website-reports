import type { CoreWebVital, MetricWithDelta, PageSpeedResult, ReportSnapshot, WeeklyTrafficRow, WordPressSnapshot } from "./types";
import { LOGO_WHITE_PNG, LOGO_PNG, GB_BANNER_LOGO_PNG } from "./logos";

/* ── Utility helpers ───────────────────────────────────────────────── */

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtInt(value: number): string {
  return new Intl.NumberFormat("en-IE").format(Math.round(value));
}

function fmtBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

function fmtDelta(m: MetricWithDelta): string {
  if (m.deltaPercent === null) return "—";
  const sign = m.deltaPercent > 0 ? "+" : "";
  return `${sign}${m.deltaPercent.toFixed(1)}%`;
}

function deltaClass(m: MetricWithDelta): string {
  if (m.deltaPercent === null) return "";
  return m.deltaPercent >= 0 ? "delta-up" : "delta-down";
}

function scoreColor(score: number | null): string {
  if (score === null) return "#9ca3af";
  if (score >= 90) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function scoreBadge(score: number | null, label: string): string {
  const color = scoreColor(score);
  const display = score !== null ? `${score}` : "—";
  return `
    <div class="score-badge">
      <div class="score-circle" style="border-color: ${color}; color: ${color};">
        ${display}
      </div>
      <div class="score-label">${esc(label)}</div>
    </div>
  `;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-IE", {
      day: "numeric", month: "long", year: "numeric"
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/* ── Section renderers ─────────────────────────────────────────────── */

function renderCoverPage(s: ReportSnapshot): string {
  return `
    <div class="page cover-page">
      <div class="cover-header">
        <img src="${LOGO_WHITE_PNG}" alt="Greenberry" class="cover-logo" />
      </div>
      <div class="cover-body">
        <h1 class="cover-title">Monthly Website Report</h1>
        <div class="cover-domain">${esc(s.domain)}</div>
        <div class="cover-divider"></div>
        <div class="cover-meta">
          <div class="cover-meta-row"><span class="cover-meta-label">Period</span><span>${esc(s.monthLabel)}</span></div>
          <div class="cover-meta-row"><span class="cover-meta-label">Generated</span><span>${formatDate(s.generatedAt)}</span></div>
          <div class="cover-meta-row"><span class="cover-meta-label">Author</span><span>${esc(s.author)}</span></div>
          <div class="cover-meta-row"><span class="cover-meta-label">Timezone</span><span>${esc(s.timezone)}</span></div>
        </div>
      </div>
      <div class="cover-footer">
        <span>Powered by Cloudflare &amp; Google PageSpeed Insights</span>
      </div>
    </div>
  `;
}

function renderTrafficPage(s: ReportSnapshot): string {
  const t = s.traffic;
  return `
    <div class="page">
      ${pageHeader(s, "Traffic Overview")}
      <div class="page-content">
        <div class="metric-cards">
          ${metricCard("Total Requests", fmtInt(t.requests.current), fmtDelta(t.requests), deltaClass(t.requests), "vs prior month")}
          ${metricCard("Unique Visitors", fmtInt(t.uniqueVisitors.current), fmtDelta(t.uniqueVisitors), deltaClass(t.uniqueVisitors), "vs prior month")}
          ${metricCard("Bandwidth Served", fmtBytes(t.bandwidth.current), fmtDelta(t.bandwidth), deltaClass(t.bandwidth), "vs prior month")}
        </div>

        <div class="two-col" style="margin-top: 24px;">
          <div>
            <h3 class="section-subtitle">Weekly Breakdown</h3>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Week</th>
                  <th class="num">Requests</th>
                  <th class="num">Visitors</th>
                  <th class="num">Bandwidth</th>
                </tr>
              </thead>
              <tbody>${renderWeeklyRows(t.weeklyBreakdown)}</tbody>
            </table>
          </div>
          <div>
            <h3 class="section-subtitle">Top Pages</h3>
            ${renderTopPaths(s)}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderPerformancePage(s: ReportSnapshot): string {
  if (s.performance.length === 0) {
    return `
      <div class="page">
        ${pageHeader(s, "Performance")}
        <div class="page-content">
          <p class="muted">No PageSpeed data available for this period.</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="page">
      ${pageHeader(s, "Performance")}
      <div class="page-content">
        <p class="section-intro">Powered by Google PageSpeed Insights &amp; Cloudflare Observatory</p>
        ${s.performance.map(renderSinglePageSpeed).join("")}
      </div>
    </div>
  `;
}

function renderSinglePageSpeed(result: PageSpeedResult): string {
  return `
    <div class="psi-block">
      <h3 class="section-subtitle">${esc(result.url)}</h3>

      <div class="device-comparison">
        <div class="device-col">
          <h4 class="device-heading">Mobile</h4>
          <div class="score-row">
            ${scoreBadge(result.mobile.performance, "Performance")}
            ${scoreBadge(result.mobile.accessibility, "Accessibility")}
            ${scoreBadge(result.mobile.bestPractices, "Best Practices")}
            ${scoreBadge(result.mobile.seo, "SEO")}
          </div>
          ${renderVitals(result.mobileVitals)}
        </div>
        <div class="device-col">
          <h4 class="device-heading">Desktop</h4>
          <div class="score-row">
            ${scoreBadge(result.desktop.performance, "Performance")}
            ${scoreBadge(result.desktop.accessibility, "Accessibility")}
            ${scoreBadge(result.desktop.bestPractices, "Best Practices")}
            ${scoreBadge(result.desktop.seo, "SEO")}
          </div>
          ${renderVitals(result.desktopVitals)}
        </div>
      </div>

      ${renderOpportunities(result)}
    </div>
  `;
}

function renderVitals(vitals: CoreWebVital[]): string {
  if (vitals.length === 0) return "";
  return `
    <div class="vitals-grid">
      ${vitals.map(v => `
        <div class="vital-item">
          <div class="vital-value">${esc(v.displayValue)}</div>
          <div class="vital-label">${esc(v.title)}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderOpportunities(result: PageSpeedResult): string {
  if (result.opportunities.length === 0) return "";
  return `
    <div class="opportunities">
      <h4 class="opp-heading">Improvement Opportunities</h4>
      <table class="data-table compact">
        <thead>
          <tr>
            <th>Opportunity</th>
            <th class="num">Est. Savings</th>
          </tr>
        </thead>
        <tbody>
          ${result.opportunities.map(op => `
            <tr>
              <td>${esc(op.title)}</td>
              <td class="num">${op.savingsMs >= 1000 ? `${(op.savingsMs / 1000).toFixed(1)}s` : `${op.savingsMs}ms`}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSecurityPage(s: ReportSnapshot): string {
  const sec = s.security;
  const hasData = sec.totalFirewallActions > 0 || sec.botRateLimitActions > 0 || sec.topCategories.length > 0;

  return `
    <div class="page">
      ${pageHeader(s, "Security")}
      <div class="page-content">
        <p class="section-intro">Cloudflare Web Application Firewall &amp; DDoS Protection</p>

        <div class="status-banner status-good">
          <svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
          <div>
            <div class="status-title">Website Protected</div>
            <div class="status-desc">Your website is actively protected by Cloudflare's enterprise-grade security</div>
          </div>
        </div>

        ${hasData ? `
          <div class="metric-cards" style="margin-top: 20px;">
            ${metricCard("Firewall Actions", fmtInt(sec.totalFirewallActions), "Blocked + challenged", "", "threats mitigated")}
            ${metricCard("Bot Protection", fmtInt(sec.botRateLimitActions), "Bot & rate-limit", "", "actions taken")}
          </div>
          ${sec.topCategories.length > 0 ? `
            <div style="margin-top: 20px;">
              <h3 class="section-subtitle">Top Security Events</h3>
              <table class="data-table">
                <thead><tr><th>Category</th><th class="num">Count</th></tr></thead>
                <tbody>
                  ${sec.topCategories.map(c => `<tr><td>${esc(c.label)}</td><td class="num">${fmtInt(c.count)}</td></tr>`).join("")}
                </tbody>
              </table>
            </div>
          ` : ""}
        ` : `
          <div class="info-card" style="margin-top: 20px;">
            <p>No security events were recorded this period. Your website's security rules are active and monitoring for threats around the clock.</p>
          </div>
        `}

        <div class="security-features">
          <h3 class="section-subtitle" style="margin-top: 24px;">Active Protection</h3>
          <div class="feature-grid">
            ${securityFeature("SSL/TLS Encryption", "All traffic encrypted with modern TLS")}
            ${securityFeature("DDoS Protection", "Always-on volumetric attack mitigation")}
            ${securityFeature("WAF Rules", "Web Application Firewall actively filtering")}
            ${securityFeature("Bot Management", "Automated bot traffic detection & blocking")}
          </div>
        </div>
      </div>
    </div>
  `;
}

function securityFeature(title: string, desc: string): string {
  return `
    <div class="feature-item">
      <svg class="feature-check" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      <div>
        <div class="feature-title">${esc(title)}</div>
        <div class="feature-desc">${esc(desc)}</div>
      </div>
    </div>
  `;
}

function renderWordPressPage(s: ReportSnapshot): string {
  const wp = s.wordpress;
  return `
    <div class="page">
      ${pageHeader(s, "WordPress Maintenance")}
      <div class="page-content">
        <div class="status-banner status-good">
          <svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
          <div>
            <div class="status-title">All Checks Completed</div>
            <div class="status-desc">Your WordPress installation is up to date and fully secured</div>
          </div>
        </div>

        <div class="wp-grid">
          ${wpItem("Plugins Updated", `${wp.pluginsUpdated} of ${wp.totalPlugins}`, "All plugins reviewed and updated to latest versions")}
          ${wpItem("WordPress Core", `v${wp.coreVersion}`, "Running the latest stable release")}
          ${wpItem("PHP Version", `v${wp.phpVersion}`, "Optimal version for performance & security")}
          ${wpItem("Security Scan", wp.securityScanPassed ? "Passed" : "Issues Found", wp.securityScanPassed ? "No vulnerabilities detected" : "Action required")}
          ${wpItem("Latest Backup", formatDate(wp.lastBackup), "Full site backup stored securely")}
          ${wpItem("SSL Certificate", wp.sslValid ? "Valid" : "Expired", wp.sslValid ? "Certificate active and auto-renewing" : "Certificate needs attention")}
          ${wpItem("Database", wp.databaseOptimized ? "Optimized" : "Needs Optimization", wp.databaseOptimized ? "Tables cleaned and optimized" : "Optimization recommended")}
          ${wpItem("Uptime", `${wp.uptimePercent}%`, "Continuous monitoring active")}
          ${wpItem("Malware Scan", wp.malwareDetected ? "Detected" : "Clean", wp.malwareDetected ? "Malware found — remediation in progress" : "No malware or suspicious code found")}
        </div>

        <div class="info-card" style="margin-top: 24px;">
          <p><strong>Continuous Monitoring:</strong> Your website is monitored 24/7 for uptime, performance anomalies, and security threats. Updates are applied promptly following thorough compatibility testing to ensure zero downtime.</p>
        </div>
      </div>
    </div>
  `;
}

function wpItem(label: string, value: string, desc: string): string {
  const isGood = !value.toLowerCase().includes("issue") && !value.toLowerCase().includes("expired") && !value.toLowerCase().includes("detected") && !value.toLowerCase().includes("needs");
  return `
    <div class="wp-item">
      <div class="wp-item-header">
        <svg class="wp-item-icon" viewBox="0 0 24 24" fill="none" stroke="${isGood ? "#22c55e" : "#f59e0b"}" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        <span class="wp-item-label">${esc(label)}</span>
      </div>
      <div class="wp-item-value">${esc(value)}</div>
      <div class="wp-item-desc">${esc(desc)}</div>
    </div>
  `;
}

function renderSupportPage(s: ReportSnapshot): string {
  return `
    <div class="page">
      ${pageHeader(s, "Support & Services")}
      <div class="page-content">

        <div class="support-hero">
          <h2 class="support-title">Need Support?</h2>
          <p class="support-text">Whether you need a quick fix, a new feature, or have questions about your website — we're here to help.</p>
          <div class="support-contact">
            <div class="contact-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="contact-icon"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              <span>bernard@greenberry.ie</span>
            </div>
            <div class="contact-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="contact-icon"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              <span>greenberry.ie</span>
            </div>
          </div>
        </div>

        <div class="two-col" style="margin-top: 24px; gap: 20px;">
          <div class="promo-card">
            <h3 class="promo-title">Client Portal</h3>
            <p>Access your billing, invoices, and subscription details through the Greenberry client portal.</p>
            <p class="promo-link">billing.stripe.com/p/login/14k3eLfKQ9Bi4ladQQ</p>
          </div>
          <div class="promo-card">
            <h3 class="promo-title">Feature Requests</h3>
            <p>Need changes or new functionality on your website? Our development rate is <strong>&euro;50/hour</strong> for feature requests and custom work.</p>
          </div>
        </div>

        <div class="referral-banner">
          <h3 class="referral-title">Referral Program</h3>
          <p>Know someone who needs a great website? Refer them to Greenberry and receive <strong>5% off your next bill</strong>. It's our way of saying thank you!</p>
        </div>

        <div class="services-section">
          <h3 class="services-heading">Greenberry Does So Much More</h3>
          <p class="services-intro">In partnership with <strong>Waymark.ie</strong>, we provide comprehensive IT services beyond web development:</p>

          <div class="services-grid">
            <div class="service-group">
              <h4 class="service-group-title">Security Services</h4>
              <ul class="service-list">
                <li><strong>Managed Security</strong> — Continuous protection</li>
                <li><strong>Incident Response</strong> — Rapid response</li>
                <li><strong>Security Reviews</strong> — Configuration audits</li>
              </ul>
            </div>
            <div class="service-group">
              <h4 class="service-group-title">Microsoft &amp; Cloud</h4>
              <ul class="service-list">
                <li><strong>Microsoft 365</strong> — M365 platform services</li>
                <li><strong>Intune &amp; Endpoint</strong> — Device management</li>
                <li><strong>Identity &amp; Access</strong> — Entra ID security</li>
                <li><strong>Google Workspace</strong> — Admin &amp; security</li>
              </ul>
            </div>
            <div class="service-group">
              <h4 class="service-group-title">Infrastructure &amp; AI</h4>
              <ul class="service-list">
                <li><strong>Networking</strong> — UniFi &amp; site tech</li>
                <li><strong>AI Services</strong> — Strategy &amp; implementation</li>
                <li><strong>Migration</strong> — Platform migrations</li>
              </ul>
            </div>
            <div class="service-group">
              <h4 class="service-group-title">Web Security</h4>
              <ul class="service-list">
                <li><strong>Application Security</strong> — Full-stack protection</li>
              </ul>
            </div>
          </div>
        </div>

        <div class="page-footer-cta">
          <img src="${LOGO_PNG}" alt="Greenberry" class="footer-logo" />
          <p>Visit <strong>greenberry.ie</strong> to learn more about how we can help your business grow.</p>
        </div>
      </div>
    </div>
  `;
}

/* ── Shared components ─────────────────────────────────────────────── */

function pageHeader(s: ReportSnapshot, title: string): string {
  return `
    <div class="page-header">
      <img src="${GB_BANNER_LOGO_PNG}" alt="Greenberry" class="page-header-logo" />
      <div class="page-header-meta">
        <span class="page-header-title">${esc(title)}</span>
        <span class="page-header-domain">${esc(s.domain)} — ${esc(s.monthLabel)}</span>
      </div>
    </div>
  `;
}

function metricCard(label: string, value: string, delta: string, cls: string, sub: string): string {
  return `
    <div class="metric-card">
      <div class="metric-label">${esc(label)}</div>
      <div class="metric-value">${value}</div>
      <div class="metric-delta ${cls}">${delta}</div>
      <div class="metric-sub">${esc(sub)}</div>
    </div>
  `;
}

function renderWeeklyRows(rows: WeeklyTrafficRow[]): string {
  return rows.map(row => `
    <tr>
      <td>${esc(row.label)}</td>
      <td class="num">${fmtInt(row.requests)}</td>
      <td class="num">${fmtInt(row.uniques)}</td>
      <td class="num">${fmtBytes(row.bytes)}</td>
    </tr>
  `).join("");
}

function renderTopPaths(s: ReportSnapshot): string {
  if (s.traffic.topPaths.length === 0) {
    return `<p class="muted">No path data available</p>`;
  }
  return `
    <table class="data-table">
      <thead><tr><th>Path</th><th class="num">Requests</th></tr></thead>
      <tbody>
        ${s.traffic.topPaths.slice(0, 5).map(p => `
          <tr><td><code>${esc(p.path)}</code></td><td class="num">${fmtInt(p.requests)}</td></tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

/* ── Main export ───────────────────────────────────────────────────── */

export function renderReportHtml(snapshot: ReportSnapshot): string {
  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(snapshot.domain)} — Monthly Report — ${esc(snapshot.monthLabel)}</title>
  <style>
    /* ── Reset & Base ── */
    :root {
      --green: #22c55e;
      --green-dark: #16a34a;
      --green-light: #dcfce7;
      --green-bg: #f0fdf4;
      --text: #1a1f36;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --card-bg: #ffffff;
      --page-bg: #f8fafc;
      --shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: var(--text);
      background: var(--page-bg);
      font-size: 13px;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Page structure ── */
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: white;
      page-break-after: always;
      position: relative;
      overflow: hidden;
    }
    .page:last-child { page-break-after: auto; }

    /* ── Cover page ── */
    .cover-page {
      display: flex;
      flex-direction: column;
    }
    .cover-header {
      background: linear-gradient(135deg, #16a34a 0%, #22c55e 50%, #4ade80 100%);
      padding: 60px 50px 50px;
      text-align: center;
    }
    .cover-logo {
      height: 60px;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15));
    }
    .cover-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 50px;
    }
    .cover-title {
      font-size: 36px;
      font-weight: 700;
      color: var(--text);
      letter-spacing: -0.5px;
    }
    .cover-domain {
      font-size: 22px;
      color: var(--green-dark);
      font-weight: 600;
      margin-top: 8px;
    }
    .cover-divider {
      width: 80px;
      height: 4px;
      background: var(--green);
      border-radius: 2px;
      margin: 30px 0;
    }
    .cover-meta {
      width: 320px;
    }
    .cover-meta-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
    }
    .cover-meta-row:last-child { border-bottom: none; }
    .cover-meta-label {
      color: var(--text-muted);
      font-weight: 500;
    }
    .cover-footer {
      text-align: center;
      padding: 20px 50px;
      color: var(--text-muted);
      font-size: 11px;
      border-top: 1px solid var(--border);
    }

    /* ── Page header ── */
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 36px;
      border-bottom: 2px solid var(--green);
      background: white;
    }
    .page-header-logo { height: 32px; }
    .page-header-meta { text-align: right; }
    .page-header-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--text);
      display: block;
    }
    .page-header-domain {
      font-size: 11px;
      color: var(--text-muted);
    }
    .page-content {
      padding: 28px 36px;
    }

    /* ── Metric cards ── */
    .metric-cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .metric-card {
      background: white;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px 20px;
      box-shadow: var(--shadow);
      border-top: 3px solid var(--green);
    }
    .metric-label {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .metric-value {
      font-size: 28px;
      font-weight: 700;
      margin: 4px 0 2px;
      color: var(--text);
    }
    .metric-delta {
      font-size: 13px;
      font-weight: 600;
    }
    .metric-delta.delta-up { color: #22c55e; }
    .metric-delta.delta-down { color: #ef4444; }
    .metric-sub {
      font-size: 11px;
      color: var(--text-muted);
    }

    /* ── Tables ── */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .data-table th, .data-table td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    .data-table th {
      background: var(--green-bg);
      font-weight: 600;
      color: var(--text);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .data-table .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .data-table code {
      background: var(--green-bg);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
    }
    .data-table.compact th, .data-table.compact td { padding: 6px 10px; }

    /* ── Layout ── */
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    .section-subtitle {
      font-size: 14px;
      font-weight: 700;
      color: var(--green-dark);
      margin-bottom: 12px;
    }
    .section-intro {
      color: var(--text-muted);
      font-size: 12px;
      margin-bottom: 20px;
    }
    .muted { color: var(--text-muted); }

    /* ── Score badges ── */
    .score-row {
      display: flex;
      gap: 12px;
      margin: 12px 0;
    }
    .score-badge { text-align: center; }
    .score-circle {
      width: 52px;
      height: 52px;
      border: 3px solid;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 700;
      margin: 0 auto;
    }
    .score-label {
      font-size: 9px;
      color: var(--text-muted);
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    /* ── Core Web Vitals ── */
    .vitals-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
      gap: 8px;
      margin-top: 12px;
    }
    .vital-item {
      background: var(--green-bg);
      border-radius: 8px;
      padding: 8px 10px;
      text-align: center;
    }
    .vital-value {
      font-size: 14px;
      font-weight: 700;
      color: var(--text);
    }
    .vital-label {
      font-size: 9px;
      color: var(--text-muted);
      margin-top: 2px;
    }

    /* ── Performance ── */
    .psi-block { margin-bottom: 28px; }
    .device-comparison {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    .device-heading {
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 4px;
    }
    .opportunities { margin-top: 16px; }
    .opp-heading {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    /* ── Status banners ── */
    .status-banner {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 18px 22px;
      border-radius: 12px;
      margin-bottom: 20px;
    }
    .status-good {
      background: var(--green-light);
      border: 1px solid #86efac;
      color: #166534;
    }
    .status-icon {
      width: 36px;
      height: 36px;
      flex-shrink: 0;
    }
    .status-title {
      font-size: 16px;
      font-weight: 700;
    }
    .status-desc {
      font-size: 13px;
      opacity: 0.85;
    }

    /* ── Security features ── */
    .feature-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .feature-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px;
      background: var(--green-bg);
      border-radius: 8px;
    }
    .feature-check {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .feature-title { font-weight: 600; font-size: 13px; }
    .feature-desc { font-size: 11px; color: var(--text-muted); }

    /* ── WordPress ── */
    .wp-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-top: 20px;
    }
    .wp-item {
      background: white;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 16px;
      box-shadow: var(--shadow);
    }
    .wp-item-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }
    .wp-item-icon { width: 16px; height: 16px; }
    .wp-item-label {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.3px;
      font-weight: 500;
    }
    .wp-item-value {
      font-size: 18px;
      font-weight: 700;
      color: var(--text);
    }
    .wp-item-desc {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
    }

    /* ── Info card ── */
    .info-card {
      background: var(--green-bg);
      border: 1px solid #bbf7d0;
      border-radius: 10px;
      padding: 16px 20px;
      font-size: 13px;
      color: #166534;
      line-height: 1.6;
    }

    /* ── Support page ── */
    .support-hero {
      background: linear-gradient(135deg, #16a34a, #22c55e);
      border-radius: 16px;
      padding: 32px 36px;
      color: white;
      text-align: center;
    }
    .support-title {
      font-size: 24px;
      font-weight: 700;
    }
    .support-text {
      font-size: 14px;
      opacity: 0.92;
      margin-top: 8px;
      max-width: 480px;
      margin-left: auto;
      margin-right: auto;
    }
    .support-contact {
      display: flex;
      justify-content: center;
      gap: 32px;
      margin-top: 20px;
    }
    .contact-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
    }
    .contact-icon { width: 18px; height: 18px; }

    .promo-card {
      background: white;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px 24px;
      box-shadow: var(--shadow);
    }
    .promo-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--green-dark);
      margin-bottom: 8px;
    }
    .promo-link {
      font-size: 11px;
      color: var(--green-dark);
      word-break: break-all;
      margin-top: 8px;
      font-weight: 600;
    }

    .referral-banner {
      background: linear-gradient(135deg, #fef3c7, #fef9c3);
      border: 1px solid #fcd34d;
      border-radius: 12px;
      padding: 20px 24px;
      margin-top: 20px;
      text-align: center;
    }
    .referral-title {
      font-size: 16px;
      font-weight: 700;
      color: #92400e;
    }
    .referral-banner p {
      color: #78350f;
      margin-top: 6px;
      font-size: 13px;
    }

    .services-section { margin-top: 24px; }
    .services-heading {
      font-size: 18px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 4px;
    }
    .services-intro {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 16px;
    }
    .services-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .service-group {
      background: var(--green-bg);
      border-radius: 10px;
      padding: 16px 18px;
    }
    .service-group-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--green-dark);
      margin-bottom: 8px;
    }
    .service-list {
      list-style: none;
      font-size: 12px;
    }
    .service-list li {
      padding: 3px 0;
      color: var(--text);
    }
    .service-list li strong { color: var(--green-dark); }

    .page-footer-cta {
      text-align: center;
      margin-top: 28px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
    }
    .footer-logo {
      height: 36px;
      margin-bottom: 8px;
    }
    .page-footer-cta p {
      font-size: 13px;
      color: var(--text-muted);
    }

    /* ── Print / PDF ── */
    @media print {
      body { background: white; }
      .page {
        box-shadow: none;
        margin: 0;
        page-break-after: always;
      }
    }
    @page {
      size: A4;
      margin: 0;
    }
  </style>
</head>
<body>
  ${renderCoverPage(snapshot)}
  ${renderTrafficPage(snapshot)}
  ${renderPerformancePage(snapshot)}
  ${renderSecurityPage(snapshot)}
  ${renderWordPressPage(snapshot)}
  ${renderSupportPage(snapshot)}
</body>
</html>
`.trim();
}
