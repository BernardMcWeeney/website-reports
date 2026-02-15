import { fetchSecurityGroups, fetchTopPaths, fetchTrafficDaily } from "./cloudflare";
import { SITE_CONFIG } from "./config";
import { buildMonthPeriod, buildWeeklyBreakdown, formatMonthLabel } from "./period";
import { fetchPageSpeedForUrls } from "./pagespeed";
import { renderReportHtml } from "./template";
import type {
  DailyTrafficPoint,
  Env,
  GeneratedReport,
  MetricWithDelta,
  MonthPeriod,
  ReportSnapshot,
  SecurityEventGroup
} from "./types";

interface GenerateMonthlyReportOptions {
  monthOverride?: string;
  trigger: "manual" | "scheduled";
}

function sumTraffic(daily: DailyTrafficPoint[]): {
  requests: number;
  uniques: number;
  bytes: number;
} {
  return daily.reduce(
    (totals, point) => ({
      requests: totals.requests + point.requests,
      uniques: totals.uniques + point.uniques,
      bytes: totals.bytes + point.bytes
    }),
    { requests: 0, uniques: 0, bytes: 0 }
  );
}

function withDelta(current: number, previous: number): MetricWithDelta {
  const deltaPercent =
    previous === 0 ? (current === 0 ? 0 : null) : ((current - previous) / previous) * 100;
  return {
    current,
    previous,
    deltaPercent
  };
}

function buildSecuritySnapshot(groups: SecurityEventGroup[]) {
  const firewallActions = new Set(["block", "challenge", "js_challenge", "managed_challenge"]);

  let totalFirewallActions = 0;
  let botRateLimitActions = 0;

  const byCategory = new Map<string, number>();
  for (const group of groups) {
    const actionLower = group.action.toLowerCase();
    const sourceLower = group.source.toLowerCase();

    if (firewallActions.has(actionLower)) {
      totalFirewallActions += group.count;
    }
    if (actionLower.includes("bot") || actionLower.includes("rate")) {
      botRateLimitActions += group.count;
    } else if (sourceLower.includes("bot") || sourceLower.includes("rate")) {
      botRateLimitActions += group.count;
    }

    const label = `${group.source}/${group.action}`;
    byCategory.set(label, (byCategory.get(label) ?? 0) + group.count);
  }

  const topCategories = Array.from(byCategory.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([label, count]) => ({ label, count }));

  return {
    totalFirewallActions,
    botRateLimitActions,
    topCategories
  };
}

async function renderPdfFromHtml(env: Env, html: string): Promise<Uint8Array> {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/pdf`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      html,
      pdfOptions: {
        format: "A4",
        printBackground: true
      },
      gotoOptions: {
        waitUntil: "networkidle0"
      }
    })
  });

  if (!response.ok) {
    throw new Error(
      `Browser Rendering PDF request failed (${response.status}): ${await response.text()}`
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = (await response.json()) as { errors?: unknown; messages?: unknown };
    throw new Error(`Unexpected JSON response from PDF endpoint: ${JSON.stringify(payload)}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeWarnings(warnings: string[]): string[] {
  return warnings.map((warning) => warning.slice(0, 450));
}

async function persistSnapshot(
  env: Env,
  snapshot: ReportSnapshot,
  htmlKey: string,
  pdfKey: string
): Promise<void> {
  await env.REPORTS_DB.prepare(
    `
      INSERT INTO monthly_reports (
        client_id,
        zone_id,
        domain,
        report_month,
        timezone,
        generated_at,
        r2_html_key,
        r2_pdf_key,
        snapshot_json
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      ON CONFLICT(client_id, report_month)
      DO UPDATE SET
        zone_id = excluded.zone_id,
        domain = excluded.domain,
        timezone = excluded.timezone,
        generated_at = excluded.generated_at,
        r2_html_key = excluded.r2_html_key,
        r2_pdf_key = excluded.r2_pdf_key,
        snapshot_json = excluded.snapshot_json
    `
  )
    .bind(
      snapshot.clientId,
      snapshot.zoneId,
      snapshot.domain,
      snapshot.monthKey,
      snapshot.timezone,
      snapshot.generatedAt,
      htmlKey,
      pdfKey,
      JSON.stringify(snapshot)
    )
    .run();
}

async function safeFetchTopPaths(
  env: Env,
  period: MonthPeriod,
  warnings: string[]
): Promise<ReportSnapshot["traffic"]["topPaths"]> {
  try {
    return await fetchTopPaths(
      env,
      SITE_CONFIG.zoneId,
      period.startDateTime,
      period.endDateTimeExclusive,
      5
    );
  } catch (error: unknown) {
    warnings.push(`Top paths unavailable: ${String(error)}`);
    return [];
  }
}

async function safeFetchSecurity(
  env: Env,
  period: MonthPeriod,
  warnings: string[]
): Promise<SecurityEventGroup[]> {
  try {
    return await fetchSecurityGroups(
      env,
      SITE_CONFIG.zoneId,
      period.startDateTime,
      period.endDateTimeExclusive
    );
  } catch (error: unknown) {
    warnings.push(`Security analytics unavailable: ${String(error)}`);
    return [];
  }
}

export async function generateMonthlyReport(
  env: Env,
  options: GenerateMonthlyReportOptions
): Promise<GeneratedReport> {
  const period = buildMonthPeriod(new Date(), options.monthOverride);
  const warnings: string[] = [];
  const timezone = env.REPORT_TIMEZONE || "UTC";

  const [currentDaily, previousDaily] = await Promise.all([
    fetchTrafficDaily(env, SITE_CONFIG.zoneId, period.startDate, period.endDateExclusive),
    fetchTrafficDaily(env, SITE_CONFIG.zoneId, period.prevStartDate, period.prevEndDateExclusive)
  ]);

  const [topPaths, securityGroups, pageSpeedBundle] = await Promise.all([
    safeFetchTopPaths(env, period, warnings),
    safeFetchSecurity(env, period, warnings),
    fetchPageSpeedForUrls(env.PSI_API_KEY, SITE_CONFIG.pagespeedUrls)
  ]);
  warnings.push(...pageSpeedBundle.warnings);

  const current = sumTraffic(currentDaily);
  const previous = sumTraffic(previousDaily);
  const monthLabel = formatMonthLabel(period.monthKey, timezone);

  const snapshot: ReportSnapshot = {
    clientId: SITE_CONFIG.clientId,
    zoneId: SITE_CONFIG.zoneId,
    domain: SITE_CONFIG.domain,
    monthKey: period.monthKey,
    monthLabel,
    timezone,
    generatedAt: nowIso(),
    traffic: {
      requests: withDelta(current.requests, previous.requests),
      uniqueVisitors: withDelta(current.uniques, previous.uniques),
      bandwidth: withDelta(current.bytes, previous.bytes),
      weeklyBreakdown: buildWeeklyBreakdown(currentDaily, period.startDate, period.endDateExclusive),
      topPaths
    },
    security: buildSecuritySnapshot(securityGroups),
    performance: pageSpeedBundle.results,
    warnings: normalizeWarnings(warnings)
  };

  const html = renderReportHtml(snapshot);
  const pdf = await renderPdfFromHtml(env, html);

  const keyPrefix = `reports/${SITE_CONFIG.clientId}/${period.monthKey}`;
  const htmlKey = `${keyPrefix}.html`;
  const pdfKey = `${keyPrefix}.pdf`;

  await Promise.all([
    env.REPORTS_BUCKET.put(htmlKey, html, {
      httpMetadata: { contentType: "text/html; charset=utf-8" }
    }),
    env.REPORTS_BUCKET.put(pdfKey, pdf, {
      httpMetadata: { contentType: "application/pdf" }
    })
  ]);

  await persistSnapshot(env, snapshot, htmlKey, pdfKey);

  return {
    monthKey: period.monthKey,
    htmlKey,
    pdfKey,
    snapshot
  };
}
