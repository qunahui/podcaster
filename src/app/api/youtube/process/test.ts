import prisma from '@/lib/prisma';
import { translateTranscript, synthesize_segment } from '@/lib/tts'; 
// ↑ Assume you have a function synthesize_segment(Segment) => Promise<string> 
// that calls Google TTS and returns a GCS URL.

import { getYoutubeId } from '@/utils/getYoutubeId';
import { NextRequest, NextResponse } from 'next/server';
import { YoutubeTranscript } from 'youtube-transcript';

// 1) Fetch the original English transcript from YouTube
const handleFetchTranscript = async (url: string) => {
  const videoId = YoutubeTranscript.retrieveVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL format');
  }

  const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
    lang: 'en',
  });
  const transcriptText = transcript.map((item) => item.text).join(' ');
  return transcriptText;
};

// 2) Split text into chunks ~480 bytes each
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

// 3) Placeholder for generating an M3U8. 
//    For now, just a skeleton returning a string. 
function generateM3U8(segments: Array<{ url: string; startTime: number; endTime: number }>): string {
  let m3u8Content = '#EXTM3U\n';
  segments.forEach((seg) => {
    const duration = seg.endTime - seg.startTime;
    m3u8Content += `#EXTINF:${duration.toFixed(2)},\n`;
    m3u8Content += `${seg.url}\n`;
  });
  m3u8Content += '#EXT-X-ENDLIST\n';
  return m3u8Content;
}

export const POST = async (req: NextRequest) => {
  const { url } = await req.json();

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'Invalid or missing YouTube URL' }, { status: 400 });
  }

  try {
    const videoId = getYoutubeId(url);
    
    // Check if a video record already exists
    const existingVideo = await prisma.video.findUnique({
      where: { youtubeVideoId: videoId },
      include: { segments: true },
    });

    // ---------------------------
    // If NOT FOUND => Fetch + Translate + Create
    // ---------------------------
    if (!existingVideo) {
      // 1) fetch original transcript
      const originalTranscript = await handleFetchTranscript(url);

      // 2) translate
      const translatedTranscript = await translateTranscript(originalTranscript);

      // 3) split
      const splitTranscript = splitText(translatedTranscript);

      // 4) create a new video + segments
      const createdVideo = await prisma.video.create({
        data: {
          youtubeVideoId: videoId,
          segments: {
            create: splitTranscript.map((t) => ({
              url: '',
              transcript: t,
              startTime: 0,
              endTime: 0,
              isProcessed: false, // We haven't generated audio yet
            })),
          },
        },
        include: { segments: true },
      });

      // Return combined transcript so user sees something
      return NextResponse.json({
        transcript: createdVideo.segments.map((s) => s.transcript).join(' '),
      });
    }

    // ---------------------------
    // ELSE => We have an existing video
    // ---------------------------
    // We'll do the new flow:
    // 1) Query segments
    // 2) Check processed segments
    // 3) If no processed => Synthesize first 5
    // 4) Return or handle M3U8
    // 5) Return transcript (or M3U8, up to you)
    // ---------------------------

    // 1) Query all segments for this video
    const segments = await prisma.segment.findMany({
      where: { videoId: existingVideo.id },
      orderBy: { id: 'asc' }, // example ordering
    });

    // 2) Filter "processed" segments
    const processedSegments = segments.filter((seg) => seg.isProcessed);

    // 3) If no processed segments, let's process the first 5
    if (processedSegments.length === 0) {
      const firstFive = segments.slice(0, 5);

      // For each segment we want to:
      //  - call synthesize_segment(...) => returns GCS URL
      //  - measure audio length (maybe you have a separate function or do it in `synthesize_segment`)
      //  - update DB with isProcessed=true, url, startTime/endTime
      // For now, we assume startTime/endTime are placeholders: you might set them sequentially or measure real durations. 
      let currentTime = 0; 
      for (const seg of firstFive) {
        const audioUrl = await synthesize_segment(seg);
        // Suppose we have a known or measured duration:
        const mockDuration = 10.0; // or get real duration from your /api/youtube/audio-length

        await prisma.segment.update({
          where: { id: seg.id },
          data: {
            url: audioUrl,
            isProcessed: true,
            startTime: currentTime,
            endTime: currentTime + mockDuration,
          },
        });

        currentTime += mockDuration;
      }
    }

    // 4) Now get all processed segments (including any we just processed)
    const updatedSegments = await prisma.segment.findMany({
      where: { videoId: existingVideo.id, isProcessed: true },
      orderBy: { id: 'asc' },
    });

    // If we have some processed segments, we can build M3U8. 
    // (We won't return the M3U8 in this example unless you want to. 
    //  For real usage, you might either store the M3U8 file or return the string.)
    let m3u8 = '';
    if (updatedSegments.length > 0) {
      m3u8 = generateM3U8(updatedSegments);
      // You might store `m3u8` in the DB or a bucket, or return it directly.
      // For demonstration, let's just console.log it.
      console.log('Generated M3U8:\n', m3u8);
    }

    // 5) Return whichever info you want
    //    For now, let's return the combined transcripts + note about .m3u8
    return NextResponse.json({
      transcript: updatedSegments.map((s) => s.transcript).join(' '),
      m3u8Snippet: m3u8 || 'No processed segments yet',
    });
  } catch (e: unknown) {
    console.error('======> ', e);
    return NextResponse.json({ error: 'Failed to process video' }, { status: 500 });
  }
};
