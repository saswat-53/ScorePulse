CREATE TABLE "fixture_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"fixture_id" integer NOT NULL,
	"elapsed" integer NOT NULL,
	"extra" integer,
	"team_id" integer NOT NULL,
	"player_id" integer,
	"type" text NOT NULL,
	"detail" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fixtures" (
	"id" serial PRIMARY KEY NOT NULL,
	"api_football_id" integer,
	"football_data_id" integer,
	"league_id" integer NOT NULL,
	"home_team_id" integer NOT NULL,
	"away_team_id" integer NOT NULL,
	"kickoff" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"home_goals" integer,
	"away_goals" integer,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fixtures_api_football_id_unique" UNIQUE("api_football_id"),
	CONSTRAINT "fixtures_football_data_id_unique" UNIQUE("football_data_id")
);
--> statement-breakpoint
CREATE TABLE "notification_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"event_key" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_state" (
	"id" text PRIMARY KEY NOT NULL,
	"last_polled_at" timestamp with time zone,
	"requests_today" integer DEFAULT 0 NOT NULL,
	"quota_day" date
);
--> statement-breakpoint
ALTER TABLE "fixture_events" ADD CONSTRAINT "fixture_events_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;