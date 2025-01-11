-- CreateTable
CREATE TABLE "youtube_transcripts" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "youtube_transcripts_pkey" PRIMARY KEY ("id")
);
