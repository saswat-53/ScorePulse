ALTER TABLE "fixtures" ADD COLUMN "score_alert_due" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN "uncovered_goals" integer DEFAULT 0 NOT NULL;