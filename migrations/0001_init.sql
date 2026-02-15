CREATE TABLE IF NOT EXISTS monthly_reports (
  client_id TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  report_month TEXT NOT NULL,
  timezone TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  r2_html_key TEXT NOT NULL,
  r2_pdf_key TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  PRIMARY KEY (client_id, report_month)
);
