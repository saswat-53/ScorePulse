ALTER TABLE "fixture_events" ADD COLUMN "missing_polls" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fixture_events" ADD COLUMN "removed_at" timestamp with time zone;