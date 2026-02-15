export interface SiteConfig {
  clientId: string;
  zoneId: string;
  domain: string;
  pagespeedUrls: string[];
}

// MVP prototype: one hardcoded client/site.
export const SITE_CONFIG: SiteConfig = {
  clientId: "demo-client",
  zoneId: "REPLACE_WITH_ZONE_ID",
  domain: "example.com",
  pagespeedUrls: ["https://example.com/"]
};
