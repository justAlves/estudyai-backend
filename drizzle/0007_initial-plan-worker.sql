CREATE TABLE "plan_generation_jobs" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"contest_id" varchar(26) NOT NULL,
	"status" varchar(16) DEFAULT 'QUEUED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_generation_jobs_contest_id_unique" UNIQUE("contest_id")
);
--> statement-breakpoint
CREATE TABLE "study_tasks" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"contest_id" varchar(26) NOT NULL,
	"subject" varchar(120) NOT NULL,
	"type" varchar(16) NOT NULL,
	"title" varchar(200) NOT NULL,
	"estimated_minutes" integer NOT NULL,
	"scheduled_for" date NOT NULL,
	"status" varchar(16) DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_generation_jobs" ADD CONSTRAINT "plan_generation_jobs_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_tasks" ADD CONSTRAINT "study_tasks_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade ON UPDATE no action;