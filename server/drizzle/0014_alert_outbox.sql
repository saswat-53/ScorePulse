ALTER TABLE "fixture_events" ADD COLUMN "alert_state" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "fixture_events" ADD COLUMN "correction_due" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_log" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_log" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "notification_log" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_log" ADD COLUMN "delivered_to" jsonb DEFAULT '[]'::jsonb NOT NULL;