import type { LighthouseScores, PageSpeedResult } from "./types";

const PAGESPEED_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

interface PageSpeedBundle {
  results: PageSpeedResult[];
  warnings: string[];
}

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

async function runPageSpeed(
  apiKey: string,
  url: string,
  strategy: "mobile" | "desktop"
): Promise<LighthouseScores> {
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

  const payload = JSON.parse(text) as {
    lighthouseResult?: {
      categories?: {
        performance?: { score?: number };
        accessibility?: { score?: number };
        "best-practices"?: { score?: number };
        seo?: { score?: number };
      };
    };
  };
  const categories = payload.lighthouseResult?.categories;

  return {
    performance: normalizeScore(categories?.performance?.score),
    accessibility: normalizeScore(categories?.accessibility?.score),
    bestPractices: normalizeScore(categories?.["best-practices"]?.score),
    seo: normalizeScore(categories?.seo?.score)
  };
}

export async function fetchPageSpeedForUrls(
  apiKey: string,
  urls: string[]
): Promise<PageSpeedBundle> {
  const warnings: string[] = [];
  const uniqueUrls = Array.from(new Set(urls)).filter((value) => value.length > 0);
  const results: PageSpeedResult[] = [];

  for (const url of uniqueUrls) {
    const [mobile, desktop] = await Promise.all([
      runPageSpeed(apiKey, url, "mobile").catch((error: unknown) => {
        warnings.push(`PageSpeed mobile failed for ${url}: ${String(error)}`);
        return emptyScores();
      }),
      runPageSpeed(apiKey, url, "desktop").catch((error: unknown) => {
        warnings.push(`PageSpeed desktop failed for ${url}: ${String(error)}`);
        return emptyScores();
      })
    ]);

    results.push({
      url,
      mobile,
      desktop
    });
  }

  return { results, warnings };
}
