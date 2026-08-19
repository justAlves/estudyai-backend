CREATE TABLE "study_activity_attempts" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"task_id" varchar(26) NOT NULL,
	"answers" jsonb NOT NULL,
	"score" integer NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_activity_attempts_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
ALTER TABLE "study_materials" ADD COLUMN "activities" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "study_activity_attempts" ADD CONSTRAINT "study_activity_attempts_task_id_study_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."study_tasks"("id") ON DELETE cascade ON UPDATE no action;