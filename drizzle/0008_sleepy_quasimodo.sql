CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "rag_questions" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"embedding" vector(768) NOT NULL,
	"embedding_model" varchar(64) NOT NULL,
	"source" varchar(32) NOT NULL,
	"source_hash" varchar(64) NOT NULL,
	"source_url" text NOT NULL,
	"event_date" date NOT NULL,
	"question_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rag_questions_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE INDEX "rag_questions_embedding_hnsw_idx" ON "rag_questions" USING hnsw ("embedding" vector_cosine_ops);
