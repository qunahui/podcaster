import { getAudioDuration } from '@/lib/audio';
import prisma from '@/lib/prisma';
import { synthesize_segment } from '@/lib/tts';
import { getYoutubeId } from '@/utils/getYoutubeId';
import { NextResponse } from 'next/server';

const DEBUG_PREFIX = '🎵 [NEXT-SEGMENTS]';

// Helper function to convert segment to proxied URL
function getProxiedUrl(segment: { url: string; id: number }): string {
  // Ensure we have a full URL with domain
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';

  // For server-side, we need to use an absolute URL
  // In Next.js API routes, we're always on the server side
  const host = process.env.VERCEL_URL || process.env.HOST || 'localhost:3000';
  const protocol = host.startsWith('localhost') ? 'http' : 'https';
  const fullBaseUrl = baseUrl || `${protocol}://${host}`;

  // Use segment ID instead of direct URL to ensure we always go through the proxy
  return `${fullBaseUrl}/api/youtube/audio-proxy?segmentId=${segment.id}`;
}

const generateM3U8 = (
  segments: Array<{
    id: number;
    url: string;
    startTime: number;
    endTime: number;
  }>,
  allSegmentsProcessed: boolean = false
): string => {
  let m3u8Content = '#EXTM3U\n';
  m3u8Content += '#EXT-X-VERSION:3\n';
  m3u8Content += '#EXT-X-ALLOW-CACHE:NO\n'; // Prevent caching
  m3u8Content += '#EXT-X-PLAYLIST-TYPE:EVENT\n'; // Allow updates
  m3u8Content += '#EXT-X-TARGETDURATION:30\n';
  // Use the first segment's ID as the media sequence number
  if (segments.length > 0) {
    m3u8Content += `#EXT-X-MEDIA-SEQUENCE:${segments[0].id}\n`;
  } else {
    m3u8Content += '#EXT-X-MEDIA-SEQUENCE:0\n';
  }

  segments.forEach((seg) => {
    const duration = seg.endTime - seg.startTime;
    const proxiedUrl = getProxiedUrl({
      url: seg.url,
      id: seg.id,
    });

    m3u8Content += `#EXTINF:${duration.toFixed(2)},\n`;
    m3u8Content += `${proxiedUrl}\n`;
  });

  // Only add ENDLIST if all segments are processed
  if (allSegmentsProcessed) {
    m3u8Content += '#EXT-X-ENDLIST\n';
  }

  return m3u8Content;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { videoId, currentTimestamp, count = 5 } = body;

    if (!videoId) {
      console.error(`${DEBUG_PREFIX} No video ID provided`);
      return new NextResponse('Video ID is required', { status: 400 });
    }

    console.log(`${DEBUG_PREFIX} Processing next segments:`, {
      videoId,
      currentTimestamp,
      count,
    });

    const youtubeId = getYoutubeId(videoId);

    // Find the video and all its segments
    const video = await prisma.video.findUnique({
      where: { youtubeVideoId: youtubeId },
      include: {
        segments: {
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!video) {
      console.error(
        `${DEBUG_PREFIX} Video not found, triggering initial processing:`,
        youtubeId
      );

      // Instead of returning 404, trigger initial processing
      try {
        // Call the process endpoint to create and start processing the video
        const processResponse = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/youtube/process`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: videoId }),
          }
        );

        if (!processResponse.ok) {
          throw new Error(
            `Failed to process video: ${processResponse.statusText}`
          );
        }

        const processResult = await processResponse.json();

        return new NextResponse(
          JSON.stringify({
            success: true,
            message: 'Video created and initial segments processed',
            initialProcessing: true,
            processResult,
          }),
          {
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      } catch (error) {
        console.error(
          `${DEBUG_PREFIX} Error triggering initial processing:`,
          error
        );
        return new NextResponse('Video not found and processing failed', {
          status: 500,
        });
      }
    }

    // Get all segments and filter processed ones
    const segments = video.segments;
    const processedSegments = segments.filter((seg) => seg.isProcessed);
    console.log(
      `${DEBUG_PREFIX} Found ${processedSegments.length} processed segments`
    );

    // Get unprocessed segments
    const unprocessedSegments = segments.filter((seg) => !seg.isProcessed);
    const nextSegmentsToProcess = unprocessedSegments.slice(0, count);
    console.log(
      `${DEBUG_PREFIX} Will process next ${nextSegmentsToProcess.length} segments`
    );

    // Get the last processed segment's end time to use as starting point
    const lastProcessedSegment =
      processedSegments[processedSegments.length - 1];
    let currentTime = lastProcessedSegment ? lastProcessedSegment.endTime : 0;

    // Process the next batch of segments
    for (const segment of nextSegmentsToProcess) {
      try {
        console.log(
          `Processing segment ${segment.id} with transcript: "${segment.transcript.substring(0, 50)}..."`
        );

        // Synthesize => get URL
        let audioUrl;
        try {
          audioUrl = await synthesize_segment(
            segment.transcript,
            segment.id.toString()
          );

          // Extra safety check - ensure we have a valid URL
          if (!audioUrl) {
            throw new Error('Received empty audio URL from TTS service');
          }

          if (!audioUrl.startsWith('http')) {
            throw new Error(`Invalid audio URL format: ${audioUrl}`);
          }

          console.log(`Got audio URL for segment ${segment.id}: ${audioUrl}`);
        } catch (ttsError) {
          console.error(`TTS error for segment ${segment.id}:`, ttsError);
          throw ttsError;
        }

        // Measure duration with proper error handling
        let duration;
        try {
          duration = await getAudioDuration(audioUrl);

          if (!duration || isNaN(duration) || duration <= 0) {
            throw new Error(`Invalid duration: ${duration}`);
          }

          console.log(`Got duration for segment ${segment.id}: ${duration}s`);
        } catch (durationError) {
          console.error(
            `Duration measurement error for segment ${segment.id}:`,
            durationError
          );
          throw durationError;
        }

        // Update DB with all the verified data
        await prisma.segment.update({
          where: { id: segment.id },
          data: {
            url: audioUrl,
            isProcessed: true,
            startTime: currentTime,
            endTime: currentTime + duration,
          },
        });

        console.log(`Updated segment in database:`, {
          id: segment.id,
          startTime: currentTime,
          endTime: currentTime + duration,
          url: audioUrl,
        });

        currentTime += duration;
      } catch (error) {
        console.error(`Error processing segment ${segment.id}:`, error);
        // Continue with next segment instead of failing the entire batch
        continue;
      }
    }

    // Get all processed segments again to generate updated M3U8
    const updatedProcessedSegments = await prisma.segment.findMany({
      where: {
        videoId: video.id,
        isProcessed: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    // Check if all segments are processed
    const totalSegmentsCount = await prisma.segment.count({
      where: { videoId: video.id },
    });

    const allSegmentsProcessed =
      updatedProcessedSegments.length === totalSegmentsCount;

    // Generate new M3U8 with all processed segments
    const m3u8Content = generateM3U8(
      updatedProcessedSegments,
      allSegmentsProcessed
    );

    // If all segments are processed, update the video's processedIndexCharacter to indicate completion
    if (allSegmentsProcessed && updatedProcessedSegments.length > 0) {
      await prisma.video.update({
        where: { id: video.id },
        data: {
          processedIndexCharacter: totalSegmentsCount,
        },
      });

      console.log(
        `${DEBUG_PREFIX} All segments processed, updated video status`
      );
    }

    return new NextResponse(
      JSON.stringify({
        success: true,
        message: `Processed ${nextSegmentsToProcess.length} segments`,
        processedSegments: updatedProcessedSegments.length,
        totalSegments: totalSegmentsCount,
        allSegmentsProcessed,
        segments: updatedProcessedSegments,
        m3u8Content,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error(`${DEBUG_PREFIX} Error processing next segments:`, error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
