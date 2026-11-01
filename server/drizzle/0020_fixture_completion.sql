ALTER TABLE "fixtures" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN "completion_attempts" integer DEFAULT 0 NOT NULL;