/*
  Warnings:

  - The primary key for the `segments` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `segments` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `videos` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `videos` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `youtube_transcripts` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `youtube_transcripts` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `videoId` on the `segments` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `transcript` on the `segments` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "segments" DROP CONSTRAINT "segments_videoId_fkey";

-- AlterTable
ALTER TABLE "segments" DROP CONSTRAINT "segments_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
DROP COLUMN "videoId",
ADD COLUMN     "videoId" UUID NOT NULL,
DROP COLUMN "transcript",
ADD COLUMN     "transcript" UUID NOT NULL,
ADD CONSTRAINT "segments_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "videos" DROP CONSTRAINT "videos_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD CONSTRAINT "videos_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "youtube_transcripts" DROP CONSTRAINT "youtube_transcripts_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ADD CONSTRAINT "youtube_transcripts_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "segments_videoId_idx" ON "segments"("videoId");

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
