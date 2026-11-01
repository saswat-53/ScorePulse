CREATE TABLE "fixture_lineups" (
	"id" serial PRIMARY KEY NOT NULL,
	"fixture_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"formation" text,
	"coach" text,
	"starters" jsonb NOT NULL,
	"substitutes" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fixture_lineups_fixture_team" UNIQUE("fixture_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "fixture_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"fixture_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"stats" jsonb NOT NULL,
	"phase" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fixture_stats_fixture_team" UNIQUE("fixture_id","team_id")
);
--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN "lineups_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN "stats_ht_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fixtures" ADD COLUMN "stats_ft_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fixture_lineups" ADD CONSTRAINT "fixture_lineups_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixture_stats" ADD CONSTRAINT "fixture_stats_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE cascade ON UPDATE no action;