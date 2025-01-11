/*
  Warnings:

  - You are about to drop the column `transcript` on the `videos` table. All the data in the column will be lost.
  - Added the required column `transcript` to the `segments` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "segments" ADD COLUMN     "isProcessed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "transcript" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "videos" DROP COLUMN "transcript";
