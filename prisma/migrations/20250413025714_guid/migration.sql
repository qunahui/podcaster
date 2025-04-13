/*
  Warnings:

  - You are about to drop the `segments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `videos` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "segments" DROP CONSTRAINT "segments_videoId_fkey";

-- DropTable
DROP TABLE "segments";

-- DropTable
DROP TABLE "videos";

-- CreateTable
CREATE TABLE "Video" (
    "id" UUID NOT NULL,
    "youtubeVideoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedIndexCharacter" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" UUID NOT NULL,
    "videoId" UUID NOT NULL,
    "startTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "endTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transcript" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Video_youtubeVideoId_key" ON "Video"("youtubeVideoId");

-- CreateIndex
CREATE INDEX "Segment_videoId_idx" ON "Segment"("videoId");

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
