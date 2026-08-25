CREATE TABLE "simulations" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"contest_id" varchar(26) NOT NULL,
	"question_count" integer NOT NULL,
	"subjects" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'QUEUED' NOT NULL,
	"score" integer,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "simulation_questions" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"simulation_id" varchar(26) NOT NULL,
	"position" integer NOT NULL,
	"subject" varchar(120) NOT NULL,
	"statement" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_option" integer NOT NULL,
	"explanation" text NOT NULL,
	"difficulty" varchar(16) DEFAULT 'MEDIUM' NOT NULL,
	CONSTRAINT "simulation_questions_simulation_id_position_unique" UNIQUE("simulation_id","position")
);
--> statement-breakpoint
CREATE TABLE "simulation_answers" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"simulation_id" varchar(26) NOT NULL,
	"question_id" varchar(26) NOT NULL,
	"selected_option" integer,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "simulation_answers_simulation_id_question_id_unique" UNIQUE("simulation_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "simulation_generation_jobs" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"simulation_id" varchar(26) NOT NULL,
	"status" varchar(16) DEFAULT 'QUEUED' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"error_message" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "simulation_generation_jobs_simulation_id_unique" UNIQUE("simulation_id")
);
--> statement-breakpoint
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_questions" ADD CONSTRAINT "simulation_questions_simulation_id_simulations_id_fk" FOREIGN KEY ("simulation_id") REFERENCES "public"."simulations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_answers" ADD CONSTRAINT "simulation_answers_simulation_id_simulations_id_fk" FOREIGN KEY ("simulation_id") REFERENCES "public"."simulations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_answers" ADD CONSTRAINT "simulation_answers_question_id_simulation_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."simulation_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "simulation_generation_jobs" ADD CONSTRAINT "simulation_generation_jobs_simulation_id_simulations_id_fk" FOREIGN KEY ("simulation_id") REFERENCES "public"."simulations"("id") ON DELETE cascade ON UPDATE no action;