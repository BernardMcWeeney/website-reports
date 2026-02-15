import type { DailyTrafficPoint, Env, SecurityEventGroup, TopPath } from "./types";

const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function graphqlRequest<T>(
  env: Env,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, variables })
  });

  const text = await response.text();
  if (!response.ok) {
    if (
      response.status === 400 &&
      (text.includes("\"code\":10001") || text.includes("Unable to authenticate request"))
    ) {
      throw new Error(
        "Cloudflare GraphQL auth failed. Set a valid CF_API_TOKEN runtime secret. " +
          "For local wrangler dev, add CF_API_TOKEN to .dev.vars."
      );
    }
    throw new Error(`Cloudflare GraphQL request failed (${response.status}): ${text}`);
  }

  const payload = JSON.parse(text) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };

  if (payload.errors?.length) {
    const joined = payload.errors.map((entry) => entry.message ?? "unknown").join("; ");
    throw new Error(`Cloudflare GraphQL returned errors: ${joined}`);
  }
  if (!payload.data) {
    throw new Error("Cloudflare GraphQL returned no data");
  }
  return payload.data;
}

interface TrafficQueryResponse {
  viewer?: {
    zones?: Array<{
      httpRequests1dGroups?: Array<{
        dimensions?: { date?: string };
        sum?: { requests?: number | string; bytes?: number | string };
        uniq?: { uniques?: number | string };
      }>;
    }>;
  };
}

export async function fetchTrafficDaily(
  env: Env,
  zoneId: string,
  startDate: string,
  endDateExclusive: string
): Promise<DailyTrafficPoint[]> {
  const query = `
    query TrafficDaily($zoneTag: string!, $startDate: Date!, $endDateExclusive: Date!) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          httpRequests1dGroups(
            limit: 62
            orderBy: [date_ASC]
            filter: { date_geq: $startDate, date_lt: $endDateExclusive }
          ) {
            dimensions {
              date
            }
            sum {
              requests
              bytes
            }
            uniq {
              uniques
            }
          }
        }
      }
    }
  `;

  const data = await graphqlRequest<TrafficQueryResponse>(env, query, {
    zoneTag: zoneId,
    startDate,
    endDateExclusive
  });

  const zone = data.viewer?.zones?.[0];
  if (!zone?.httpRequests1dGroups) {
    return [];
  }

  return zone.httpRequests1dGroups
    .map((item) => ({
      date: item.dimensions?.date ?? "",
      requests: toNumber(item.sum?.requests),
      uniques: toNumber(item.uniq?.uniques),
      bytes: toNumber(item.sum?.bytes)
    }))
    .filter((item) => item.date.length > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
}

interface TopPathQueryResponse {
  viewer?: {
    zones?: Array<{
      httpRequestsAdaptiveGroups?: Array<{
        dimensions?: { clientRequestPath?: string };
        sum?: { requests?: number | string };
      }>;
    }>;
  };
}

export async function fetchTopPaths(
  env: Env,
  zoneId: string,
  startDateTime: string,
  endDateTimeExclusive: string,
  limit = 5
): Promise<TopPath[]> {
  const query = `
    query TopPaths(
      $zoneTag: string!
      $startDateTime: Time!
      $endDateTimeExclusive: Time!
      $limit: Int!
    ) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          httpRequestsAdaptiveGroups(
            limit: $limit
            orderBy: [count_DESC]
            filter: { datetime_geq: $startDateTime, datetime_lt: $endDateTimeExclusive }
          ) {
            dimensions {
              clientRequestPath
            }
            sum {
              requests
            }
          }
        }
      }
    }
  `;

  const data = await graphqlRequest<TopPathQueryResponse>(env, query, {
    zoneTag: zoneId,
    startDateTime,
    endDateTimeExclusive,
    limit
  });

  const groups = data.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups ?? [];
  return groups.map((item) => ({
    path: item.dimensions?.clientRequestPath || "/",
    requests: toNumber(item.sum?.requests)
  }));
}

interface SecurityQueryResponse {
  viewer?: {
    zones?: Array<{
      firewallEventsAdaptiveGroups?: Array<{
        count?: number | string;
        dimensions?: {
          action?: string;
          source?: string;
        };
      }>;
    }>;
  };
}

interface SecurityActionOnlyQueryResponse {
  viewer?: {
    zones?: Array<{
      firewallEventsAdaptiveGroups?: Array<{
        count?: number | string;
        dimensions?: {
          action?: string;
        };
      }>;
    }>;
  };
}

export async function fetchSecurityGroups(
  env: Env,
  zoneId: string,
  startDateTime: string,
  endDateTimeExclusive: string
): Promise<SecurityEventGroup[]> {
  const sourceAndActionQuery = `
    query SecurityGroups($zoneTag: string!, $startDateTime: Time!, $endDateTimeExclusive: Time!) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          firewallEventsAdaptiveGroups(
            limit: 500
            filter: { datetime_geq: $startDateTime, datetime_lt: $endDateTimeExclusive }
          ) {
            count
            dimensions {
              source
              action
            }
          }
        }
      }
    }
  `;

  try {
    const fullData = await graphqlRequest<SecurityQueryResponse>(env, sourceAndActionQuery, {
      zoneTag: zoneId,
      startDateTime,
      endDateTimeExclusive
    });
    const fullGroups = fullData.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups ?? [];
    return fullGroups.map((item) => ({
      source: item.dimensions?.source ?? "unknown",
      action: item.dimensions?.action ?? "unknown",
      count: toNumber(item.count)
    }));
  } catch (primaryError: unknown) {
    const errorMsg = String(primaryError);
    // Zone doesn't have access (plan limitation) — return empty gracefully
    if (errorMsg.includes("does not have access")) {
      return [];
    }

    // Try fallback with action-only query
    try {
      const actionOnlyQuery = `
        query SecurityGroupsFallback(
          $zoneTag: string!
          $startDateTime: Time!
          $endDateTimeExclusive: Time!
        ) {
          viewer {
            zones(filter: { zoneTag: $zoneTag }) {
              firewallEventsAdaptiveGroups(
                limit: 500
                filter: { datetime_geq: $startDateTime, datetime_lt: $endDateTimeExclusive }
              ) {
                count
                dimensions {
                  action
                }
              }
            }
          }
        }
      `;

      const actionOnlyData = await graphqlRequest<SecurityActionOnlyQueryResponse>(env, actionOnlyQuery, {
        zoneTag: zoneId,
        startDateTime,
        endDateTimeExclusive
      });
      const actionOnlyGroups = actionOnlyData.viewer?.zones?.[0]?.firewallEventsAdaptiveGroups ?? [];
      return actionOnlyGroups.map((item) => ({
        source: "unknown",
        action: item.dimensions?.action ?? "unknown",
        count: toNumber(item.count)
      }));
    } catch {
      // Both queries failed — return empty
      return [];
    }
  }
}
