ALTER TABLE "team_map" ADD COLUMN "short_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "team_map" ADD COLUMN "code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "team_map" ADD COLUMN "crest_url" text;