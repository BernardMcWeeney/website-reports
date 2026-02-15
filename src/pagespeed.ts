import type { CoreWebVital, LighthouseScores, PageSpeedOpportunity, PageSpeedResult } from "./types";

const PAGESPEED_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

interface PageSpeedBundle {
  results: PageSpeedResult[];
  warnings: string[];
}

interface LighthouseAudit {
  id?: string;
  title?: string;
  displayValue?: string;
  numericValue?: number;
  numericUnit?: string;
  description?: string;
  details?: {
    overallSavingsMs?: number;
    type?: string;
  };
}

interface PageSpeedApiResponse {
  lighthouseResult?: {
    categories?: {
      performance?: { score?: number };
      accessibility?: { score?: number };
      "best-practices"?: { score?: number };
      seo?: { score?: number };
    };
    audits?: Record<string, LighthouseAudit>;
  };
}

const CORE_VITAL_IDS = [
  "first-contentful-paint",
  "largest-contentful-paint",
  "cumulative-layout-shift",
  "total-blocking-time",
  "speed-index"
];

function normalizeScore(rawScore: unknown): number | null {
  if (typeof rawScore !== "number") {
    return null;
  }
  if (rawScore >= 0 && rawScore <= 1) {
    return Math.round(rawScore * 100);
  }
  if (rawScore > 1 && rawScore <= 100) {
    return Math.round(rawScore);
  }
  return null;
}

function emptyScores(): LighthouseScores {
  return {
    performance: null,
    accessibility: null,
    bestPractices: null,
    seo: null
  };
}

function extractVitals(audits: Record<string, LighthouseAudit> | undefined): CoreWebVital[] {
  if (!audits) return [];
  const vitals: CoreWebVital[] = [];
  for (const id of CORE_VITAL_IDS) {
    const audit = audits[id];
    if (audit) {
      vitals.push({
        id,
        title: audit.title ?? id,
        displayValue: audit.displayValue ?? "n/a",
        numericValue: typeof audit.numericValue === "number" ? audit.numericValue : null
      });
    }
  }
  return vitals;
}

function extractOpportunities(audits: Record<string, LighthouseAudit> | undefined): PageSpeedOpportunity[] {
  if (!audits) return [];
  const opportunities: PageSpeedOpportunity[] = [];
  for (const audit of Object.values(audits)) {
    const savings = audit.details?.overallSavingsMs;
    if (typeof savings === "number" && savings > 0) {
      opportunities.push({
        title: audit.title ?? "Unknown",
        description: (audit.description ?? "").replace(/\[.*?\]\(.*?\)/g, "").trim(),
        savingsMs: Math.round(savings)
      });
    }
  }
  return opportunities.sort((a, b) => b.savingsMs - a.savingsMs).slice(0, 5);
}

interface SingleRunResult {
  scores: LighthouseScores;
  vitals: CoreWebVital[];
  opportunities: PageSpeedOpportunity[];
}

async function runPageSpeed(
  apiKey: string,
  url: string,
  strategy: "mobile" | "desktop"
): Promise<SingleRunResult> {
  const endpoint = new URL(PAGESPEED_ENDPOINT);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", strategy);
  endpoint.searchParams.set("key", apiKey);
  endpoint.searchParams.append("category", "performance");
  endpoint.searchParams.append("category", "accessibility");
  endpoint.searchParams.append("category", "best-practices");
  endpoint.searchParams.append("category", "seo");

  const response = await fetch(endpoint.toString());
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PageSpeed request failed for ${strategy} (${response.status}): ${text}`);
  }

  const payload = JSON.parse(text) as PageSpeedApiResponse;
  const categories = payload.lighthouseResult?.categories;
  const audits = payload.lighthouseResult?.audits;

  return {
    scores: {
      performance: normalizeScore(categories?.performance?.score),
      accessibility: normalizeScore(categories?.accessibility?.score),
      bestPractices: normalizeScore(categories?.["best-practices"]?.score),
      seo: normalizeScore(categories?.seo?.score)
    },
    vitals: extractVitals(audits),
    opportunities: extractOpportunities(audits)
  };
}

function emptyRunResult(): SingleRunResult {
  return { scores: emptyScores(), vitals: [], opportunities: [] };
}

export async function fetchPageSpeedForUrls(
  apiKey: string,
  urls: string[]
): Promise<PageSpeedBundle> {
  const warnings: string[] = [];
  const uniqueUrls = Array.from(new Set(urls)).filter((value) => value.length > 0);
  const results: PageSpeedResult[] = [];

  for (const url of uniqueUrls) {
    const [mobileResult, desktopResult] = await Promise.all([
      runPageSpeed(apiKey, url, "mobile").catch((error: unknown) => {
        warnings.push(`PageSpeed mobile failed for ${url}: ${String(error)}`);
        return emptyRunResult();
      }),
      runPageSpeed(apiKey, url, "desktop").catch((error: unknown) => {
        warnings.push(`PageSpeed desktop failed for ${url}: ${String(error)}`);
        return emptyRunResult();
      })
    ]);

    // Merge opportunities from both, dedupe by title, keep highest savings
    const opMap = new Map<string, PageSpeedOpportunity>();
    for (const op of [...mobileResult.opportunities, ...desktopResult.opportunities]) {
      const existing = opMap.get(op.title);
      if (!existing || op.savingsMs > existing.savingsMs) {
        opMap.set(op.title, op);
      }
    }

    results.push({
      url,
      mobile: mobileResult.scores,
      desktop: desktopResult.scores,
      mobileVitals: mobileResult.vitals,
      desktopVitals: desktopResult.vitals,
      opportunities: Array.from(opMap.values()).sort((a, b) => b.savingsMs - a.savingsMs).slice(0, 5)
    });
  }

  return { results, warnings };
}
