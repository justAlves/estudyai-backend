CREATE TABLE "launch_leads" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"phone" varchar(14) NOT NULL,
	"wants_notification" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "launch_leads_phone_unique" UNIQUE("phone")
);
