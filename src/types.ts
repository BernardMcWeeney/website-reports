export interface Env {
  CF_API_TOKEN: string;
  CF_ACCOUNT_ID: string;
  PSI_API_KEY: string;
  REPORT_TIMEZONE?: string;
  RUN_TOKEN?: string;
  REPORTS_BUCKET: R2Bucket;
  REPORTS_DB: D1Database;
}

export interface MonthPeriod {
  monthKey: string;
  startDate: string;
  endDateExclusive: string;
  prevMonthKey: string;
  prevStartDate: string;
  prevEndDateExclusive: string;
  startDateTime: string;
  endDateTimeExclusive: string;
  prevStartDateTime: string;
  prevEndDateTimeExclusive: string;
}

export interface DailyTrafficPoint {
  date: string;
  requests: number;
  uniques: number;
  bytes: number;
}

export interface TopPath {
  path: string;
  requests: number;
}

export interface SecurityEventGroup {
  source: string;
  action: string;
  count: number;
}

export interface MetricWithDelta {
  current: number;
  previous: number;
  deltaPercent: number | null;
}

export interface WeeklyTrafficRow {
  label: string;
  requests: number;
  uniques: number;
  bytes: number;
}

export interface SecurityCategoryRow {
  label: string;
  count: number;
}

export interface LighthouseScores {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
}

export interface PageSpeedResult {
  url: string;
  mobile: LighthouseScores;
  desktop: LighthouseScores;
}

export interface TrafficSnapshot {
  requests: MetricWithDelta;
  uniqueVisitors: MetricWithDelta;
  bandwidth: MetricWithDelta;
  weeklyBreakdown: WeeklyTrafficRow[];
  topPaths: TopPath[];
}

export interface SecuritySnapshot {
  totalFirewallActions: number;
  botRateLimitActions: number;
  topCategories: SecurityCategoryRow[];
}

export interface ReportSnapshot {
  clientId: string;
  zoneId: string;
  domain: string;
  monthKey: string;
  monthLabel: string;
  timezone: string;
  generatedAt: string;
  traffic: TrafficSnapshot;
  security: SecuritySnapshot;
  performance: PageSpeedResult[];
  warnings: string[];
}

export interface GeneratedReport {
  monthKey: string;
  htmlKey: string;
  pdfKey: string;
  snapshot: ReportSnapshot;
}
