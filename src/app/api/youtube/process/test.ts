import prisma from '@/lib/prisma';
import { getYoutubeId } from '@/utils/getYoutubeId';
import { translateTranscript, synthesize_segment } from '@/lib/tts';
import { getAudioDuration } from '@/lib/audio';
import { NextRequest, NextResponse } from 'next/server';
import { YoutubeTranscript } from 'youtube-transcript';

// 1) Fetch English transcript from YouTube
async function handleFetchTranscript(url: string) {
  const videoId = YoutubeTranscript.retrieveVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL format');
  }
  const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
    lang: 'en',
  });
  return transcript.map((item) => item.text).join(' ');
}

// 2) Split text into ~480-byte chunks
function splitText(text: string, maxBytes = 480): string[] {
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
}

// 3) Generate a basic M3U8 snippet from processed segments
function generateM3U8(
  segments: Array<{ url: string; startTime: number; endTime: number }>
): string {
  let m3u8 = '#EXTM3U\n';
  segments.forEach((seg) => {
    const duration = seg.endTime - seg.startTime;
    m3u8 += `#EXTINF:${duration.toFixed(2)},\n`;
    m3u8 += `${seg.url}\n`;
  });
  m3u8 += '#EXT-X-ENDLIST\n';
  return m3u8;
}

export const POST = async (req: NextRequest) => {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'Invalid or missing YouTube URL' },
        { status: 400 }
      );
    }

    const youtubeId = getYoutubeId(url);

    // 1) Attempt to find existing video
    let video = await prisma.video.findUnique({
      where: { youtubeVideoId: youtubeId },
      include: { segments: true },
    });

    // 2) If not found, create it
    if (!video) {
      // Fetch + translate
      const originalTranscript = await handleFetchTranscript(url);
      const translatedTranscript = await translateTranscript(originalTranscript);

      // Split into smaller chunks
      const splitTranscript = splitText(translatedTranscript);

      // Create new video + segments (all isProcessed = false)
      const createdVideo = await prisma.video.create({
        data: {
          youtubeVideoId: youtubeId,
          segments: {
            create: splitTranscript.map((t) => ({
              transcript: t,
              url: '',
              startTime: 0,
              endTime: 0,
              isProcessed: false,
            })),
          },
        },
        include: { segments: true },
      });

      // Now treat it the same as an "existing" video
      video = createdVideo;
    }

    // ----------------------------------------------------
    // From here on, we have a valid `video` record
    // ----------------------------------------------------

    // Re-fetch segments to ensure we have the latest data
    // (or we could use video.segments if we included them above)
    const segments = await prisma.segment.findMany({
      where: { videoId: video.id },
      orderBy: { id: 'asc' },
    });

    // Filter processed
    const processedSegments = segments.filter((seg) => seg.isProcessed);

    // If none processed, let's TTS the first 5
    if (processedSegments.length === 0) {
      const firstFive = segments.slice(0, 5);
      let currentTime = 0;

      for (const seg of firstFive) {
        // Synthesize => get GCS URL
        const audioUrl = await synthesize_segment(seg.transcript, seg.toString());

        // Measure duration
        const duration = await getAudioDuration(audioUrl);

        // Update DB
        await prisma.segment.update({
          where: { id: seg.id },
          data: {
            url: audioUrl,
            isProcessed: true,
            startTime: currentTime,
            endTime: currentTime + duration,
          },
        });

        currentTime += duration;
      }
    }

    // Now gather processed segments again
    const updatedProcessedSegments = await prisma.segment.findMany({
      where: { videoId: video.id, isProcessed: true },
      orderBy: { id: 'asc' },
    });

    console.log(updatedProcessedSegments)

    // Build M3U8 if we have any processed segments
    let m3u8Snippet = '';
    if (updatedProcessedSegments.length > 0) {
      m3u8Snippet = generateM3U8(updatedProcessedSegments);
      console.log('Generated M3U8:\n', m3u8Snippet);
    }

    // Return combined transcripts (only from processed ones?) + M3U8 snippet
    const combinedTranscript = updatedProcessedSegments
      .map((s) => s.transcript)
      .join(' ');

    return NextResponse.json({
      transcript: combinedTranscript,
      m3u8Snippet: m3u8Snippet || 'No processed segments yet',
    });
  } catch (err: any) {
    console.error('Error in POST handler:', err);
    return NextResponse.json(
      { error: 'Failed to process video' },
      { status: 500 }
    );
  }
};
