CREATE TYPE "public"."theme" AS ENUM('rose', 'rose-dark', 'ink', 'forest', 'cobalt', 'court');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme" "theme" DEFAULT 'rose' NOT NULL;