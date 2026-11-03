ALTER TABLE "fixtures" ADD COLUMN "lineups_tried_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN "link_attempts" integer DEFAULT 0 NOT NULL;