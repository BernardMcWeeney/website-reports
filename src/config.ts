export interface SiteConfig {
  clientId: string;
  zoneId: string;
  domain: string;
  pagespeedUrls: string[];
}

// MVP prototype: one hardcoded client/site.
export const SITE_CONFIG: SiteConfig = {
  clientId: "demo-client",
  zoneId: "d0b44ec1a3c28d4bc2e92312ceb0eb82",
  domain: "mounthanoverns.ie",
  pagespeedUrls: ["https://mounthanoverns.ie/"]
};
