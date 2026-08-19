ALTER TABLE "contests" ADD COLUMN "daily_study_minutes" integer DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE "contests" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;