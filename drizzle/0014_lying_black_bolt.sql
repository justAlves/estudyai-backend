CREATE TABLE "study_assessments" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"contest_id" varchar(26) NOT NULL,
	"subject" varchar(120) NOT NULL,
	"type" varchar(16) NOT NULL,
	"score" integer NOT NULL,
	"total" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_assessments" ADD CONSTRAINT "study_assessments_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade ON UPDATE no action;