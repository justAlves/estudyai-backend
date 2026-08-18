CREATE TABLE "contests" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"user_id" varchar(26) NOT NULL,
	"name" varchar(160) NOT NULL,
	"examining_board" varchar(120) NOT NULL,
	"exam_date" date NOT NULL,
	"is_popular" boolean DEFAULT false NOT NULL,
	"notice_url" text,
	"notice_imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contest_support_subjects" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"contest_id" varchar(26) NOT NULL,
	"name" varchar(120) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contests" ADD CONSTRAINT "contests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_support_subjects" ADD CONSTRAINT "contest_support_subjects_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade ON UPDATE no action;