-- AlterTable: add nullable generationConditions column to Post
-- Safe additive change — existing rows default to NULL
ALTER TABLE "Post" ADD COLUMN "generationConditions" TEXT;
