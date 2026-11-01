CREATE TABLE "app_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
-- Nothing blocks and no banner shows until the owner raises these in Neon. The download page is a placeholder until
-- the showcase page (#20) exists: set download_page_url to its address.
INSERT INTO "app_config" ("key", "value") VALUES
  ('min_app_version', '1.0.0'),
  ('latest_app_version', '1.0.0'),
  ('download_page_url', 'https://scorepulse.vercel.app')
ON CONFLICT ("key") DO NOTHING;
