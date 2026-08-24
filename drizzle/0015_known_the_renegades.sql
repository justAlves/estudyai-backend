CREATE TABLE "contest_notice_documents" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"contest_id" varchar(26) NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"status" varchar(16) DEFAULT 'RECEIVED' NOT NULL,
	"extracted_text" text,
	"subjects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contest_notice_documents_contest_id_unique" UNIQUE("contest_id"),
	CONSTRAINT "contest_notice_documents_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
ALTER TABLE "contest_notice_documents" ADD CONSTRAINT "contest_notice_documents_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade ON UPDATE no action;