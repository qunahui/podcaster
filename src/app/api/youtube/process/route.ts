import prisma from '@/lib/prisma';
import { translateTranscript } from '@/lib/tts';
import { getYoutubeId } from '@/utils/getYoutubeId';
import { NextRequest, NextResponse } from 'next/server';
import { YoutubeTranscript } from 'youtube-transcript';

const handleFetchTranscript = async (url: string) => {
  const videoId = YoutubeTranscript['retrieveVideoId'](url);

  if (!videoId) {
    throw new Error('Invalid YouTube URL format');
  }

  const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
    lang: 'en',
  });

  const transcriptText = transcript.map((item) => item.text).join(' ');

  return transcriptText;
};

const splitText = (text: string, maxBytes: number = 480): string[] => {
  const delimiters = /([.,!?;:\n]+)/;

  const parts = text.split(delimiters);

  const chunks: string[] = [];
  let chunk = '';

  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i].trim();
    const delimiter = i + 1 < parts.length ? parts[i + 1] : '';

    if (Buffer.byteLength(chunk + sentence + delimiter, 'utf-8') <= maxBytes) {
      chunk += sentence + delimiter + ' ';
    } else {
      chunks.push(chunk.trim());
      chunk = sentence + delimiter + ' ';
    }
  }

  if (chunk.trim()) {
    chunks.push(chunk.trim());
  }

  return chunks;
};

export const POST = async (req: NextRequest) => {
  const { url } = await req.json();

  if (!url || typeof url !== 'string') {
    return NextResponse.json(
      { error: 'Invalid or missing YouTube URL' },
      { status: 400 }
    );
  }

  try {
    const video = await prisma.video.findUnique({
      where: { youtubeVideoId: getYoutubeId(url) },
      include: {
        segments: true,
      },
    });

    if (!video) {
      const originalTranscript = await handleFetchTranscript(url);

      const translatedTranscript =
        await translateTranscript(originalTranscript);

      const splitTranscript = splitText(translatedTranscript);

      const createdVideo = await prisma.video.create({
        data: {
          youtubeVideoId: getYoutubeId(url),
          segments: {
            create: splitTranscript.map((transcript) => ({
              url: '',
              transcript,
              startTime: 0,
              endTime: 0,
            })),
          },
        },
        include: {
          segments: true,
        },
      });

      return NextResponse.json(
        {
          transcript: createdVideo.segments
            .map((segment) => segment.transcript)
            .join(' '),
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        transcript: video.segments
          .map((segment) => segment.transcript)
          .join(' '),
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    console.log('======> ', e);
    return NextResponse.json(
      { error: 'Failed to process video' },
      { status: 500 }
    );
  }
};
