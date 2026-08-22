CREATE TABLE "known_contest_subjects" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"contest_id" varchar(26) NOT NULL,
	"name" varchar(120) NOT NULL,
	CONSTRAINT "known_contest_subjects_contest_id_name_unique" UNIQUE("contest_id","name")
);
--> statement-breakpoint
CREATE TABLE "known_contests" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"normalized_name" varchar(160) NOT NULL,
	"examining_board" varchar(120),
	"notice_url" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "known_contests_normalized_name_unique" UNIQUE("normalized_name")
);
--> statement-breakpoint
ALTER TABLE "known_contest_subjects" ADD CONSTRAINT "known_contest_subjects_contest_id_known_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."known_contests"("id") ON DELETE cascade ON UPDATE no action;