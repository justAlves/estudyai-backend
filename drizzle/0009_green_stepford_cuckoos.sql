CREATE TABLE "study_materials" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"task_id" varchar(26) NOT NULL,
	"content" text NOT NULL,
	"sources" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_materials_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
CREATE TABLE "material_generation_jobs" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"task_id" varchar(26) NOT NULL,
	"status" varchar(16) DEFAULT 'QUEUED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_generation_jobs_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
ALTER TABLE "study_materials" ADD CONSTRAINT "study_materials_task_id_study_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."study_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_generation_jobs" ADD CONSTRAINT "material_generation_jobs_task_id_study_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."study_tasks"("id") ON DELETE cascade ON UPDATE no action;