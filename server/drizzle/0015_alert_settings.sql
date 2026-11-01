ALTER TABLE "fixtures" ADD COLUMN "kickoff_alert_due" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN "full_time_alert_due" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "alert_goals" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "alert_cards" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "alert_substitutions" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "alert_kickoff" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "alert_full_time" boolean DEFAULT true NOT NULL;