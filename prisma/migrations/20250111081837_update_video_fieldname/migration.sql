/*
  Warnings:

  - You are about to drop the column `fullTranscript` on the `videos` table. All the data in the column will be lost.
  - Added the required column `transcript` to the `videos` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "videos" DROP COLUMN "fullTranscript",
ADD COLUMN     "transcript" TEXT NOT NULL;
