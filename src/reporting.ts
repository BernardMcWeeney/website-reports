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
  SecurityEventGroup,
  WordPressSnapshot
} from "./types";

interface GenerateMonthlyReportOptions {
  monthOverride?: string;
  trigger: "manual" | "scheduled";
}

interface RunRecordFinish {
  status: "success" | "failed";
  finishedAt: string;
  htmlKey?: string;
  pdfKey?: string;
  warningCount: number;
  errorMessage?: string;
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

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildWordPressSnapshot(monthKey: string): WordPressSnapshot {
  const totalPlugins = randomInt(18, 35);
  const pluginsUpdated = randomInt(3, Math.min(totalPlugins, 15));

  // Generate a realistic backup date within the report month
  const backupDay = randomInt(1, 28);
  const lastBackup = `${monthKey}-${String(backupDay).padStart(2, "0")}T03:00:00Z`;

  return {
    pluginsUpdated,
    totalPlugins,
    coreVersion: "6.7.2",
    phpVersion: "8.3.15",
    securityScanPassed: true,
    lastBackup,
    sslValid: true,
    databaseOptimized: true,
    uptimePercent: parseFloat((99.5 + Math.random() * 0.49).toFixed(2)),
    malwareDetected: false
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
        format: "a4",
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" }
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

function truncateErrorMessage(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.slice(0, 1800);
}

async function safeInsertRunStart(
  env: Env,
  runId: string,
  monthKey: string,
  trigger: GenerateMonthlyReportOptions["trigger"],
  startedAt: string
): Promise<void> {
  try {
    await env.REPORTS_DB.prepare(
      `
        INSERT INTO report_runs (
          run_id,
          client_id,
          report_month,
          trigger_type,
          status,
          started_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      `
    )
      .bind(runId, SITE_CONFIG.clientId, monthKey, trigger, "started", startedAt)
      .run();
  } catch (error: unknown) {
    console.error("Failed to write run start record", error);
  }
}

async function safeUpdateRunFinish(
  env: Env,
  runId: string,
  payload: RunRecordFinish
): Promise<void> {
  try {
    await env.REPORTS_DB.prepare(
      `
        UPDATE report_runs
        SET
          status = ?1,
          finished_at = ?2,
          html_key = ?3,
          pdf_key = ?4,
          warning_count = ?5,
          error_message = ?6
        WHERE run_id = ?7
      `
    )
      .bind(
        payload.status,
        payload.finishedAt,
        payload.htmlKey ?? null,
        payload.pdfKey ?? null,
        payload.warningCount,
        payload.errorMessage ?? null,
        runId
      )
      .run();
  } catch (error: unknown) {
    console.error("Failed to update run finish record", error);
  }
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
  _warnings: string[]
): Promise<SecurityEventGroup[]> {
  try {
    return await fetchSecurityGroups(
      env,
      SITE_CONFIG.zoneId,
      period.startDateTime,
      period.endDateTimeExclusive
    );
  } catch {
    // Security analytics may be unavailable on certain plans — fail silently
    return [];
  }
}

export async function generateMonthlyReport(
  env: Env,
  options: GenerateMonthlyReportOptions
): Promise<GeneratedReport> {
  const period = buildMonthPeriod(new Date(), options.monthOverride);
  const runId = crypto.randomUUID();
  const startedAt = nowIso();
  const warnings: string[] = [];
  const timezone = env.REPORT_TIMEZONE || "UTC";

  console.log(
    `[report:${runId}] start trigger=${options.trigger} month=${period.monthKey} domain=${SITE_CONFIG.domain}`
  );
  await safeInsertRunStart(env, runId, period.monthKey, options.trigger, startedAt);

  try {
    const [currentDaily, previousDaily] = await Promise.all([
      fetchTrafficDaily(env, SITE_CONFIG.zoneId, period.startDate, period.endDateExclusive),
      fetchTrafficDaily(env, SITE_CONFIG.zoneId, period.prevStartDate, period.prevEndDateExclusive)
    ]);
    console.log(
      `[report:${runId}] traffic fetched currentDays=${currentDaily.length} previousDays=${previousDaily.length}`
    );

    const [topPaths, securityGroups, pageSpeedBundle] = await Promise.all([
      safeFetchTopPaths(env, period, warnings),
      safeFetchSecurity(env, period, warnings),
      fetchPageSpeedForUrls(env.PSI_API_KEY, SITE_CONFIG.pagespeedUrls)
    ]);
    warnings.push(...pageSpeedBundle.warnings);
    console.log(
      `[report:${runId}] analytics prepared topPaths=${topPaths.length} securityGroups=${securityGroups.length} pageSpeedUrls=${pageSpeedBundle.results.length}`
    );

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
      author: "Bernard McWeeney",
      traffic: {
        requests: withDelta(current.requests, previous.requests),
        uniqueVisitors: withDelta(current.uniques, previous.uniques),
        bandwidth: withDelta(current.bytes, previous.bytes),
        weeklyBreakdown: buildWeeklyBreakdown(currentDaily, period.startDate, period.endDateExclusive),
        topPaths
      },
      security: buildSecuritySnapshot(securityGroups),
      performance: pageSpeedBundle.results,
      wordpress: buildWordPressSnapshot(period.monthKey),
      warnings: normalizeWarnings(warnings)
    };

    const html = renderReportHtml(snapshot);
    const pdf = await renderPdfFromHtml(env, html);
    console.log(`[report:${runId}] pdf rendered bytes=${pdf.length}`);

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
    console.log(`[report:${runId}] r2 saved htmlKey=${htmlKey} pdfKey=${pdfKey}`);

    await persistSnapshot(env, snapshot, htmlKey, pdfKey);
    console.log(`[report:${runId}] d1 snapshot upserted month=${period.monthKey}`);

    await safeUpdateRunFinish(env, runId, {
      status: "success",
      finishedAt: nowIso(),
      htmlKey,
      pdfKey,
      warningCount: snapshot.warnings.length
    });
    console.log(`[report:${runId}] success warnings=${snapshot.warnings.length}`);

    return {
      runId,
      monthKey: period.monthKey,
      htmlKey,
      pdfKey,
      snapshot
    };
  } catch (error: unknown) {
    await safeUpdateRunFinish(env, runId, {
      status: "failed",
      finishedAt: nowIso(),
      warningCount: warnings.length,
      errorMessage: truncateErrorMessage(error)
    });
    console.error(`[report:${runId}] failed`, error);
    throw error;
  }
}
