ALTER TABLE "users" ADD COLUMN "onboarding_preferences" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_completed_at" timestamp with time zone;