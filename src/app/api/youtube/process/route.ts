import prisma from '@/lib/prisma';
import { translateTranscript, synthesize_segment } from '@/lib/tts';
import { getAudioDuration } from '@/lib/audio';
import { getYoutubeId } from '@/utils/getYoutubeId';
import { makePublicityGoogleCloudURL } from '@/utils/getPublicictyURL';
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

const generateM3U8 = (segments: Array<{ id: number; url: string; startTime: number; endTime: number }>): string => {
  let m3u8Content = '#EXTM3U\n';
  if (segments.length > 0) {
    m3u8Content += `#EXT-X-MEDIA-SEQUENCE:${segments[0].id}\n`;
  }
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
    return NextResponse.json(
      { error: 'Invalid or missing YouTube URL' },
      { status: 400 }
    );
  }

  try {
    //change const to let to change the value later
    let video = await prisma.video.findUnique({
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

      // return NextResponse.json(
      //   {
      //     transcript: createdVideo.segments
      //       .map((segment) => segment.transcript)
      //       .join(' '),
      //   },
      //   { status: 200 }
      // );

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
    console.log(processedSegments)

    // If none processed, let's TTS the first TOP_FIRST_SEGMENT = 5
    const TOP_FIRST_SEGMENT = 5
    if (processedSegments.length < TOP_FIRST_SEGMENT) {
      const firstFive = segments.slice(processedSegments.length, TOP_FIRST_SEGMENT);
      let currentTime = 0;

      for (const seg of firstFive) {
        // Synthesize => get GCS URL
        const audioUrl = await synthesize_segment(seg.transcript, seg.id.toString());

        const publicityAudioURL = makePublicityGoogleCloudURL(audioUrl)
        // Measure duration
        const duration = await getAudioDuration(publicityAudioURL);

        console.log('seg', seg)
        console.log('currentTime', currentTime)
        console.log('duration', duration)
        

        // Update DB
        await prisma.segment.update({
          where: { id: seg.id },
          data: {
            url: publicityAudioURL,
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

    // return NextResponse.json(
    //   {
    //     transcript: video.segments
    //       .map((segment) => segment.transcript)
    //       .join(' '),
    //   },
    //   { status: 200 }
    // );
  } catch (e: unknown) {
    console.log('======> ', e);
    return NextResponse.json(
      { error: 'Failed to process video' },
      { status: 500 }
    );
  }
};
