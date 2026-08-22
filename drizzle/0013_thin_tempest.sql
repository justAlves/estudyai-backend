CREATE TABLE "rag_syllabus_chunks" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"contest_name" varchar(160) NOT NULL,
	"normalized_contest_name" varchar(160) NOT NULL,
	"subject" varchar(120) NOT NULL,
	"content" text NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"embedding" vector(768) NOT NULL,
	"embedding_model" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rag_syllabus_chunks_content_unique" UNIQUE("normalized_contest_name","subject","content_hash")
);
--> statement-breakpoint
CREATE INDEX "rag_syllabus_chunks_contest_idx" ON "rag_syllabus_chunks" USING btree ("normalized_contest_name");
--> statement-breakpoint
CREATE INDEX "rag_syllabus_chunks_embedding_hnsw_idx" ON "rag_syllabus_chunks" USING hnsw ("embedding" vector_cosine_ops);
