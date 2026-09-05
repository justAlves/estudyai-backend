CREATE TABLE "essays" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"contest_id" varchar(26) NOT NULL,
	"topic" varchar(500) NOT NULL,
	"essay_text" text,
	"file_name" varchar(255),
	"mime_type" varchar(120),
	"status" varchar(16) DEFAULT 'QUEUED' NOT NULL,
	"file_data" bytea,
	"analysis" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "essays" ADD CONSTRAINT "essays_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade;
CREATE TABLE "essay_generation_jobs" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"essay_id" varchar(26) NOT NULL UNIQUE,
	"status" varchar(16) DEFAULT 'QUEUED' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "essay_generation_jobs" ADD CONSTRAINT "essay_generation_jobs_essay_id_essays_id_fk" FOREIGN KEY ("essay_id") REFERENCES "public"."essays"("id") ON DELETE cascade;
