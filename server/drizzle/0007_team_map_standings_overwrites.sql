CREATE TABLE "fixture_overwrites" (
	"id" serial PRIMARY KEY NOT NULL,
	"fixture_id" integer NOT NULL,
	"old_home_goals" integer,
	"old_away_goals" integer,
	"new_home_goals" integer,
	"new_away_goals" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standings" (
	"id" serial PRIMARY KEY NOT NULL,
	"competition" text NOT NULL,
	"season" integer NOT NULL,
	"team_id" integer NOT NULL,
	"team_name" text NOT NULL,
	"position" integer NOT NULL,
	"played" integer NOT NULL,
	"won" integer NOT NULL,
	"drawn" integer NOT NULL,
	"lost" integer NOT NULL,
	"goals_for" integer NOT NULL,
	"goals_against" integer NOT NULL,
	"points" integer NOT NULL,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "standings_competition_season_team" UNIQUE("competition","season","team_id")
);
--> statement-breakpoint
CREATE TABLE "team_map" (
	"id" serial PRIMARY KEY NOT NULL,
	"football_data_id" integer NOT NULL,
	"api_football_id" integer NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "team_map_football_data_id_unique" UNIQUE("football_data_id"),
	CONSTRAINT "team_map_api_football_id_unique" UNIQUE("api_football_id")
);
--> statement-breakpoint
ALTER TABLE "fixture_overwrites" ADD CONSTRAINT "fixture_overwrites_fixture_id_fixtures_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."fixtures"("id") ON DELETE cascade ON UPDATE no action;